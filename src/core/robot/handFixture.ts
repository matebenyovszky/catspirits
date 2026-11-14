/** Deterministic landmarks for synthetic control tests, not detector accuracy. */
import type { PoseFrame } from '../tracking/types';
export function handFixture(timestampMs: number, closed = false, x = .5, y = .5, scale = 1): PoseFrame {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  for (const [i, dx, dy] of [[0, 0, .10], [5, -.055, 0], [9, 0, -.03], [17, .055, 0], [4, -.025, -.06], [8, closed ? -.015 : .12, -.06]]) {
    landmarks[i] = { x: x + dx * scale, y: y + dy * scale, z: 0 };
  }
  for (const [mcp, pip, tip, dx] of [[5,6,8,-.055], [9,10,12,-.018], [13,14,16,.018], [17,18,20,.055]]) {
    if (mcp !== 9) landmarks[mcp] = { x: x+dx*scale, y, z: 0 };
    landmarks[pip] = { x: x+dx*scale, y: y-.05*scale, z: 0 };
    if (tip !== 8) landmarks[tip] = { x: x+dx*scale, y: y+(closed ? .025 : -.14)*scale, z: 0 };
  }
  const armLandmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 0 }));
  armLandmarks[12] = { x: .5, y: .8, z: 0, visibility: .99 };
  armLandmarks[14] = { x: .7, y: .5, z: -.05, visibility: .99 };
  armLandmarks[16] = { ...landmarks[0], visibility: .99 };
  return { timestampMs, armLandmarks, armTimestampMs: timestampMs, landmarks, worldLandmarks: [], handedness: 'right', handednessScore: .98, inferenceMs: 8, imageAspectRatio: 4 / 3 };
}
