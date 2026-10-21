import type { ColorBlob } from './ColorWandDetector';

// A line in 3D projects to a line, but distances along it are fractional-linear.
// Endpoints remain q(0)=0, q(1)=1. k is relative depth change, NOT metric depth.
export const projectivePosition = (t: number, k: number): number => (1 + k) * t / (1 + k * t);
export const PERSPECTIVE_HOLD_MS = 1000;
const INNER = [8.5 / 30, 20.5 / 30];

/** Four independent observations validate perspective; three alone would fit
 * any collinear triplet exactly and manufacture false identities. Pre-gating
 * by line distance/order keeps the usual two-pink/two-green case tiny. */
export function projectiveSeeds(blobs: [ColorBlob[], ColorBlob[]], maxSpan: number,
  accept: (pink: ColorBlob, green: ColorBlob, k: number) => void): void {
  if (blobs[0].length < 2 || blobs[1].length < 2) return;
  for (const a of blobs[0]) for (const b of blobs[1]) {
    const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
    const span = Math.sqrt(squared);
    if (span < 24 || span > maxSpan) continue;
    const tolerance = Math.max(1.5, span * .012);
    const position = (p: ColorBlob) => {
      if (Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) > tolerance * span) return NaN;
      return ((p.x - a.x) * dx + (p.y - a.y) * dy) / squared;
    };
    for (const p of blobs[0]) {
      if (p === a) continue;
      const q1 = position(p), t1 = INNER[0];
      if (!(q1 > .12 && q1 < .48)) continue;
      const k1 = (t1 - q1) / (t1 * (q1 - 1));
      for (const g of blobs[1]) {
        if (g === b) continue;
        const q2 = position(g), t2 = INNER[1];
        if (!(q2 > q1 + .12 && q2 < .9)) continue;
        const k2 = (t2 - q2) / (t2 * (q2 - 1));
        const k = (k1 + k2) / 2;
        // Bounded, monotone projection, away from its pole. Both interior
        // markers must independently agree; this is a cross-ratio constraint.
        if (!Number.isFinite(k) || k < -.45 || k > .8) continue;
        if (Math.abs(projectivePosition(t1, k) - q1) * span > tolerance
          || Math.abs(projectivePosition(t2, k) - q2) * span > tolerance) continue;
        accept(a, b, k);
      }
    }
  }
}
