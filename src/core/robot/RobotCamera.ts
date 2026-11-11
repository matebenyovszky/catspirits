import type { CameraPoseTracker } from '../tracking/CameraPoseTracker';
import type { PoseFrame } from '../tracking/types';
/** Reuses the tested Safari capture, cancellation and GPU/CPU recovery transport,
 * but starts only the single-hand model. No parallel body inference. */
export class RobotCamera {
  private tracker: CameraPoseTracker | null = null;
  private generation = 0;
  private tracking = false;
  constructor(private video: HTMLVideoElement, private onFrame: (frame: PoseFrame | null) => void) {}
  get running(): boolean { return this.tracking; }
  async start(): Promise<boolean> {
    this.stop(); const generation = this.generation;
    const [{ CameraPoseTracker }, { createHandWorker }] = await Promise.all([import('../tracking/CameraPoseTracker'), import('../tracking/hand.worker')]);
    if (generation !== this.generation || document.hidden) return false;
    const current = () => generation === this.generation;
    this.tracker = new CameraPoseTracker(this.video, {
      onFrame: frame => { if (current()) this.onFrame(frame); },
      onStatus: status => { if (current()) { this.tracking = status.state === 'tracking'; if (!this.tracking) this.onFrame(null); } }
    }, createHandWorker);
    this.tracker.setInputWidth(480); await this.tracker.start();
    return current() && this.tracking;
  }
  stop(): void { ++this.generation; this.tracking = false; this.tracker?.dispose(); this.tracker = null; this.onFrame(null); }
}
