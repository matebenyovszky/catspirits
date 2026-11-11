/** Deterministic landmarks for synthetic control tests, not detector accuracy. */
import type { PoseFrame } from '../tracking/types';
export function handFixture(timestampMs: number, closed = false, x = .5, y = .5, scale = 1): PoseFrame {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  for (const [i, dx, dy] of [[0, 0, .10], [5, -.055, 0], [9, 0, -.10], [17, .055, 0], [4, -.025, -.06], [8, closed ? -.015 : .12, -.06]]) {
    landmarks[i] = { x: x + dx * scale, y: y + dy * scale, z: 0 };
  }
  return { timestampMs, landmarks, worldLandmarks: [], handedness: 'right', handednessScore: .98, inferenceMs: 8, imageAspectRatio: 4 / 3 };
}
