import wasmUrl from './color-components.wasm?url';
import type { ColorBlob, ColorComponentsBackend, ColorRegion } from './ColorWandDetector';

type Kernel = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  imagePointer(): number;
  resultPointer(): number;
  setPinkGreen(enabled: number): void;
  setInputFormat(format: number): void;
  scan(w: number, h: number, x0: number, y0: number, x1: number, y1: number): number;
};

/** Opt-in scalar WASM backend. One reused buffer + one bulk copy per image,
 * never one JS/WASM call per pixel. Each instance owns its color profile. */
export class WasmColorComponents implements ColorComponentsBackend {
  private readonly pixels: Uint8Array;
  private readonly blobs: Float64Array;
  private width = 0;
  private height = 0;
  private framePixels: Uint8Array<ArrayBuffer> | undefined;

  constructor(private readonly kernel: Kernel,private readonly pinkGreen=false) {
    this.pixels = new Uint8Array(kernel.memory.buffer, kernel.imagePointer(), 640 * 480 * 4);
    this.blobs = new Float64Array(kernel.memory.buffer, kernel.resultPointer(), 24 * 6);
  }

  static async create(bytes?: BufferSource, pinkGreen = false): Promise<WasmColorComponents> {
    // arrayBuffer also works on hosts without a configured application/wasm MIME.
    const response = bytes ? null : await fetch(wasmUrl, { signal: AbortSignal.timeout(2000) });
    if (response && !response.ok) throw new Error(`Wand WASM: HTTP ${response.status}`);
    const { instance } = await WebAssembly.instantiate(bytes ?? await response!.arrayBuffer(), {});
    const kernel = instance.exports as Kernel;
    kernel.setPinkGreen(pinkGreen ? 1 : 0);
    return new WasmColorComponents(kernel,pinkGreen);
  }

  prepare(rgba: Uint8ClampedArray, width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width * height > 640 * 480 || rgba.length !== width * height * 4) throw new RangeError('Invalid wand image');
    this.width = width; this.height = height;
    this.kernel.setInputFormat(0);
    this.pixels.set(rgba);
  }

  /** Fill linear memory directly, preserving the native Apple camera planes.
   * Only understood colour metadata qualifies; other formats use browser RGBA.
   * No resolution reduction, extra camera, full-frame RGB materialization or queue. */
  async readVideoFrame(frame: VideoFrame, native = true): Promise<'nv12' | 'bgra' | 'rgba'> {
    const rect = frame.visibleRect, w = rect?.width ?? 0, h = rect?.height ?? 0;
    const transformed = frame as VideoFrame & { rotation?: number; flip?: boolean };
    if (!rect || w < 8 || h < 8 || w * h > 640 * 480 || w !== frame.displayWidth || h !== frame.displayHeight
      || transformed.rotation || transformed.flip) throw new RangeError('Unsupported video geometry');
    const cs = frame.colorSpace;
    const nv12 = native && frame.format === 'NV12' && !(w % 2 || h % 2 || rect.x % 2 || rect.y % 2)
      && cs?.matrix === 'bt709' && cs.primaries === 'bt709'
      && (cs.transfer === 'bt709' || cs.transfer === 'iec61966-2-1') && typeof cs.fullRange === 'boolean';
    // BGRA is accepted natively only when already in sRGB; do not silently
    // skip wide-gamut/HDR or matrix conversions on other cameras.
    const bgra = native && frame.format === 'BGRA' && cs?.matrix === 'rgb'
      && cs.primaries === 'bt709' && cs.transfer === 'iec61966-2-1';
    const options: VideoFrameCopyToOptions = nv12
      ? { rect, layout: [{offset: 0, stride: w}, {offset: w * h, stride: w}] }
      : bgra ? { rect, layout: [{offset: 0, stride: w * 4}] }
      : { rect, format: 'RGBA', layout: [{offset: 0, stride: w * 4}] };
    const size = frame.allocationSize(options), expected = nv12 ? w * h * 1.5 : w * h * 4;
    if (size !== expected) throw new RangeError('Unexpected video plane layout');
    if (this.framePixels?.length !== size) this.framePixels = new Uint8Array(this.kernel.memory.buffer, this.kernel.imagePointer(), size);
    await frame.copyTo(this.framePixels, options);
    this.width = w; this.height = h;
    this.kernel.setInputFormat(nv12 ? cs.fullRange ? 3 : 2 : bgra ? 1 : 0);
    return nv12 ? 'nv12' : bgra ? 'bgra' : 'rgba';
  }

  components(r: ColorRegion): [ColorBlob[], ColorBlob[]] {
    if (![r.x0, r.y0, r.x1, r.y1].every(Number.isInteger) || r.x0 < 0 || r.y0 < 0
      || r.x1 > this.width || r.y1 > this.height || r.x1 <= r.x0 || r.y1 <= r.y0) return [[], []];
    const counts = this.kernel.scan(this.width, this.height, r.x0, r.y0, r.x1, r.y1);
    const result: [ColorBlob[], ColorBlob[]] = [[], []];
    if (counts < 0) return result;
    for (let color = 0; color < 2; color++) for (let i = 0; i < ((counts >> (color * 8)) & 255); i++) {
      const offset = (color * 12 + i) * 6;
      result[color].push({ x: this.blobs[offset], y: this.blobs[offset + 1], area: this.blobs[offset + 2],
        ...(this.pinkGreen?{moments:{xx:this.blobs[offset+3],xy:this.blobs[offset+4],yy:this.blobs[offset+5]}}:{}) });
    }
    return result;
  }
}
