import type { MotionInput } from '../tracking/types';
import { emptyMotionInput } from '../tracking/types';
import { BodyMotionInput } from '../tracking/BodyMotionInput';
import type { CameraPoseTracker } from '../tracking/CameraPoseTracker';
import type { CameraSwordTracker } from '../tracking/sword/CameraSwordTracker';
import { validSword, type SwordFrame } from '../tracking/sword/types';

export class JumperCamera {
  private tracker?: CameraPoseTracker;
  private body = new BodyMotionInput('quick', 'torso');
  private response: 'quick' | 'steady' = 'quick';
  private motion = emptyMotionInput();
  private lastFrame = 0;
  private generation = 0;
  private active = false;
  private sword?: CameraSwordTracker;
  private swordFrame: SwordFrame | null = null;
  private swordGeneration = 0;
  constructor(private video: HTMLVideoElement, private onJump: (strength: number) => void,
    private onStatus: (message: string, state: string) => void) {}

  setResponse(response: 'quick' | 'steady'): void {
    if (this.response === response) return;
    this.response = response;
    this.body = new BodyMotionInput(response === 'quick' ? 'quick' : 'standard', 'torso');
    this.motion = emptyMotionInput(); this.lastFrame = 0;
    this.tracker?.setInputWidth(response === 'quick' ? 320 : 480);
  }

  async start(): Promise<boolean> {
    this.stop(); const generation = ++this.generation;
    this.active = true; this.body.reset();
    this.onStatus('Kamera és testkövető indítása…', 'loading');
    try {
      const { CameraPoseTracker } = await import('../tracking/CameraPoseTracker');
      if (generation !== this.generation) return false;
      this.tracker = new CameraPoseTracker(this.video, {
        onFrame: frame => {
          if (generation !== this.generation || !this.active) return;
          this.lastFrame = performance.now(); this.motion = this.body.update(frame);
          if (this.motion.jump) this.onJump(this.motion.jumpStrength ?? .8);
        },
        onStatus: status => {
          if (generation !== this.generation) return;
          if (status.state === 'error' || status.state === 'idle') {
            this.active = false; this.motion = emptyMotionInput();
            this.stopSword();
          }
          this.onStatus(status.message, status.state);
        },
      });
      this.tracker.setInputWidth(this.response === 'quick' ? 320 : 480);
      await this.tracker.start();
      return generation === this.generation && this.active;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      this.onStatus(error instanceof Error ? error.message : 'A kamera nem indult el.', 'error');
      return false;
    }
  }

  input(autoRun: boolean): MotionInput {
    if (!this.active || performance.now() - this.lastFrame > 500) return emptyMotionInput();
    return { ...this.motion, jump: false, runSpeed: autoRun && this.motion.tracked && this.motion.calibrated ? 1 : this.motion.runSpeed };
  }
  /** Prepared for the optional sword mode. Shares the authorized video and is
   * never called by normal gameplay. Detection errors leave body control intact. */
  async setSwordEnabled(enabled: boolean): Promise<boolean> {
    this.stopSword();
    if (!enabled || !this.active) return false;
    const generation = this.swordGeneration;
    try {
      const { CameraSwordTracker } = await import('../tracking/sword/CameraSwordTracker');
      if (generation !== this.swordGeneration || !this.active) return false;
      this.sword = new CameraSwordTracker(this.video, frame => {
        if (generation === this.swordGeneration) this.swordFrame = frame;
      });
      this.sword.start();
      return this.sword.running;
    } catch {
      if (generation === this.swordGeneration) this.stopSword();
      return false;
    }
  }
  swordInput(): SwordFrame | null {
    const frame = this.swordFrame;
    return this.active && frame && validSword(frame, performance.now()) ? frame : null;
  }
  private stopSword(): void {
    ++this.swordGeneration; this.sword?.stop(); this.sword = undefined; this.swordFrame = null;
  }
  stop(): void {
    this.stopSword();
    ++this.generation; this.active = false; this.tracker?.dispose(); this.tracker = undefined;
    this.motion = emptyMotionInput(); this.body.reset(); this.lastFrame = 0;
  }
}
