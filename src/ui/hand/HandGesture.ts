import type { PoseFrame } from '../../core/tracking/types';
export type HandPoint = { x: number; y: number; held: boolean; edge: 'down' | 'up' | null };
type PointerSpace = { width: number; height: number; allowDrag: boolean };
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
  private pinchAnchor?: { x: number; y: number };
  private dragBase?: { x: number; y: number };
  private lockAt = 0;
  private pressedAt = 0;
  private releaseUntil = 0;
  private dragSince = -Infinity;
  private dragging = false;
  private previousRatio = Infinity;
  reset(): void { this.last = this.openSince = this.candidateSince = -Infinity; this.armed = this.held = this.candidate = false; this.side = undefined; this.position = this.pinchAnchor = this.dragBase = undefined; this.dragging = false; this.previousRatio = Infinity; this.releaseUntil = 0; this.dragSince = -Infinity; }
  update(frame: PoseFrame, now = performance.now(), space: PointerSpace = { width: 1000, height: 1000, allowDrag: true }): HandPoint | null {
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
    // Capture the last OPEN-hand cursor position, before closing fingers can
    // perturb the measured palm. Buttons stay anchored through release;
    // dragging is reserved for a sustained, deliberate move on canvas/ranges.
    if (this.armed && !this.pinchAnchor && ratio < .65 && (this.previousRatio >= .65 || ratio < .32)) {
      this.pinchAnchor = { ...(this.position ?? target) }; this.lockAt = time; this.dragging = false; this.dragSince = -Infinity;
    }
    this.previousRatio = ratio;
    let edge: HandPoint['edge'] = null;
    if (!this.armed) {
      if (ratio > .58) { if (this.openSince === -Infinity) this.openSince = time; if (time-this.openSince >= 160) this.armed = true; }
      else this.openSince = -Infinity;
    } else {
      const closed = this.held ? ratio < .58 : ratio < .32;
      if (closed !== this.candidate) { this.candidate = closed; this.candidateSince = time; }
      if (closed !== this.held && time-this.candidateSince >= 55) { this.held = closed; edge = closed ? 'down' : 'up'; }
    }
    if (edge === 'down') {
      if (this.releaseUntil > 0) { this.pinchAnchor = { ...this.position! }; this.releaseUntil = 0; this.dragging = false; this.dragSince = -Infinity; }
      this.pressedAt = time; this.dragBase = { ...target };
    }
    if (edge === 'up') this.releaseUntil = time + 120;
    if (this.pinchAnchor && !this.held && edge !== 'up' && time >= this.releaseUntil
      && (this.releaseUntil > 0 || ratio >= .72 || time-this.lockAt > 400)) {
      this.pinchAnchor = this.dragBase = undefined; this.dragging = false; this.releaseUntil = 0;
    }
    if (this.pinchAnchor) {
      if (this.held && space.allowDrag && ratio < .58 && this.dragBase && time-this.pressedAt >= 200) {
        const dx=(target.x-this.dragBase.x)*space.width, dy=(target.y-this.dragBase.y)*space.height;
        if (!this.dragging) {
          if (Math.hypot(dx,dy) >= 24) {
            if (this.dragSince === -Infinity) this.dragSince = time;
            if (time-this.dragSince >= 80) { this.dragging = true; this.dragBase = { ...target }; }
          } else this.dragSince = -Infinity;
        }
        if (this.dragging) {
          const goal = { x: clamp(this.pinchAnchor.x+target.x-this.dragBase.x), y: clamp(this.pinchAnchor.y+target.y-this.dragBase.y) };
          this.position = { x: this.position!.x+(goal.x-this.position!.x)*alpha, y: this.position!.y+(goal.y-this.position!.y)*alpha };
        }
      }
      if (!this.dragging) this.position = { ...this.pinchAnchor };
    } else this.position = this.position ? { x: this.position.x+(target.x-this.position.x)*alpha, y: this.position.y+(target.y-this.position.y)*alpha } : target;
    return { ...this.position!, held: this.held, edge };
  }
}
