/** Image-plane blade endpoints, unmirrored, normalized to the camera image.
 * Four-ring endpoints can be reconstructed from fresh visible ring centroids;
 * inferredEndpoints labels that case. Such endpoints may lie outside [0,1];
 * keep their geometry for tracking, clip for display/hits. No depth/axial roll. */
export type Point2 = { x: number; y: number };
export type SwordFrame = {
  timestampMs: number;
  /** Camera media clock, used only for motion derivatives, not freshness. */
  mediaTimeMs?: number;
  base: Point2;
  tip: Point2;
  confidence: number;
  imageAspectRatio: number;
  source: 'color-bands-2d' | 'four-ring-2d';
  visibleRings?: number;
  inferredEndpoints?: boolean;
  supportMask?: number;
  /** Bounded relative depth slope of the ring constellation; not metric Z. */
  perspective?: number;
  /** Conservative visual scale ratio only; not calibrated depth or axial roll. */
  scaleCue?: {tipToBase:number;confidence:number};
  /** Only actually observed ring centroids, for the camera preview. */
  rings?: (Point2 & { id: number })[];
};
export type SwordDetection = {
  frame: SwordFrame | null;
  scannedPixels: number;
  search: 'full' | 'roi';
  reason: string;
};
export const SWORD_MAX_AGE_MS = 120;
export const inCamera = (p: Point2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

/** Parametric segment/viewport intersection; never clamp endpoints separately
 * (that changes the blade's angle). Input remains untouched. */
export function clipBlade(blade: { base: Point2; tip: Point2 }): {base: Point2; tip: Point2} | null {
  let lo = 0, hi = 1;
  for (const axis of ['x', 'y'] as const) {
    const start = blade.base[axis], delta = blade.tip[axis] - start;
    if (!Number.isFinite(start) || !Number.isFinite(delta)) return null;
    if (Math.abs(delta) < 1e-12) { if (start < 0 || start > 1) return null; continue; }
    const a = -start / delta, b = (1 - start) / delta;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return null;
  }
  const point = (t: number) => t === 0 ? { ...blade.base } : t === 1 ? { ...blade.tip }
    : { x: blade.base.x + (blade.tip.x - blade.base.x) * t,
      y: blade.base.y + (blade.tip.y - blade.base.y) * t };
  return { base: point(lo), tip: point(hi) };
}

function supportedGeometry(frame: SwordFrame): boolean {
  if ([frame.base, frame.tip].every(inCamera)) return true;
  // Only measured four-ring fits can reconstruct offscreen endpoints, never
  // legacy two-colour estimates or unbounded extrapolated/predicted positions.
  if (frame.source !== 'four-ring-2d' || !frame.inferredEndpoints || !frame.supportMask
    || !frame.rings || frame.rings.length < 2 || frame.rings.length > 4
    || new Set(frame.rings.map(r => r.id)).size !== frame.rings.length
    || frame.rings.some(r => !Number.isInteger(r.id) || r.id < 0 || r.id > 3 || !inCamera(r))
    || frame.rings.reduce((m, r) => m | 1 << r.id, 0) !== frame.supportMask) return false;
  const aspect = frame.imageAspectRatio;
  const span = Math.hypot((frame.tip.x - frame.base.x) * aspect, frame.tip.y - frame.base.y);
  if (!Number.isFinite(span) || span <= 0 || span > Math.hypot(aspect, 1) * .801 || !clipBlade(frame)) return false;
  return [frame.base, frame.tip].every((p, i) => {
    if (inCamera(p)) return true;
    if (frame.supportMask! & (i === 0 ? 1 : 8)) return false;
    const outside = Math.hypot((p.x - Math.max(0, Math.min(1, p.x))) * aspect,
      p.y - Math.max(0, Math.min(1, p.y)));
    // The largest missing prefix is 20.5 of the 30 cm measured span.
    return Number.isFinite(outside) && outside <= span * .72;
  });
}
export function validSword(frame: SwordFrame, nowMs: number): boolean {
  return Number.isFinite(frame.timestampMs) && frame.timestampMs <= nowMs + 5
    && nowMs - frame.timestampMs <= SWORD_MAX_AGE_MS
    && Number.isFinite(frame.confidence) && frame.confidence >= .55
    && Number.isFinite(frame.imageAspectRatio) && frame.imageAspectRatio > 0
    && supportedGeometry(frame);
}

/** The player's anatomical left stays on screen left in both avatar views. */
export function swordToScreen(frame: SwordFrame): SwordFrame {
  return { ...frame, base: { x: 1 - frame.base.x, y: frame.base.y }, tip: { x: 1 - frame.tip.x, y: frame.tip.y },
    rings: frame.rings?.map(r => ({ ...r, x: 1 - r.x })) };
}
