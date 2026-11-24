import { clipBlade, swordToScreen, SWORD_MAX_AGE_MS, validSword, type SwordFrame } from '../tracking/sword/types';
import { HandGesture } from '../../ui/hand/HandGesture';
import type { PoseFrame } from '../tracking/types';
import type { FestivalInput } from './types';

export const neutral = (): FestivalInput => ({ x: .5, y: .5, angle: 0, action: false });
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const HAND_MAX_AGE_MS = 260;
const HALF_TURN = Math.PI / 2;

/** Signed slope of an undirected segment. Swapping its ends keeps it level. */
export function horizontalAngle(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return 0;
  if (x === 0) return HALF_TURN;
  return Math.atan(y / x);
}

/** A few noisy pixels at vertical must not throw the ferry from full left to full right. */
function stableSlope(dx: number, dy: number, previous: number): number {
  const angle = horizontalAngle(dx, dy);
  if (Math.abs(angle) > HALF_TURN - .09 && Math.abs(previous) > HALF_TURN - .2) {
    return Math.sign(previous) * Math.abs(angle);
  }
  return angle;
}

/** Actions are latched between camera and display frames and consumed exactly once. */
export class FestivalControls {
  private gesture = new HandGesture();
  private source: 'hand' | 'wand' | null = null;
  private observed = -Infinity;
  private last = -Infinity;
  private mediaTime: number | undefined;
  private side?: string;
  private lastAction = -Infinity;
  private anchor = { x: .5, y: .5 };
  private anchorTime = 0;
  private settled = false;
  private input = neutral();

  reset(): void {
    this.observed = -Infinity;
    this.mediaTime = undefined;
    this.invalidate();
  }

  private invalidate(): void {
    this.gesture.reset();
    this.source = null;
    this.last = this.lastAction = -Infinity;
    this.side = undefined;
    this.settled = false;
    this.input = neutral();
  }

  sword(frame: SwordFrame | null, now: number, dwell: boolean): void {
    if (!frame) { this.invalidate(); return; }
    const stamp = frame.timestampMs;
    if (Number.isFinite(stamp) && stamp <= this.observed) return;
    if (!Number.isFinite(now) || !validSword(frame, now)) { this.invalidate(); return; }
    this.observed = stamp;
    const segment = clipBlade(swordToScreen(frame));
    if (!segment) { this.invalidate(); return; }
    const { base, tip } = segment;
    const dx = (tip.x - base.x) * frame.imageAspectRatio;
    const dy = tip.y - base.y;
    if (Math.hypot(dx, dy) < .02) { this.invalidate(); return; }

    const media = Number.isFinite(frame.mediaTimeMs) ? frame.mediaTimeMs : undefined;
    // Duplicate presented images are not new movement, even if delivery timestamps differ.
    if (media !== undefined && media === this.mediaTime) return;
    const mediaGap = media !== undefined && this.mediaTime !== undefined ? media - this.mediaTime : 0;
    const newTrack = this.source !== 'wand' || stamp - this.last > SWORD_MAX_AGE_MS || mediaGap < 0 || mediaGap > 180;
    const moved = Math.hypot((tip.x - this.anchor.x) * frame.imageAspectRatio, tip.y - this.anchor.y);
    const age = stamp - this.anchorTime;
    let trigger = false;
    if (newTrack || moved > (dwell ? .045 : .09)) {
      trigger = !newTrack && !dwell && age <= 230 && stamp - this.lastAction > 290;
      this.anchor = tip;
      this.anchorTime = stamp;
      this.settled = false;
    } else if (dwell && !this.settled && age >= 480) {
      trigger = true;
      this.settled = true;
    } else if (!dwell && age > 230) {
      this.anchor = tip;
      this.anchorTime = stamp;
    }
    if (trigger) this.lastAction = stamp;
    this.input = {
      x: tip.x, y: tip.y, angle: stableSlope(dx, dy, newTrack ? 0 : this.input.angle),
      action: (!newTrack && this.input.action) || trigger,
    };
    this.last = stamp;
    this.mediaTime = media;
    this.source = 'wand';
  }

  hand(frame: PoseFrame | null, now: number): void {
    if (!frame) { this.invalidate(); return; }
    const stamp = frame.timestampMs;
    if (Number.isFinite(stamp) && stamp <= this.observed) return;
    const aspect = frame.imageAspectRatio ?? 4/3;
    if (!Number.isFinite(stamp) || !Number.isFinite(now) || stamp > now + 5 || now - stamp > HAND_MAX_AGE_MS ||
        !Number.isFinite(aspect) || aspect <= 0) { this.invalidate(); return; }
    this.observed = stamp;
    if (this.source !== 'hand' || stamp - this.last > HAND_MAX_AGE_MS ||
        (this.side && frame.handedness && this.side !== frame.handedness)) this.invalidate();
    const point = this.gesture.update(frame, now, { width:800, height:560, allowDrag:false });
    if (!point) { this.invalidate(); return; }
    const [index, pinky] = [frame.landmarks[5], frame.landmarks[17]];
    this.input = {
      x: point.x, y: point.y,
      angle: stableSlope((index.x - pinky.x) * aspect, pinky.y - index.y, this.input.angle),
      action: this.input.action || point.edge === 'down',
    };
    this.last = stamp;
    this.side = frame.handedness;
    this.source = 'hand';
  }

  pointer(x: number, y: number, angle: number, action = false): void {
    if (![x,y,angle].every(Number.isFinite)) return;
    this.input = { x: clamp(x), y: clamp(y), angle, action: action || this.input.action };
  }

  read(now: number, camera: boolean): FestivalInput | null {
    if (camera) {
      if (!this.source) return null;
      const maxAge = this.source === 'wand' ? SWORD_MAX_AGE_MS : HAND_MAX_AGE_MS;
      if (!Number.isFinite(now) || now - this.last > maxAge) {
        this.invalidate();
        return null;
      }
    }
    const snapshot = { ...this.input };
    this.input.action = false;
    return snapshot;
  }
}
