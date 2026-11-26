import type { MotionInput } from '../tracking/types';
import { emptyMotionInput } from '../tracking/types';
import { BodyMotionInput } from '../tracking/BodyMotionInput';
import { cameraFeed } from '../tracking/CameraFeed';
import type { CameraSwordTracker } from '../tracking/sword/CameraSwordTracker';
import { validSword, type SwordFrame } from '../tracking/sword/types';

export class JumperCamera {
  private subscriptions: (() => void)[] = [];
  private releaseInput?: () => void;
  private body = new BodyMotionInput('quick', 'torso');
  private response: 'quick' | 'steady' = 'quick';
  private motion = emptyMotionInput();
  private lastFrame = 0;
  private generation = 0;
  private active = false;
  private gameplayActive = false;
  private sword?: CameraSwordTracker;
  private swordFrame: SwordFrame | null = null;
  private swordGeneration = 0;
  constructor(private onJump: (strength: number) => void,
    private onStatus: (message: string, state: string) => void) {}

  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    if (active && this.subscriptions.length && !this.releaseInput) this.releaseInput = cameraFeed.claimInput();
    if (!active) {
      this.releaseInput?.();
      this.releaseInput = undefined;
    }
  }

  setResponse(response: 'quick' | 'steady'): void {
    if (this.response === response) return;
    this.response = response;
    this.body = new BodyMotionInput(response === 'quick' ? 'quick' : 'standard', 'torso');
    this.motion = emptyMotionInput(); this.lastFrame = 0;
  }

  async start(): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    this.body.reset();
    this.subscriptions = [
      cameraFeed.onBody(frame => {
        if (!this.active) return;
        this.lastFrame = performance.now();
        this.motion = this.body.update(frame);
        if (this.motion.jump) this.onJump(this.motion.jumpStrength ?? .8);
      }),
      cameraFeed.onStatus(status => {
        this.active = status.state === 'tracking';
        if (!this.active) {
          this.motion = emptyMotionInput();
          this.stopSword();
        }
        this.onStatus(status.message, status.state);
      }),
    ];
    this.setGameplayActive(this.gameplayActive);
    const ready = await cameraFeed.whenReady();
    return ready && generation === this.generation;
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
      this.sword = new CameraSwordTracker(cameraFeed.video, frame => {
        if (generation !== this.swordGeneration) return;
        this.swordFrame = frame;
        cameraFeed.publishSword(frame);
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
    ++this.swordGeneration;
    if (this.sword) { this.sword.stop(); cameraFeed.publishSword(null); }
    this.sword = undefined;
    this.swordFrame = null;
  }
  stop(): void {
    this.stopSword();
    ++this.generation;
    this.active = false;
    this.subscriptions.forEach(release => release());
    this.subscriptions = [];
    this.releaseInput?.();
    this.releaseInput = undefined;
    this.motion = emptyMotionInput(); this.body.reset(); this.lastFrame = 0;
  }
}
