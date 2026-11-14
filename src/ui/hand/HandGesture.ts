import type { PoseFrame } from '../../core/tracking/types';
export type HandPoint = { x: number; y: number; held: boolean; edge: 'down' | 'up' | null };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Palm-relative pinch with hysteresis, real-time debounce and open-to-arm.
 * Loss, a changed hand or a long frame gap always cancels the pending click. */
export class HandGesture {
  private last = -Infinity;
  private side?: string;
  private openSince = -Infinity;
  private candidateSince = -Infinity;
  private candidate = false;
  private armed = false;
  private held = false;
  private position?: { x: number; y: number };
  reset(): void { this.last = this.openSince = this.candidateSince = -Infinity; this.armed = this.held = this.candidate = false; this.side = undefined; this.position = undefined; }
  update(frame: PoseFrame, now = performance.now()): HandPoint | null {
    const points = frame.landmarks, time = frame.timestampMs;
    if (points.length !== 21 || now - time > 400 || time > now + 50 || time <= this.last || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) { this.reset(); return null; }
    if (time - this.last > 400 || (this.side && frame.handedness && this.side !== frame.handedness)) this.reset();
    const dt = Math.min(100, time - this.last); this.last = time; this.side = frame.handedness;
    const aspect = frame.imageAspectRatio ?? 4 / 3;
    const distance = (a: number, b: number) => Math.hypot((points[a].x-points[b].x)*aspect, points[a].y-points[b].y);
    const palm = distance(5, 17);
    if (palm < .025 || palm > .7) { this.reset(); return null; }
    const ratio = distance(4, 8) / palm;
    const target = { x: clamp((1-points[9].x-.16)/.68), y: clamp((points[9].y-.12)/.72) };
    const alpha = 1-Math.exp(-dt/45);
    this.position = this.position ? { x: this.position.x+(target.x-this.position.x)*alpha, y: this.position.y+(target.y-this.position.y)*alpha } : target;
    let edge: HandPoint['edge'] = null;
    if (!this.armed) {
      if (ratio > .58) { if (this.openSince === -Infinity) this.openSince = time; if (time-this.openSince >= 160) this.armed = true; }
      else this.openSince = -Infinity;
    } else {
      const closed = this.held ? ratio < .58 : ratio < .32;
      if (closed !== this.candidate) { this.candidate = closed; this.candidateSince = time; }
      if (closed !== this.held && time-this.candidateSince >= 55) { this.held = closed; edge = closed ? 'down' : 'up'; }
    }
    return { ...this.position, held: this.held, edge };
  }
}
