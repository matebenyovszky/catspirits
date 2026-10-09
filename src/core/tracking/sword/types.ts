/** Measured image-plane points, unmirrored, normalized to the camera image.
 * No depth, axial roll or predicted observations are implied by this API. */
export type Point2 = { x: number; y: number };
export type SwordFrame = {
  timestampMs: number;
  base: Point2;
  tip: Point2;
  confidence: number;
  imageAspectRatio: number;
  source: 'color-bands-2d';
};
export type SwordDetection = {
  frame: SwordFrame | null;
  scannedPixels: number;
  search: 'full' | 'roi';
  reason: string;
};
export const SWORD_MAX_AGE_MS = 120;
export function validSword(frame: SwordFrame, nowMs: number): boolean {
  return Number.isFinite(frame.timestampMs) && frame.timestampMs <= nowMs + 5
    && nowMs - frame.timestampMs <= SWORD_MAX_AGE_MS
    && Number.isFinite(frame.confidence) && frame.confidence >= .55
    && Number.isFinite(frame.imageAspectRatio) && frame.imageAspectRatio > 0
    && [frame.base, frame.tip].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
      && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}

/** Match the mirrored camera preview used by the game's controls. */
export function swordToScreen(frame: SwordFrame): SwordFrame {
  return { ...frame, base: { x: 1 - frame.base.x, y: frame.base.y }, tip: { x: 1 - frame.tip.x, y: frame.tip.y } };
}
