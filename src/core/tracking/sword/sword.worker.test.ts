import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('sword worker pixels and ownership', () => {
  let endpoint: { onmessage: ((e: { data: unknown }) => Promise<void>) | null; postMessage: ReturnType<typeof vi.fn> };
  let draw: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules(); endpoint = { onmessage: null, postMessage: vi.fn() }; draw = vi.fn();
    vi.stubGlobal('self', endpoint);
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
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ transport: 'videoframe-copy', frame: null });
  });
  it('falls back on the same video frame when format conversion is unsupported', async () => {
    const a = frame(); a.copyTo.mockRejectedValueOnce(new Error('NotSupported'));
    await endpoint.onmessage!({ data: { frame: a, timestampMs: 0 } });
    expect(draw).toHaveBeenCalledWith(a, 0, 0, 320, 240);
    expect(endpoint.postMessage.mock.lastCall?.[0]).toMatchObject({ transport: 'videoframe-fallback' });
    expect(a.close).toHaveBeenCalledOnce();
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
});
