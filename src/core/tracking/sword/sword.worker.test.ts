import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const binary = readFileSync(new URL('./color-components.wasm', import.meta.url));

describe('sword worker pixels and ownership', () => {
  let endpoint: { onmessage: ((e: { data: unknown }) => Promise<void>) | null; postMessage: ReturnType<typeof vi.fn> };
  let draw: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules(); endpoint = { onmessage: null, postMessage: vi.fn() }; draw = vi.fn();
    vi.stubGlobal('self', endpoint);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => binary })));
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage: draw, getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }) }; }
    });
    await import('./sword.worker');
  });
  afterEach(() => vi.unstubAllGlobals());
  function frame() {
    return { visibleRect: { width: 640, height: 480 }, displayWidth: 640, displayHeight: 480,
      allocationSize: vi.fn(() => 640 * 480 * 4), copyTo: vi.fn(async (_pixels: Uint8ClampedArray, _options: VideoFrameCopyToOptions) => []), close: vi.fn() };
  }
  it('copies directly to a reused buffer without canvas readback and always releases video frames', async () => {
    const a = frame(), b = frame();
    await endpoint.onmessage!({ data: { frame: a, timestampMs: 0 } });
    await endpoint.onmessage!({ data: { frame: b, timestampMs: 33 } });
    expect(draw).not.toHaveBeenCalled();
    expect(a.copyTo.mock.calls[0][0]).toBe(b.copyTo.mock.calls[0][0]);
    expect(a.close).toHaveBeenCalledOnce(); expect(b.close).toHaveBeenCalledOnce();
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ transport: 'videoframe-rgba-wasm', frame: null });
  });
  it('falls back on the same video frame when format conversion is unsupported', async () => {
    const a = frame(); a.copyTo.mockRejectedValue(new Error('NotSupported'));
    await endpoint.onmessage!({ data: { frame: a, timestampMs: 0 } });
    expect(draw).toHaveBeenCalledWith(a, 0, 0, 320, 240);
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ transport: 'videoframe-fallback' });
    expect(a.close).toHaveBeenCalledOnce();
  });
  it('defaults to native NV12, permits RGBA comparison, and returns to NV12',async()=>{
    for(const [i,nativePixels] of [undefined,false,true].entries()){
      const a={...frame(),format:'NV12',visibleRect:{x:0,y:0,width:640,height:480},
        colorSpace:{matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false}};
      a.allocationSize.mockImplementation((options?: VideoFrameCopyToOptions)=>options?.format==='RGBA'?640*480*4:640*480*1.5);
      await endpoint.onmessage!({data:{frame:a,timestampMs:i*33,nativePixels}});
      expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({transport:nativePixels===false?'videoframe-rgba-wasm':'videoframe-nv12-wasm'});
      expect(a.close).toHaveBeenCalledOnce();
    }
    expect(draw).not.toHaveBeenCalled();
  });
  it('runs the four-ring foil detector on the actual copied pixels, including one hidden ring', async () => {
    const w = 640, h = 480, pixels = new Uint8ClampedArray(w * h * 4);
    for (const [left, right, color] of [[120, 180, [245, 35, 130, 255]], [220, 250, [245, 35, 130, 255]], [340, 370, [15, 225, 55, 255]], [420, 480, [15, 225, 55, 255]]] as [number, number, number[]][]) {
      for (let y = 230; y < 250; y++) for (let x = left; x < right; x++) pixels.set(color, (y * w + x) * 4);
    }
    const first = frame(); first.copyTo.mockImplementation(async data => { data.set(pixels); return []; });
    await endpoint.onmessage!({ data: { frame: first, timestampMs: 0 } });
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ backend: 'WASM', frame: { source: 'four-ring-2d', visibleRings: 4, supportMask: 15 } });
    for (let y = 230; y < 250; y++) pixels.fill(0, (y * w + 120) * 4, (y * w + 180) * 4);
    const second = frame(); second.copyTo.mockImplementation(async data => { data.set(pixels); return []; });
    await endpoint.onmessage!({ data: { frame: second, timestampMs: 33 } });
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ frame: { source: 'four-ring-2d', visibleRings: 3, supportMask: 14, inferredEndpoints: true } });
    expect(second.close).toHaveBeenCalledOnce();
  });
  it('preserves display geometry for transformed sources via the canvas fallback', async () => {
    const a = frame(); a.displayWidth = 480; a.displayHeight = 640;
    await endpoint.onmessage!({ data: { frame: a, timestampMs: 0 } });
    expect(a.copyTo).not.toHaveBeenCalled(); expect(draw).toHaveBeenCalledWith(a, 0, 0, 180, 240);
  });
  it('closes image bitmaps even when pixel extraction fails', async () => {
    const bitmap = { width: 320, height: 240, close: vi.fn() }; draw.mockImplementation(() => { throw new Error('No canvas'); });
    await endpoint.onmessage!({ data: { bitmap, timestampMs: 0 } });
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(endpoint.postMessage).toHaveBeenCalledWith({ error: 'No canvas' });
  });
  it('continues with JavaScript when WASM cannot load', async () => {
    vi.resetModules(); vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await import('./sword.worker');
    const a = frame(); await endpoint.onmessage!({ data: { frame: a, timestampMs: 33 } });
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ backend: 'JavaScript', frame: null });
    expect(a.close).toHaveBeenCalledOnce();
  });
});
