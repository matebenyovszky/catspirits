import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CameraSwordTracker } from './CameraSwordTracker';
import type { SwordFrame } from './types';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
class WorkerMock {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn(); terminate = vi.fn();
  receive(timestampMs: number) {
    const frame: SwordFrame = { timestampMs, base: { x: .3, y: .5 }, tip: { x: .6, y: .5 }, confidence: 1, imageAspectRatio: 4 / 3, source: 'color-bands-2d' };
    this.onmessage?.({ data: { frame, timestampMs, processingMs: 2, readbackMs: 1, search: 'full', scannedPixels: 76800, reason: 'ready' } });
  }
}
describe('CameraSwordTracker lifecycle', () => {
  let tracker: CameraSwordTracker, video: HTMLVideoElement, emit: Mock<(frame: SwordFrame | null) => void>;
  let callbacks: Map<number, FrameRequestCallback>, workers: WorkerMock[], decoded: number;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] }); callbacks = new Map(); workers = []; decoded = 1; let id = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { callbacks.set(++id, cb); return id; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(key => callbacks.delete(key)));
    vi.stubGlobal('Worker', class extends WorkerMock { constructor() { super(); workers.push(this); } });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: vi.fn() })));
    video = { readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 0,
      getVideoPlaybackQuality: () => ({ totalVideoFrames: decoded, droppedVideoFrames: 0 }) } as unknown as HTMLVideoElement;
    emit = vi.fn(); tracker = new CameraSwordTracker(video, emit);
  });
  afterEach(() => { tracker.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function tick() { const [key, cb] = callbacks.entries().next().value!; callbacks.delete(key); cb(performance.now()); }
  it('keeps one image in flight, drains the latest and does not count duplicate frames', async () => {
    tracker.start(); await flush(); const worker = workers[0]; expect(worker.postMessage).toHaveBeenCalledOnce();
    decoded = 2; await vi.advanceTimersByTimeAsync(33); tick(); await flush(); expect(worker.postMessage).toHaveBeenCalledOnce();
    worker.receive(0); await flush(); expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.receive(33); await flush(); tick(); await flush(); expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(createImageBitmap).toHaveBeenCalledWith(video, { resizeWidth: 320, resizeHeight: 240, resizeQuality: 'low' });
  });
  it('closes late captures and ignores obsolete worker responses after restart', async () => {
    let finish!: (bitmap: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    tracker.start(); const old = workers[0]; tracker.start(); await flush();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap; finish(bitmap); await flush();
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(old.postMessage).not.toHaveBeenCalled();
    emit.mockClear(); old.receive(0); expect(emit).not.toHaveBeenCalled(); expect(old.terminate).toHaveBeenCalledOnce();
  });
  it('drops stale results and shuts down a hung worker without stopping the camera', async () => {
    tracker.start(); await flush(); emit.mockClear(); await vi.advanceTimersByTimeAsync(200); workers[0].receive(0);
    expect(emit).toHaveBeenLastCalledWith(null);
    decoded = 2; tick(); await flush(); await vi.advanceTimersByTimeAsync(3100); tick();
    expect(workers[0].terminate).toHaveBeenCalledOnce(); expect(tracker.stats.message).toContain('nem válaszol');
    expect(callbacks.size).toBe(0);
  });
  it('supports compositor callbacks and falls back when they stall', async () => {
    video.requestVideoFrameCallback = vi.fn(() => 123); video.cancelVideoFrameCallback = vi.fn();
    tracker.start(); await flush(); workers[0].receive(0); decoded = 2;
    await vi.advanceTimersByTimeAsync(100); tick(); await flush(); expect(workers[0].postMessage).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(160); tick(); await flush(); expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    tracker.stop(); expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(123);
  });
  it('contains capture and worker errors without retry loops', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('capture failed'));
    tracker.start(); await flush(); expect(tracker.stats.message).toContain('nem olvasható');
    tracker.start(); await flush(); workers[1].onerror?.(); expect(tracker.stats.message).toContain('nem indult');
    expect(callbacks.size).toBe(0);
  });
  it('transfers VideoFrame directly and switches to bitmap if RGBA copy is unavailable', async () => {
    const close = vi.fn();
    vi.stubGlobal('VideoFrame', class { close = close; });
    tracker.start(); await flush();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(workers[0].postMessage.mock.calls[0][0]).toHaveProperty('frame');
    workers[0].onmessage?.({ data: { frame: null, timestampMs: 0, transport: 'videoframe-fallback', processingMs: 1, readbackMs: 1 } });
    decoded = 2; tick(); await flush(); expect(createImageBitmap).toHaveBeenCalledOnce();
  });
});
