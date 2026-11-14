import type { PoseFrame } from './types';
export type CameraRole = 'game' | 'navigation' | 'game-hand';
type Capture = { owners: Map<symbol, CameraRole>; ready: Promise<MediaStream>; stream?: MediaStream };
/** One local capture per page. A consumer releases only its lease; it cannot
 * stop the camera underneath a game. Late permission results are closed. */
export class SharedCamera {
  private capture?: Capture;
  private listeners = new Set<() => void>();
  private handListeners = new Set<(frame: PoseFrame) => void>();
  get hasGameHands(): boolean { return !!this.capture && [...this.capture.owners.values()].includes('game-hand'); }
  get hasGame(): boolean { return !!this.capture && [...this.capture.owners.values()].some(role => role !== 'navigation'); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onHand(listener: (frame: PoseFrame) => void): () => void { this.handListeners.add(listener); return () => this.handListeners.delete(listener); }
  publishHand(frame: PoseFrame): void { for (const listener of this.handListeners) listener(frame); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  claim(acquire: () => Promise<MediaStream>, role: CameraRole) {
    let capture = this.capture;
    if (!capture) {
      capture = { owners: new Map(), ready: undefined as unknown as Promise<MediaStream> };
      this.capture = capture;
      const current = capture;
      let acquisition: Promise<MediaStream>;
      try { acquisition=acquire(); } catch(error) { acquisition=Promise.reject(error); }
      current.ready = acquisition.then(stream => {
        if (!current.owners.size) stream.getTracks().forEach(track => track.stop());
        else current.stream = stream;
        return stream;
      });
    }
    const owner = Symbol(role); capture.owners.set(owner, role); this.changed();
    const current = capture;
    return { ready: current.ready, release: () => {
      if (!current.owners.delete(owner)) return;
      if (!current.owners.size) {
        if (this.capture === current) this.capture = undefined;
        current.stream?.getTracks().forEach(track => track.stop());
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
