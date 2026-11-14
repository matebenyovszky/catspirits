import { sharedCamera } from '../tracking/SharedCamera';
import { CameraSwordTracker } from '../tracking/sword/CameraSwordTracker';
import { SwordMeasurementGate } from '../tracking/sword/SwordMeasurementGate';
import type { SwordFrame } from '../tracking/sword/types';

/** Independent colour tracking: no body model, microphone, recording or upload. */
export class BladeCamera {
  private generation = 0;
  private releaseCamera?: () => void;
  private cameraAbort?: AbortController;
  private stream: MediaStream | null = null;
  private tracker: CameraSwordTracker | null = null;
  private gate = new SwordMeasurementGate();
  constructor(private video: HTMLVideoElement, private onFrame: (frame: SwordFrame | null) => void) {}
  get running(): boolean { return !!this.stream && !!this.tracker?.running; }
  get stats() { return this.tracker?.stats; }
  async start(): Promise<boolean> {
    this.stop(); const generation = this.generation;
    if (document.hidden || !navigator.mediaDevices?.getUserMedia) throw new Error('camera-unavailable');
    const lease = sharedCamera.claim(() => navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } } }), 'game');
    this.releaseCamera = lease.release;
    let stream: MediaStream;
    try { stream = await lease.ready; }
    catch (error) { if (generation === this.generation) this.stop(); throw error; }
    if (generation !== this.generation || document.hidden) { lease.release(); return false; }
    this.stream = stream; this.video.srcObject = stream;
    this.video.muted = true; this.video.playsInline = true;
    this.cameraAbort = new AbortController();
    for (const track of stream.getTracks()) track.addEventListener('ended', () => {
      if (generation === this.generation) this.stop();
    }, { once: true, signal: this.cameraAbort.signal });
    try {
      await this.video.play();
      if (generation !== this.generation) return false;
      if (document.hidden) { this.stop(); return false; }
      this.tracker = new CameraSwordTracker(this.video, frame => this.onFrame(this.gate.accept(frame, performance.now())));
      this.tracker.start(); return this.running;
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }
  stop(): void {
    ++this.generation; this.cameraAbort?.abort(); this.cameraAbort = undefined; this.tracker?.stop(); this.tracker = null; this.gate.reset();
    this.releaseCamera?.(); this.releaseCamera = undefined; this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.onFrame(null);
  }
}
