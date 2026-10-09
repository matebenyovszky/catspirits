import { videoFrameKey } from '../videoFrameKey';
import { SWORD_MAX_AGE_MS, type SwordDetection, type SwordFrame } from './types';

export type SwordTrackerStats = { fps: number; processingMs: number; roundTripMs: number; readbackMs: number; transport: string;
  search: string; scannedPixels: number; message: string };

/** Shares the already authorized camera. One transferable image in flight,
 * independent worker, no image queue, no second camera or network requests. */
export class CameraSwordTracker {
  private worker: Worker | null = null;
  private raf = 0;
  private videoCallback: number | undefined;
  private lastCallbackAt = 0;
  private generation = 0;
  private busy = false;
  private lastKey = -1;
  private sentAt = 0;
  private startedAt = 0;
  private frames = 0;
  private directFrames = true;
  stats: SwordTrackerStats = { fps: 0, processingMs: 0, roundTripMs: 0, readbackMs: 0, transport: '', search: '', scannedPixels: 0, message: 'Kard kikapcsolva' };

  constructor(private video: HTMLVideoElement, private onFrame: (frame: SwordFrame | null) => void, private preferVideoFrame = true) {}
  get running(): boolean { return this.worker !== null; }

  start(): void {
    this.stop();
    this.directFrames = this.preferVideoFrame && typeof VideoFrame !== 'undefined';
    const generation = this.generation;
    this.startedAt = performance.now(); this.lastCallbackAt = this.startedAt;
    this.stats.message = 'Mutasd a magenta és cián sávot';
    try {
      const worker = new Worker(new URL('./sword.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<SwordDetection & { timestampMs: number; processingMs: number; readbackMs: number; transport: string; error?: string }>) => {
        if (this.worker !== worker || this.generation !== generation) return;
        this.busy = false;
        const result = event.data, now = performance.now();
        if (result.error) { this.fail(result.error); return; }
        if (result.transport === 'videoframe-fallback') this.directFrames = false;
        const age = now - result.timestampMs;
        this.onFrame(age <= SWORD_MAX_AGE_MS ? result.frame : null);
        this.frames++;
        if (now - this.startedAt >= 1000) { this.stats.fps = this.frames * 1000 / (now - this.startedAt); this.frames = 0; this.startedAt = now; }
        Object.assign(this.stats, { processingMs: result.processingMs, readbackMs: result.readbackMs, roundTripMs: age, transport: result.transport,
          search: result.search, scannedPixels: result.scannedPixels, message: age > SWORD_MAX_AGE_MS ? 'Elavult kardkép eldobva' : result.reason });
        this.capture();
      };
      worker.onerror = () => { if (this.worker === worker) this.fail('A kardkövető worker nem indult el'); };
      this.capture();
      const decoded = () => {
        if (generation !== this.generation || !this.worker) return;
        this.lastCallbackAt = performance.now(); this.capture();
        this.videoCallback = this.video.requestVideoFrameCallback(decoded);
      };
      if (this.video.requestVideoFrameCallback) this.videoCallback = this.video.requestVideoFrameCallback(decoded);
      const tick = () => {
        if (generation !== this.generation || !this.worker) return;
        // Hidden previews can suspend compositor callbacks. Poll only as fallback.
        if (!this.video.requestVideoFrameCallback || performance.now() - this.lastCallbackAt > 250) this.capture();
        if (this.busy && performance.now() - this.sentAt > 3000) { this.fail('A kardkövető nem válaszol'); return; }
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) { this.fail(error instanceof Error ? error.message : 'Kardkövetés nem támogatott'); }
  }

  stop(): void {
    ++this.generation; this.worker?.terminate(); this.worker = null;
    cancelAnimationFrame(this.raf);
    if (this.videoCallback !== undefined) this.video.cancelVideoFrameCallback(this.videoCallback);
    this.videoCallback = undefined; this.busy = false; this.lastKey = -1; this.frames = 0;
    this.stats.fps = 0; this.stats.message = 'Kard kikapcsolva'; this.onFrame(null);
  }

  private fail(message: string): void { this.stop(); this.stats.message = message; }

  private capture(): void {
    const worker = this.worker, now = performance.now(), key = videoFrameKey(this.video);
    if (!worker || this.busy || this.video.readyState < 2 || !this.video.videoWidth || key === this.lastKey) return;
    this.lastKey = key; this.busy = true; this.sentAt = now;
    const generation = this.generation;
    if (this.directFrames && this.video.videoWidth * this.video.videoHeight <= 640 * 480) {
      let frame: VideoFrame | undefined;
      try {
        frame = new VideoFrame(this.video, { timestamp: Math.round(now * 1000) });
        worker.postMessage({ frame, timestampMs: now }, [frame]); return;
      } catch { frame?.close(); this.directFrames = false; }
    }
    const scale = Math.min(1, 320 / this.video.videoWidth, 240 / this.video.videoHeight);
    void createImageBitmap(this.video, { resizeWidth: Math.max(1, Math.round(this.video.videoWidth * scale)),
      resizeHeight: Math.max(1, Math.round(this.video.videoHeight * scale)), resizeQuality: 'low' }).then(bitmap => {
      if (this.worker !== worker || generation !== this.generation) { bitmap.close(); return; }
      try { worker.postMessage({ bitmap, timestampMs: now }, [bitmap]); }
      catch { bitmap.close(); this.fail('A kardkép átadása nem sikerült'); }
    }).catch(() => { if (generation === this.generation) this.fail('A kardkép nem olvasható'); });
  }
}
