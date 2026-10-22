import type { Point2, SwordFrame } from './types';

export function segmentDistance(p: Point2, a: Point2, b: Point2, aspect = 1): number {
  const dx = (b.x - a.x) * aspect, dy = b.y - a.y;
  const px = (p.x - a.x) * aspect, py = p.y - a.y;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - dx * t, py - dy * t);
}
export type BladeContact = { time: number; along: number };

/** Continuous measured interpolation. A Lipschitz bound rejects empty intervals;
 * a fixed work budget prevents near-tangent sweeps from monopolising the UI
 * thread. Unresolved sub-pixel grazes fail closed. No extrapolated hits. */
export function sweptBladeContact(from: SwordFrame, to: SwordFrame, targetFrom: Point2, targetTo: Point2, radius: number): BladeContact | null {
  const aspect = to.imageAspectRatio;
  const bx = from.base.x * aspect, by = from.base.y, tx = from.tip.x * aspect, ty = from.tip.y;
  const dbx = to.base.x * aspect - bx, dby = to.base.y - by, dtx = to.tip.x * aspect - tx, dty = to.tip.y - ty;
  const px = targetFrom.x * aspect, py = targetFrom.y, dpx = targetTo.x * aspect - px, dpy = targetTo.y - py;
  const speedBound = Math.max(Math.hypot(dbx, dby), Math.hypot(dtx, dty)) + Math.hypot(dpx, dpy);
  let along = 0, budget = 128;
  const distance = (t: number): number => {
    const ax = bx + dbx * t, ay = by + dby * t;
    const dx = tx + dtx * t - ax, dy = ty + dty * t - ay;
    const x = px + dpx * t - ax, y = py + dpy * t - ay;
    along = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - dx * along, y - dy * along);
  };
  if (distance(0) <= radius) return { time: 0, along };
  if (distance(1) <= radius) return { time: 1, along };
  const intersects = (lo: number, hi: number, depth: number): BladeContact | null => {
    if (--budget < 0) return null;
    const mid = (lo + hi) / 2, d = distance(mid);
    if (d <= radius) return { time: mid, along };
    if (d - speedBound * (hi - lo) / 2 > radius || depth >= 14) return null;
    return intersects(lo, mid, depth + 1) ?? intersects(mid, hi, depth + 1);
  };
  return intersects(0, 1, 0);
}
export function sweptBladeHits(from: SwordFrame, to: SwordFrame, targetFrom: Point2, targetTo: Point2, radius: number): boolean {
  return sweptBladeContact(from, to, targetFrom, targetTo, radius) !== null;
}
