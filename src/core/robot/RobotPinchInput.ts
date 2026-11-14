import type { PoseFrame } from '../tracking/types';
import { reachable, type Point } from './RobotSimulation';
export type PinchState = { point: Point; grip: 'open' | 'closed' | null; armed: boolean; closed: boolean; depth: number | null };
/** Single-hand control with image-aspect normalization, hysteresis and measured-
 * frame debounce. Reacquisition must match the held gripper before any new edge. */
export class RobotPinchInput {
  constructor(private gesture: 'hand' | 'pinch' = 'pinch') {}
  setGesture(gesture: 'hand' | 'pinch'): void { this.gesture = gesture; this.rearm(); }
  private side: string | null = null;
  private stamp = -Infinity;
  private last: PinchState | null = null;
  private candidate: boolean | null = null;
  private since = 0;
  private samples = 0;
  private armed = false;
  private closed = false;
  private palm: Point | null = null;
  private sizes: number[] = [];
  private baseSize: number | null = null;
  private depth = 0;
  reset(): void { this.side = null; this.stamp = -Infinity; this.palm = null; this.sizes = []; this.baseSize = null; this.depth = 0; this.rearm(); }
  rearm(): void { this.armed = false; this.candidate = null; this.samples = 0; this.last = null; }
  calibrateDepth(): void { this.sizes = []; this.baseSize = null; this.depth = 0; }
  update(frame: PoseFrame | null, now: number, holding: boolean): PinchState | null {
    const points = frame?.landmarks;
    if (!frame || !Number.isFinite(frame.timestampMs) || frame.timestampMs > now + 5 || now - frame.timestampMs > 250
      || !Number.isFinite(frame.imageAspectRatio) || frame.imageAspectRatio! <= 0 || frame.imageAspectRatio! > 4
      || !['left', 'right'].includes(frame.handedness ?? '') || !Number.isFinite(frame.handednessScore) || frame.handednessScore! < .65
      || points?.length !== 21 || ![0, 4, 5, 8, 9, 17].every(i => points[i] && [points[i].x, points[i].y, points[i].z].every(Number.isFinite) && points[i].x >= 0 && points[i].x <= 1 && points[i].y >= 0 && points[i].y <= 1)) {
      this.rearm(); this.palm = null; return null;
    }
    if (frame.timestampMs <= this.stamp) return frame.timestampMs === this.stamp && this.last ? { ...this.last, grip: null } : null;
    if (this.side && frame.handedness !== this.side) { this.rearm(); return null; }
    const aspect = frame.imageAspectRatio!;
    const length = (a: number, b: number) => Math.hypot((points[a].x - points[b].x) * aspect, points[a].y - points[b].y);
    const size = length(0, 9);
    if (size < .035 || size > .65) { this.rearm(); return null; }
    const palm = { x: (points[0].x + points[5].x + points[9].x + points[17].x) / 4, y: (points[0].y + points[5].y + points[9].y + points[17].y) / 4 };
    if (this.palm && Math.hypot(palm.x - this.palm.x, palm.y - this.palm.y) > .24) this.rearm();
    if (frame.timestampMs - this.stamp > 250) this.rearm();
    this.stamp = frame.timestampMs; this.side = frame.handedness!;
    this.palm = this.palm ? { x: this.palm.x * .3 + palm.x * .7, y: this.palm.y * .3 + palm.y * .7 } : palm;
    const ratio = length(4, 8) / size;
    let candidate: boolean | null = ratio < .30 ? true : ratio > .55 ? false : null;
    if (this.gesture === 'hand') {
      const fingers = [[8,6,5], [12,10,9], [16,14,13], [20,18,17]];
      if (!fingers.flat().every(i => points[i] && [points[i].x, points[i].y, points[i].z].every(Number.isFinite)
        && points[i].x >= 0 && points[i].x <= 1 && points[i].y >= 0 && points[i].y <= 1)) { this.rearm(); return null; }
      let extended = 0, folded = 0;
      for (const [tip, pip, mcp] of fingers) {
        if (length(tip, 0) > length(pip, 0)*1.15 && length(tip, mcp) > size*.5) extended++;
        else if (length(tip, 0) < length(pip, 0)*1.05 || length(tip, mcp) < size*.45) folded++;
      }
      candidate = extended >= 3 ? false : folded >= 3 ? true : null;
    }
    let grip: PinchState['grip'] = null;
    if (candidate === null) { this.candidate = null; this.samples = 0; }
    else {
      if (candidate !== this.candidate) { this.candidate = candidate; this.since = this.stamp; this.samples = 0; }
      this.samples++;
      if (this.samples >= 3 && this.stamp - this.since >= 100) {
        if (!this.armed) { if (candidate === holding) { this.closed = candidate; this.armed = true; } }
        else if (candidate !== this.closed) { this.closed = candidate; grip = candidate ? 'closed' : 'open'; }
      }
    }
    // Apparent palm size is only a calibrated depth proxy, not metric depth.
    // A stationary, open hand establishes the table plane; rotation can affect it.
    if (!this.baseSize && candidate === false) {
      this.sizes.push(size); if (this.sizes.length > 15) this.sizes.shift();
      if (this.sizes.length === 15 && Math.max(...this.sizes) / Math.min(...this.sizes) < 1.12) this.baseSize = this.sizes.reduce((a, b) => a + b, 0) / 15;
    }
    if (this.baseSize) this.depth += (Math.max(0, Math.min(.12, (size / this.baseSize - 1) * .24)) - this.depth) * .2;
    this.last = { point: reachable({ x: .10 + (1 - this.palm.x) * .80, y: .17 + this.palm.y * .61 }), grip, armed: this.armed, closed: this.closed, depth: this.baseSize ? this.depth : null };
    return this.last;
  }
}
