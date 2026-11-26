import { BladeCamera } from '../blade/BladeCamera';
import { cameraFeed } from '../tracking/CameraFeed';
import type { SwordFrame } from '../tracking/sword/types';
import { handsFromPose, type HandFrame } from './HandInput';
export type PopCameraMode = 'hands' | 'sword';

export class PopCamera {
  private generation = 0;
  private unsubscribe?: () => void;
  private releaseInput?: () => void;
  private sword?: BladeCamera;
  private starting = false;
  constructor(private readonly onHands: (frame: HandFrame | null) => void,
    private readonly onSword: (frame: SwordFrame | null) => void) {}
  get lastError(): string | undefined { return cameraFeed.lastError; }
  get running(): boolean { return this.sword ? this.sword.running : !!this.unsubscribe && cameraFeed.running; }
  get loading(): boolean { return this.starting; }

  async start(mode: PopCameraMode): Promise<boolean> {
    this.stop();
    const generation = this.generation;
    if (document.hidden) return false;
    this.starting = true;
    try {
      if (mode === 'sword') {
        this.sword = new BladeCamera(frame => { if (generation === this.generation) this.onSword(frame); });
        const ready = await this.sword.start();
        return ready && generation === this.generation;
      }
      this.unsubscribe = cameraFeed.onBody(frame => this.onHands(handsFromPose(frame, performance.now())));
      this.releaseInput = cameraFeed.claimInput();
      const ready = await cameraFeed.whenReady();
      return ready && generation === this.generation;
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  stop(): void {
    ++this.generation;
    this.starting = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.releaseInput?.();
    this.releaseInput = undefined;
    this.sword?.stop();
    this.sword = undefined;
    this.onHands(null);
    this.onSword(null);
  }
}
