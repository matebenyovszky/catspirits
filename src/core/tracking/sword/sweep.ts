import type { Point2, SwordFrame } from './types';

const lerp = (a: Point2, b: Point2, t: number): Point2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function segmentDistance(p: Point2, a: Point2, b: Point2, aspect = 1): number {
  const dx = (b.x - a.x) * aspect, dy = b.y - a.y;
  const px = (p.x - a.x) * aspect, py = p.y - a.y;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - dx * t, py - dy * t);
}

/** Continuous linear interpolation between two observations, not extrapolation.
 * Adaptive interval rejection uses a Lipschitz speed bound, so fast motion does
 * not tunnel through targets. At sub-pixel tolerance we fail closed, not award
 * a speculative hit. Endpoints and target all move over the same interval. */
export function sweptBladeHits(from: SwordFrame, to: SwordFrame, targetFrom: Point2, targetTo: Point2, radius: number): boolean {
  const aspect = to.imageAspectRatio;
  const movement = (a: Point2, b: Point2) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const speedBound = Math.max(movement(from.base, to.base), movement(from.tip, to.tip)) + movement(targetFrom, targetTo);
  const distance = (t: number) => segmentDistance(lerp(targetFrom, targetTo, t), lerp(from.base, to.base, t), lerp(from.tip, to.tip, t), aspect);
  if (distance(0) <= radius || distance(1) <= radius) return true;
  const intersects = (lo: number, hi: number, depth: number): boolean => {
    const mid = (lo + hi) / 2, d = distance(mid);
    if (d <= radius) return true;
    if (d - speedBound * (hi - lo) / 2 > radius || depth >= 14) return false;
    return intersects(lo, mid, depth + 1) || intersects(mid, hi, depth + 1);
  };
  return intersects(0, 1, 0);
}
