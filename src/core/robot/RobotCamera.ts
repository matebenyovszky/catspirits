import type { CameraPoseTracker } from '../tracking/CameraPoseTracker';
import type { PoseFrame } from '../tracking/types';
/** Reuses the tested Safari capture, cancellation and GPU/CPU recovery transport,
 * with serial hand inference plus body landmarks at up to 10 Hz on that same
 * worker and stream. No parallel camera or frame queue. */
export class RobotCamera {
  private tracker: CameraPoseTracker | null = null;
  private generation = 0;
  lastError?: string;
  private tracking = false;
  constructor(private video: HTMLVideoElement, private onFrame: (frame: PoseFrame | null) => void, private readonly includeArm = true) {}
  get running(): boolean { return this.tracking; }
  async start(): Promise<boolean> {
    this.stop(); this.lastError = undefined; const generation = this.generation;
    const [{ CameraPoseTracker }, { createHandWorker }] = await Promise.all([import('../tracking/CameraPoseTracker'), import('../tracking/hand.worker')]);
    if (generation !== this.generation || document.hidden) return false;
    const current = () => generation === this.generation;
    this.tracker = new CameraPoseTracker(this.video, {
      onFrame: frame => { if (current()) this.onFrame(frame); },
      onStatus: status => { if (current()) { this.tracking = status.state === 'tracking'; if (status.state === 'error') this.lastError = status.message; if (!this.tracking) this.onFrame(null); } }
    }, delegate => createHandWorker(delegate, this.includeArm), { role: 'game-hand' });
    this.tracker.setInputWidth(480); await this.tracker.start();
    return current() && this.tracking;
  }
  stop(): void { ++this.generation; this.tracking = false; this.tracker?.dispose(); this.tracker = null; this.onFrame(null); }
}
