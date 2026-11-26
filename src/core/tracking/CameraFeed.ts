import type { CameraPoseTracker, TrackingStatus } from './CameraPoseTracker';
import type { PoseFrame } from './types';
import type { SwordFrame } from './sword/types';

type Listener<T> = (value: T) => void;
const idle: TrackingStatus = { state: 'idle', message: 'A kamera indítására várunk.' };

function listen<T>(listeners: Set<Listener<T>>, receive: Listener<T>): () => void {
  listeners.add(receive);
  return () => { listeners.delete(receive); };
}
function send<T>(listeners: Set<Listener<T>>, value: T): void {
  for (const receive of listeners) receive(value);
}

/** The shell owns one video and one hand/body worker across all game routes. */
export class CameraFeed {
  private element?: HTMLVideoElement;
  private tracker?: CameraPoseTracker;
  private pending?: Promise<boolean>;
  private generation = 0;
  private status = idle;
  private handTime = -Infinity;
  private bodyTime = -Infinity;
  private primary?: PoseFrame['handedness'];
  private gameInputs = new Set<symbol>();
  private statuses = new Set<Listener<TrackingStatus>>();
  private observations = new Set<Listener<PoseFrame>>();
  private gameHands = new Set<Listener<PoseFrame | null>>();
  private bodies = new Set<Listener<PoseFrame>>();
  private swords = new Set<Listener<SwordFrame | null>>();
  private ownership = new Set<Listener<boolean>>();
  private navigate?: (frame: PoseFrame) => boolean;

  get video(): HTMLVideoElement {
    if (!this.element) {
      const video = this.element = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-hidden', 'true');
    }
    return this.element;
  }

  get running(): boolean { return this.status.state === 'tracking'; }
  get lastError(): string | undefined { return this.status.state === 'error' ? this.status.message : undefined; }
  get gameOwnsInput(): boolean { return this.gameInputs.size > 0; }

  whenReady(): Promise<boolean> { return this.pending ?? Promise.resolve(this.running); }

  onStatus(receive: Listener<TrackingStatus>): () => void {
    receive(this.status);
    return listen(this.statuses, receive);
  }
  onObservation(receive: Listener<PoseFrame>): () => void { return listen(this.observations, receive); }
  onGameHands(receive: Listener<PoseFrame | null>): () => void { return listen(this.gameHands, receive); }
  onBody(receive: Listener<PoseFrame>): () => void { return listen(this.bodies, receive); }
  onSword(receive: Listener<SwordFrame | null>): () => void { return listen(this.swords, receive); }
  onOwnership(receive: Listener<boolean>): () => void { return listen(this.ownership, receive); }
  publishSword(frame: SwordFrame | null): void { send(this.swords, frame); }

  setNavigator(receive: (frame: PoseFrame) => boolean): () => void {
    this.navigate = receive;
    return () => { if (this.navigate === receive) this.navigate = undefined; };
  }

  claimInput(): () => void {
    const key = Symbol();
    const previous = this.gameOwnsInput;
    this.gameInputs.add(key);
    if (!previous) send(this.ownership, true);
    return () => {
      if (this.gameInputs.delete(key) && !this.gameOwnsInput) send(this.ownership, false);
    };
  }

  start(): Promise<boolean> {
    if (this.pending) return this.pending;
    if (this.running) return Promise.resolve(true);
    if (document.hidden) return Promise.resolve(false);
    // During GPU recovery the tracker is already rebuilding its worker on the same video.
    if (this.tracker && this.status.state === 'loading') return Promise.resolve(false);
    this.tracker?.dispose();
    this.tracker = undefined;
    const generation = ++this.generation;
    this.updateStatus({ state: 'loading', message: 'Kamera indítása…' });
    const pending = this.open(generation).finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  private async open(generation: number): Promise<boolean> {
    try {
      const [{ CameraPoseTracker }, { createHandWorker }] = await Promise.all([
        import('./CameraPoseTracker'), import('./hand.worker'),
      ]);
      if (generation !== this.generation || document.hidden) return false;
      const tracker = this.tracker = new CameraPoseTracker(this.video, {
        onFrame: frame => { if (generation === this.generation) this.frame(frame); },
        onStatus: status => { if (generation === this.generation) this.updateStatus(status); },
      }, delegate => createHandWorker(delegate, true, 2, { handMs: 40, bodyMs: 31 }), {
        role: 'navigation', maxFps: 50, overlay: false,
      });
      tracker.setInputWidth(480);
      await tracker.start();
      return generation === this.generation && this.running;
    } catch {
      if (generation === this.generation) {
        this.updateStatus({ state: 'error', message: 'A kamerakövetés nem indult el. Próbáld újra.' });
      }
      return false;
    }
  }

  private updateStatus(status: TrackingStatus): void {
    this.status = status;
    if (status.state !== 'tracking') {
      this.handTime = this.bodyTime = -Infinity;
      this.primary = undefined;
      send(this.gameHands, null);
      this.publishSword(null);
    }
    send(this.statuses, status);
  }

  private frame(frame: PoseFrame): void {
    send(this.observations, frame);
    const { armTimestampMs, armLandmarks, armWorldLandmarks } = frame;
    if (armTimestampMs !== undefined && armTimestampMs > this.bodyTime) {
      this.bodyTime = armTimestampMs;
      send(this.bodies, {
        timestampMs: armTimestampMs, landmarks: armLandmarks ?? [], worldLandmarks: armWorldLandmarks ?? [],
        inferenceMs: frame.inferenceMs, imageAspectRatio: frame.imageAspectRatio,
      });
    } else if (armTimestampMs === undefined && !frame.landmarks.length) {
      send(this.bodies, frame);
    }
    const time = frame.handTimestampMs ?? frame.timestampMs;
    if (time <= this.handTime) return;
    this.handTime = time;
    const withSameSide = this.primary && frame.hands?.find(hand => hand.side.toLowerCase() === this.primary);
    const primary = withSameSide || frame.hands?.[0];
    const side = primary?.side.toLowerCase();
    this.primary = side === 'left' || side === 'right' ? side : frame.handedness;
    const hands: PoseFrame = primary ? {
      ...frame, timestampMs: time, landmarks: primary.points, worldLandmarks: primary.worldPoints ?? [],
      handedness: this.primary, handednessScore: primary.score,
    } : { ...frame, timestampMs: time };
    const usedByMenu = this.navigate?.(hands) ?? false;
    send(this.gameHands, usedByMenu ? null : hands);
  }

  stop(): void {
    ++this.generation;
    this.pending = undefined;
    this.tracker?.dispose();
    this.tracker = undefined;
    this.updateStatus(idle);
  }
}
export const cameraFeed = new CameraFeed();
