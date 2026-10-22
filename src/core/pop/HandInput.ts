import type { PoseFrame } from '../tracking/types';
import type { Point2 } from '../tracking/sword/types';
export type HandPoint = Point2 & { id: 'left' | 'right' };
export type HandFrame = { timestampMs: number; imageAspectRatio: number; hands: HandPoint[] };
export const HAND_MAX_AGE_MS = 200;
export const HAND_RADIUS = .035;
export function validHands(frame: HandFrame, now: number): boolean {
  return Number.isFinite(frame.timestampMs) && frame.timestampMs <= now + 5 && now - frame.timestampMs <= HAND_MAX_AGE_MS
    && Number.isFinite(frame.imageAspectRatio) && frame.imageAspectRatio > 0
    && frame.hands.length > 0 && frame.hands.length <= 2 && new Set(frame.hands.map(h => h.id)).size === frame.hands.length
    && frame.hands.every(h => (h.id === 'left' || h.id === 'right') && Number.isFinite(h.x) && Number.isFinite(h.y) && h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1);
}
/** Uses the existing local pose model's wrists (15/16). Both arms are checked
 * independently; no finger recognition, new model download or cloud service. */
export function handsFromPose(pose: PoseFrame, now: number): HandFrame | null {
  const hands: HandPoint[] = [];
  for (const [id, wrist, elbow] of [['left', 15, 13], ['right', 16, 14]] as const) {
    const w = pose.landmarks[wrist], e = pose.landmarks[elbow];
    if (w && e && (w.visibility ?? 0) >= .6 && (e.visibility ?? 0) >= .5
      && [w.x, w.y, e.x, e.y].every(Number.isFinite) && w.x >= 0 && w.x <= 1 && w.y >= 0 && w.y <= 1) hands.push({ id, x: w.x, y: w.y });
  }
  const frame = { timestampMs: pose.timestampMs, imageAspectRatio: pose.imageAspectRatio ?? 0, hands };
  return validHands(frame, now) ? frame : null;
}
