import { FourRingWandDetector } from './FourRingWandDetector';
import { WasmColorComponents } from './WasmColorComponents';
let backend = 'JavaScript';
let wasmComponents: WasmColorComponents | undefined;
// Compile once before processing the first image; no mid-track state reset.
// Unsupported WASM / failed asset loading preserves the tested JS path.
const ready = WasmColorComponents.create(undefined, true).then(components => {
  backend = 'WASM'; wasmComponents = components; return new FourRingWandDetector(components);
}).catch(() => new FourRingWandDetector());
const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true })!;
let directPixels = new Uint8ClampedArray(0);
self.onmessage = async (event: MessageEvent<{ bitmap?: ImageBitmap; frame?: VideoFrame; timestampMs: number; nativePixels?: boolean }>) => {
  const { bitmap, frame, timestampMs, nativePixels = true } = event.data;
  try {
    const detector = await ready;
    const start = performance.now();
    let pixels: Uint8ClampedArray, width: number, height: number, transport = 'bitmap-canvas';
    let prepared = false;
    if (frame) {
      // WebCodecs avoids ImageBitmap -> canvas draw/readback synchronization.
      // copyTo still copies/converts pixels; it is NOT zero-copy or sensor time.
      try {
        width = frame.visibleRect!.width; height = frame.visibleRect!.height;
        if (width !== frame.displayWidth || height !== frame.displayHeight) throw new Error('Non-square pixels or transformed frame');
        if (wasmComponents) {
          let format: string;
          try { format = await wasmComponents.readVideoFrame(frame, nativePixels); }
          catch { format = await wasmComponents.readVideoFrame(frame, false); }
          prepared = true;
          transport = `videoframe-${format}-wasm`;
        } else {
        const options: VideoFrameCopyToOptions = { format: 'RGBA', layout: [{ offset: 0, stride: width * 4 }] };
        const size = frame.allocationSize(options);
        if (size > 640 * 480 * 4) throw new Error('Frame too large');
        if (directPixels.length !== size) directPixels = new Uint8ClampedArray(size);
        await frame.copyTo(directPixels, options);
        pixels = directPixels; transport = 'videoframe-copy';
        }
      } catch {
        // Some engines expose VideoFrame but not RGBA copyTo. Fall back on the
        // SAME image, then let the main thread use bitmaps on subsequent frames.
        const scale = Math.min(1, 320 / frame.displayWidth, 240 / frame.displayHeight);
        width = Math.round(frame.displayWidth * scale); height = Math.round(frame.displayHeight * scale);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        context.drawImage(frame, 0, 0, width, height);
        pixels = context.getImageData(0, 0, width, height).data;
        transport = 'videoframe-fallback';
      }
    } else {
      if (!bitmap) throw new Error('Missing image');
      width = bitmap.width; height = bitmap.height;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.drawImage(bitmap, 0, 0);
      pixels = context.getImageData(0, 0, width, height).data;
    }
    const readbackMs = performance.now() - start;
    const result = prepared ? detector.detectPrepared(width, height, timestampMs) : detector.detect(pixels!, width, height, timestampMs);
    self.postMessage({ ...result, timestampMs, readbackMs, transport, backend, processingMs: performance.now() - start });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Sword worker error' });
  } finally { bitmap?.close(); frame?.close(); }
};
