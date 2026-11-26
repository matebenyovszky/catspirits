import { cameraFeed } from '../tracking/CameraFeed';
import { CameraSwordTracker } from '../tracking/sword/CameraSwordTracker';
import { SwordMeasurementGate } from '../tracking/sword/SwordMeasurementGate';
import type { SwordFrame } from '../tracking/sword/types';

export class BladeCamera {
  private generation = 0;
  private releaseInput?: () => void;
  private tracker?: CameraSwordTracker;
  private gate = new SwordMeasurementGate();
  constructor(private readonly onFrame: (frame: SwordFrame | null) => void) {}

  get running(): boolean { return cameraFeed.running && !!this.tracker?.running; }
  get stats() { return this.tracker?.stats; }

  async start(): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    const ready = await cameraFeed.whenReady();
    if (!ready || generation !== this.generation || document.hidden) return false;
    const tracker = this.tracker = new CameraSwordTracker(cameraFeed.video, frame => {
      if (generation !== this.generation) return;
      const measured = this.gate.accept(frame, performance.now());
      cameraFeed.publishSword(measured);
      this.onFrame(measured);
    });
    this.releaseInput = cameraFeed.claimInput();
    try {
      tracker.start();
      if (this.running) return true;
    } catch (error) {
      this.stop();
      throw error;
    }
    this.stop();
    return false;
  }

  stop(): void {
    ++this.generation;
    if (this.tracker) {
      this.tracker.stop();
      this.tracker = undefined;
      cameraFeed.publishSword(null);
    }
    this.gate.reset();
    this.releaseInput?.();
    this.releaseInput = undefined;
    this.onFrame(null);
  }
}
