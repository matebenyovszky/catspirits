import type { PoseLandmark } from '../tracking/types';
import type { HandLandmarks as Hand } from '../tracking/types';

export type HandSide = 'Left' | 'Right';
type Point = { x: number; y: number };
export type HandMemory = { wrist: Point; bodyBound: boolean };
type Observation = { hand: Hand; wrist: Point; width: number; bodySide?: HandSide };

const sides = ['Left', 'Right'] as const;
const palmJoints = [0, 5, 9, 13, 17];

function imageDistance(a: Point, b: Point, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function landmarkDistance(a: PoseLandmark, b: PoseLandmark, aspect = 1): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);
}

function bodySideFor(wrist: Point, width: number, body: readonly PoseLandmark[], aspect: number): HandSide | undefined {
  const limit = Math.min(.17, Math.max(.065, width * 1.12));
  const distances = [15, 16].map(index => {
    const point = body[index];
    if (!point || (point.visibility ?? 0) < .62 || !(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) return Infinity;
    return imageDistance(wrist, point, aspect);
  });
  const closer = distances[0] <= distances[1] ? 0 : 1;
  if (distances[closer] <= limit && distances[1 - closer] - distances[closer] >= limit * .32) return sides[closer];
}

export function associateHands(
  hands: readonly Hand[], body: readonly PoseLandmark[], tracks: ReadonlyMap<HandSide, HandMemory>, aspect: number,
): { side: HandSide; observation: Observation }[] {
  const observations = hands.flatMap(hand => {
    const { points } = hand;
    if (points.length !== 21 || !Number.isFinite(hand.score)
      || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
    const width = landmarkDistance(points[5], points[17], aspect);
    if (!(width >= .022 && width <= .72)) return [];
    return [{ hand, wrist: points[0], width, bodySide: bodySideFor(points[0], width, body, aspect) }];
  });
  const [first, second] = observations;
  if (!first) return [];

  const cost = (observation: Observation, side: HandSide) => {
    const previous = tracks.get(side);
    const distance = previous ? imageDistance(observation.wrist, previous.wrist, aspect) : Infinity;
    const continuity = Math.min(.21, distance * 1.33);
    const label = side === observation.hand.side ? 0 : .042 * observation.hand.score;
    const bodyMismatch = observation.bodySide && observation.bodySide !== side;
    // A close match to an already confirmed wrist keeps its identity through
    // brief, ambiguous pose estimates when the arms or hands cross.
    const confirmed = previous?.bodyBound && distance < .10;
    const anatomy = bodyMismatch ? (confirmed ? .10 : .30) : 0;
    return continuity + label + anatomy - (confirmed ? .06 : 0);
  };

  const single = (observation: Observation) => [{
    observation, side: cost(observation, 'Left') <= cost(observation, 'Right') ? 'Left' as const : 'Right' as const,
  }];
  if (!second) return single(first);

  const overlapLimit = Math.min(.037, Math.max(.016, Math.min(first.width, second.width) * .29));
  const palmShift = palmJoints.reduce((sum, joint) => sum +
    imageDistance(first.hand.points[joint], second.hand.points[joint], aspect), 0) / palmJoints.length;
  if (palmShift <= overlapLimit && imageDistance(first.wrist, second.wrist, aspect) <= overlapLimit * 1.2) {
    const penalty = (item: Observation) => Math.min(cost(item, 'Left'), cost(item, 'Right')) - item.hand.score * .025;
    return single(penalty(first) <= penalty(second) ? first : second);
  }

  return cost(first, 'Left') + cost(second, 'Right') <= cost(second, 'Left') + cost(first, 'Right')
    ? [{ side: 'Left', observation: first }, { side: 'Right', observation: second }]
    : [{ side: 'Left', observation: second }, { side: 'Right', observation: first }];
}
