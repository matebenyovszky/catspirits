import { validSword, type SwordFrame } from '../tracking/sword/types';

/** A short missing sample is not a lost camera. Only presentation and the round
 * clock get this grace; collisions still receive every null and use 120 ms
 * measured freshness. Neither a rejected sample nor rendering renews it. */
export class BladeTrackingState {
  private last: SwordFrame | null = null;
  reset(): void { this.last = null; }
  observe(frame: SwordFrame | null, now: number): void {
    if (frame && validSword(frame, now) && (!this.last || frame.timestampMs > this.last.timestampMs)) this.last = frame;
  }
  visible(now: number): SwordFrame | null { return this.last && validSword(this.last, now) ? this.last : null; }
  available(now: number): boolean { return !!this.last && now >= this.last.timestampMs - 5 && now - this.last.timestampMs <= 240; }
}
