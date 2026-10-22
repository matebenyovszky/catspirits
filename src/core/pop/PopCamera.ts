import { BladeCamera } from '../blade/BladeCamera';
import type { CameraPoseTracker } from '../tracking/CameraPoseTracker';
import type { SwordFrame } from '../tracking/sword/types';
import { handsFromPose, type HandFrame } from './HandInput';
export type PopCameraMode = 'hands' | 'sword';

/** Exactly one tracker and one owned stream. Body-model code loads only after
 * the player explicitly selects hands; sword mode keeps the colour worker. */
export class PopCamera {
  private generation = 0;
  private pose: CameraPoseTracker | null = null;
  private sword: BladeCamera | null = null;
  private state: 'idle' | 'loading' | 'tracking' | 'error' = 'idle';
  constructor(private video: HTMLVideoElement, private onHands: (frame: HandFrame | null) => void,
    private onSword: (frame: SwordFrame | null) => void) {}
  get running(): boolean { return this.sword ? this.sword.running : !!this.pose && this.state === 'tracking'; }
  get loading(): boolean { return this.state === 'loading'; }
  async start(mode: PopCameraMode): Promise<boolean> {
    this.stop(); const generation = this.generation; this.state = 'loading';
    const current = () => generation === this.generation;
    if (document.hidden) { this.stop(); return false; }
    if (mode === 'sword') {
      this.sword = new BladeCamera(this.video, frame => { if (current()) this.onSword(frame); });
      try {
        const ready = await this.sword.start();
        if (!current()) return false;
        this.state = ready ? 'tracking' : 'error'; return ready;
      } catch (error) { if (current()) this.stop(); throw error; }
    }
    const { CameraPoseTracker } = await import('../tracking/CameraPoseTracker');
    if (!current() || document.hidden) { if (current()) this.stop(); return false; }
    const pose = new CameraPoseTracker(this.video, {
      onFrame: frame => { if (current()) this.onHands(handsFromPose(frame, performance.now())); },
      onStatus: status => { if (current()) { this.state = status.state; if (status.state !== 'tracking') this.onHands(null); } }
    });
    this.pose = pose; pose.setInputWidth(320); await pose.start();
    return current() && this.running;
  }
  stop(): void {
    ++this.generation; this.pose?.dispose(); this.pose = null; this.sword?.stop(); this.sword = null; this.state = 'idle';
    this.onHands(null); this.onSword(null);
  }
}
