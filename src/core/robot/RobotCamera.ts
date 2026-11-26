import { cameraFeed } from '../tracking/CameraFeed';
import type { PoseFrame } from '../tracking/types';

/** Native hand play subscribes to the persistent camera feed. */
export class RobotCamera {
  private releaseInput?: () => void;
  private unsubscribe?: () => void;
  constructor(private readonly onFrame: (frame: PoseFrame | null) => void) {}

  get running(): boolean { return !!this.unsubscribe && cameraFeed.running; }
  get lastError(): string | undefined { return cameraFeed.lastError; }

  async start(): Promise<boolean> {
    this.stop();
    const unsubscribe = this.unsubscribe = cameraFeed.onGameHands(this.onFrame);
    this.releaseInput = cameraFeed.claimInput();
    const ready = await cameraFeed.whenReady();
    return this.unsubscribe === unsubscribe && ready;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.releaseInput?.();
    this.releaseInput = undefined;
    this.onFrame(null);
  }
}
