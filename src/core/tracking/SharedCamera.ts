import type { PoseFrame } from './types';
export type CameraRole = 'game' | 'game-preview' | 'navigation' | 'game-hand';
type Capture = { owners: Map<symbol, CameraRole>; ready: Promise<MediaStream>; stream?: MediaStream };
export type CameraLease = { ready: Promise<MediaStream>; setRole(role: CameraRole): void; release(): void };

const video: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } };

async function openCamera(isWanted: () => boolean): Promise<MediaStream> {
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia) return Promise.reject(new DOMException('Camera unavailable', 'NotSupportedError'));
  try {
    return await devices.getUserMedia({ audio: false, video });
  } catch (error) {
    // A disconnected Continuity Camera can be the system default on macOS.
    if (!(error instanceof Error) || error.name !== 'NotReadableError' || !isWanted()) throw error;
    const cameras = await devices.enumerateDevices?.().catch(() => []);
    const builtIn = cameras?.find(device => device.kind === 'videoinput' && /MacBook|FaceTime|Built.in/i.test(device.label));
    if (!builtIn?.deviceId || !isWanted()) throw error;
    return devices.getUserMedia({ audio: false, video: { ...video, deviceId: { exact: builtIn.deviceId } } });
  }
}

export function cameraAccessError(error: unknown): string | undefined {
  if (!(error instanceof Error)) return;
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'A kamera nincs engedélyezve. Engedélyezd a böngésző címsoránál és a rendszer adatvédelmi beállításaiban, majd indítsd újra.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nem található kamera. Csatlakoztass egy kamerát, majd próbáld újra.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'A kamera nem érhető el. Zárd be a kamerát használó többi alkalmazást, majd próbáld újra.';
    case 'OverconstrainedError':
      return 'A kamera nem támogatja a kért képbeállítást. Próbálj másik kamerát.';
  }
}

/** One local capture per document, including any in-flight permission prompt. */
export class SharedCamera {
  private capture?: Capture;
  private listeners = new Set<() => void>();
  private handListeners = new Set<(frame: PoseFrame) => void>();
  constructor(private readonly acquire: (isWanted: () => boolean) => Promise<MediaStream> = openCamera) {}

  get hasGameHands(): boolean { return !!this.capture && [...this.capture.owners.values()].includes('game-hand'); }
  get hasGame(): boolean { return !!this.capture && [...this.capture.owners.values()].some(role => role !== 'navigation'); }
  get gameOwnsInput(): boolean {
    return !!this.capture && [...this.capture.owners.values()].some(role => role === 'game' || role === 'game-hand');
  }
  get hasCapture(): boolean { return !!this.capture?.stream; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onHand(listener: (frame: PoseFrame) => void): () => void { this.handListeners.add(listener); return () => this.handListeners.delete(listener); }
  publishHand(frame: PoseFrame): void { for (const listener of this.handListeners) listener(frame); }
  private changed(): void { for (const listener of this.listeners) listener(); }

  async canResume(): Promise<boolean> {
    if (this.hasCapture) return true;
    try {
      return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state === 'granted';
    } catch {
      return false;
    }
  }

  claim(role: CameraRole): CameraLease {
    const owner = Symbol(role);
    const existing = this.capture;
    const owners = existing?.owners ?? new Map<symbol, CameraRole>();
    owners.set(owner, role);
    const capture = existing ?? { owners, ready: this.acquire(() => owners.size > 0) };
    if (!existing) {
      this.capture = capture;
      capture.ready = capture.ready.then(stream => {
        if (capture.owners.size) {
          capture.stream = stream;
          for (const track of stream.getTracks()) track.addEventListener('ended', () => {
            if (this.capture !== capture) return;
            this.capture = undefined;
            capture.stream = undefined;
            stream.getTracks().forEach(candidate => candidate.stop());
            this.changed();
          }, { once: true });
        } else {
          this.capture = undefined;
          stream.getTracks().forEach(track => track.stop());
        }
        return stream;
      }, error => {
        if (this.capture === capture) this.capture = undefined;
        throw error;
      });
    }
    this.changed();
    return { ready: capture.ready, setRole: next => {
      if (this.capture !== capture || !capture.owners.has(owner) || capture.owners.get(owner) === next) return;
      capture.owners.set(owner, next);
      this.changed();
    }, release: () => {
      if (!capture.owners.delete(owner)) return;
      // An open browser prompt cannot be cancelled. Keep it available to new
      // owners until it resolves, but stop an unused stream immediately.
      if (!capture.owners.size && capture.stream) {
        if (this.capture === capture) this.capture = undefined;
        capture.stream.getTracks().forEach(track => track.stop());
      }
      this.changed();
    } };
  }
}
export const sharedCamera = new SharedCamera();
// Serial GPU/CPU work across the game and optional cursor: no competing model
// calls and no frame backlog. Fair turns prevent cursor starvation. Each tracker still skips old camera frames.
let inferenceOwner: object | undefined;
const waiting = new Set<object>();
export function claimInference(owner: object): boolean {
  if (inferenceOwner === owner) return true;
  waiting.add(owner);
  if (inferenceOwner || waiting.values().next().value !== owner) return false;
  waiting.delete(owner);inferenceOwner = owner; return true;
}
export function releaseInference(owner: object): void {
  waiting.delete(owner);if (inferenceOwner === owner) inferenceOwner = undefined;
}
