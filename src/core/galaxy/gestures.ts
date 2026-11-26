import type { PoseLandmark } from '../tracking/types';
import type { HandLandmarks as Hand } from '../tracking/types';
import { associateHands, landmarkDistance, type HandMemory, type HandSide } from './HandAssociation';

export type { HandSide } from './HandAssociation';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aimBlend = (elapsed: number) => 1 - Math.exp(-Math.min(100, elapsed) / 43);
type Point = { x: number; y: number };
type Cursor = Point & { held: boolean; edge?: 'down' | 'up'; dragging: boolean };
type HandPosition = { cursor: Cursor; contact: Point; projectedContact: Point; freeAim: Point; pinched: boolean };
type Screen = { width: number; height: number };
export type TrackedHand = HandPosition & Pick<Hand, 'points' | 'worldPoints'> & { side: HandSide };
export type HandFrame = {
  time: number;
  aspect: number;
  hands: TrackedHand[];
  cancel: boolean;
  grab?: { dx: number; dy: number; zoom: number };
};
type HandTrack = HandMemory & { gesture: PinchGesture; time: number; shown: boolean; pinched: boolean };
type PinchPair = { x: number; y: number; gap: number };
const HAND_GRACE_MS = 180;

/** Tératlasz pinch tracking, adapted from Catspirits HandGesture.
 * An open hand arms a session. The cursor holds its pre-pinch aim through release. */
class PinchGesture {
  private lastTime = -Infinity;
  private openSince = Infinity;
  private candidateSince = Infinity;
  private candidate = false;
  private armed = false;
  private pinched = false;
  private position?: Point;
  private anchor?: Point;
  private anchorTime = 0;
  private heldSince = 0;
  private dragSince = Infinity;
  private dragOrigin?: Point;
  private dragging = false;
  private releaseUntil = 0;
  private freeAim?: Point;

  update(hand: Hand, time: number, aspect: number, screen: Screen): HandPosition | undefined {
    const points = hand.points;
    if (time <= this.lastTime) return;
    const imageRatio = landmarkDistance(points[4], points[8], aspect) / landmarkDistance(points[5], points[17], aspect);
    const world = hand.worldPoints;
    const worldWidth = world?.length === 21 ? landmarkDistance(world[5], world[17]) : 0;
    const worldRatio = world && worldWidth > .025 && worldWidth < .18 ? landmarkDistance(world[4], world[8]) / worldWidth : NaN;
    // Keep strong depth evidence for separated fingers, while letting the
    // image landmarks compensate when the 3D estimate overstates a small gap.
    const ratio = !Number.isFinite(worldRatio) ? imageRatio
      : worldRatio >= .76 || !Number.isFinite(imageRatio) ? worldRatio
      : Math.min(worldRatio, Math.max(worldRatio * .64, imageRatio));
    if (!Number.isFinite(ratio)) return;
    const contact = { x: 1 - (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2 };
    const target = { x: clamp((contact.x - .16) / .68, 0, 1), y: clamp((contact.y - .12) / .72, 0, 1) };
    const alpha = aimBlend(time - this.lastTime);
    this.lastTime = time;
    const previousAim = this.freeAim ?? target;
    this.freeAim = {
      x: previousAim.x + (target.x - previousAim.x) * alpha,
      y: previousAim.y + (target.y - previousAim.y) * alpha,
    };

    if (!this.armed) {
      if (ratio > .64) {
        this.openSince = Math.min(time, this.openSince);
        this.armed = time - this.openSince >= 145;
      } else {
        this.openSince = Infinity;
      }
    }
    if (this.armed && !this.anchor && ratio < .65) {
      this.anchor = this.position ?? target;
      this.anchorTime = time;
    }
    const closed = ratio < (this.pinched ? .61 : .38);
    if (closed !== this.candidate) {
      this.candidateSince = time;
      this.candidate = closed;
    }
    let edge: Cursor['edge'];
    if (this.pinched !== closed && time - this.candidateSince >= 48) {
      this.pinched = closed;
      if (this.armed) edge = closed ? 'down' : 'up';
    }
    if (edge) {
      if (closed) {
        this.anchor = this.position ?? target;
        this.heldSince = time;
        this.dragOrigin = target;
        this.dragSince = Infinity;
        this.dragging = false;
        this.releaseUntil = 0;
      } else {
        this.releaseUntil = time + 115;
      }
    }

    const held = this.pinched && this.armed;
    const dragOrigin = this.dragOrigin;
    if (this.anchor && held && closed && dragOrigin && time - this.heldSince >= 180) {
      const motion = Math.hypot((target.x - dragOrigin.x) * screen.width, (target.y - dragOrigin.y) * screen.height);
      this.dragSince = motion >= 25 ? Math.min(this.dragSince, time) : Infinity;
      if (!this.dragging && time - this.dragSince >= 65) {
        this.dragging = true;
        this.dragOrigin = target;
      }
    }

    const wasDragging = this.dragging;
    if ((!closed && !held && time >= this.releaseUntil && (ratio > .72 || this.releaseUntil > 0))
        || (!closed && !held && !this.releaseUntil && time - this.anchorTime > 380)) {
      this.anchor = undefined;
      this.dragging = false;
    }
    let goal = this.anchor ?? target;
    if (held && this.dragging && this.anchor && this.dragOrigin) {
      goal = {
        x: clamp(this.anchor.x + target.x - this.dragOrigin.x, 0, 1),
        y: clamp(this.anchor.y + target.y - this.dragOrigin.y, 0, 1),
      };
    } else if (wasDragging && !held) {
      goal = this.position ?? goal;
    }
    const position = this.position ?? goal;
    this.position = { x: position.x + (goal.x - position.x) * alpha, y: position.y + (goal.y - position.y) * alpha };
    return {
      cursor: { ...this.position, held, edge, dragging: wasDragging },
      contact,
      projectedContact: target,
      freeAim: this.freeAim,
      pinched: this.pinched,
    };
  }
}

export class HandGestures {
  private readonly tracks = new Map<HandSide, HandTrack>();
  private body?: { points: readonly PoseLandmark[]; time: number; aspect: number };
  private lastTime = -Infinity;
  private waitForRelease = false;
  private pair?: PinchPair;

  reset(): void {
    this.tracks.clear();
    this.body = undefined;
    this.lastTime = -Infinity;
    this.waitForRelease = false;
    this.pair = undefined;
  }

  update(hands: readonly Hand[], time: number, aspect: number, screen: Screen, body?: readonly PoseLandmark[]): HandFrame {
    const gapReset = time - this.lastTime > 320;
    if (gapReset) this.reset();
    const previousFrame = this.lastTime;
    this.lastTime = time;
    if (body) this.body = { points: body, time, aspect };
    const pose = this.body;
    const freshBody = pose && time - pose.time <= 130 && Math.abs(pose.aspect - aspect) < .04 ? pose.points : [];
    for (const [side, track] of this.tracks) if (time - track.time > HAND_GRACE_MS) this.tracks.delete(side);

    const found: TrackedHand[] = [];
    const matches = associateHands(hands, freshBody, this.tracks, aspect);
    for (const { side, observation } of matches) {
      const { hand, wrist, bodySide } = observation;
      const previous = this.tracks.get(side);
      const nearby = previous && Math.hypot((previous.wrist.x - wrist.x) * aspect, previous.wrist.y - wrist.y) < .24;
      const continuous = nearby && (previous.time === previousFrame || this.waitForRelease);
      const gesture = continuous ? previous.gesture : new PinchGesture();
      const state = gesture.update(hand, time, aspect, screen);
      if (!state) continue;
      const bodyBound = bodySide === side || !!(nearby && previous.bodyBound);
      // An unsupported second detection must survive a second frame before it gets a cursor.
      const shown = matches.length === 1 || bodyBound || !!(nearby && (previous.shown || previous.time === previousFrame));
      this.tracks.set(side, { gesture, wrist, bodyBound, time, shown, pinched: state.pinched });
      if (shown) found.push({ side, points: hand.points, worldPoints: hand.worldPoints, ...state });
    }

    const held = found.filter(hand => hand.pinched);
    if (held.length === 2) {
      this.waitForRelease = true;
      const [first, second] = held;
      const centerX = (first.projectedContact.x + second.projectedContact.x) * screen.width / 2;
      const centerY = (first.projectedContact.y + second.projectedContact.y) * screen.height / 2;
      const gap = Math.max(.047, Math.hypot((second.contact.x - first.contact.x) * aspect, second.contact.y - first.contact.y));
      const previous = this.pair ?? { x: centerX, y: centerY, gap };
      const dx = centerX - previous.x, dy = centerY - previous.y;
      const pan = Math.hypot(dx, dy) >= 2.5 ? aimBlend(time - previousFrame) : 0;
      const nextGap = .57 * previous.gap + .43 * gap;
      const zoom = Math.abs(nextGap - previous.gap) > .003 ? clamp(nextGap / previous.gap, .84, 1.18) : 1;
      this.pair = { x: previous.x + dx * pan, y: previous.y + dy * pan, gap: previous.gap * zoom };
      return { time, aspect, hands: found, cancel: true, grab: { dx: dx * pan, dy: dy * pan, zoom } };
    }
    if (this.waitForRelease) {
      // Resume with a fresh baseline on reacquisition to avoid a jump across missing frames.
      this.pair = undefined;
      if (!held.length && ![...this.tracks.values()].some(track => track.pinched)) this.waitForRelease = false;
      return { time, aspect, hands: found, cancel: true };
    }
    return { time, aspect, hands: found, cancel: gapReset || !found.length };
  }
}

export class TorsoLean {
  private baseline?: number;
  private calibrationStart = 0;
  private samples: number[] = [];

  reset(): void {
    this.baseline = undefined;
    this.samples = [];
  }

  update(points: readonly PoseLandmark[], time: number): { tracked: boolean; calibrated: boolean; yaw: number } {
    const left = points[11], right = points[12];
    const width = left && right ? Math.abs(left.x - right.x) : 0;
    if (!(width > .065) || !left || !right || (left.visibility ?? 0) < .55 || (right.visibility ?? 0) < .55) {
      this.samples = [];
      return { tracked: false, calibrated: this.baseline !== undefined, yaw: 0 };
    }
    const middle = (left.x + right.x) * .5;
    if (this.baseline === undefined) {
      if (!this.samples.length || Math.abs(middle - this.samples[0]) > .055) {
        this.calibrationStart = time;
        this.samples = [];
      }
      this.samples.push(middle);
      if (time - this.calibrationStart >= 820 && this.samples.length >= 5) {
        this.baseline = this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
        this.samples = [];
      }
      return { tracked: true, calibrated: this.baseline !== undefined, yaw: 0 };
    }
    const lean = (this.baseline - middle) / width;
    const offset = Math.sign(lean) * Math.max(0, Math.abs(lean) - .06);
    return { tracked: true, calibrated: true, yaw: clamp(offset * .70, -.30, .30) };
  }
}
