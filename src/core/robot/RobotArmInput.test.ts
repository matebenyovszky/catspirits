import { expect, it } from 'vitest';
import { RobotArmInput } from './RobotArmInput';
import { handFixture } from './handFixture';
it('follows a real shoulder-elbow direction on the matched arm, independent of hand labels', () => {
  const input = new RobotArmInput(), frame = handFixture(100);
  frame.handedness = 'left'; // Image geometry, not label convention, matches body right.
  const a = input.update(frame,100)!; expect(a.x).toBeLessThan(0); expect(a.y).toBeGreaterThan(0);
  const next = handFixture(200); next.armLandmarks![14].x = .3;
  const b = input.update(next,200)!; expect(b.x).toBeGreaterThan(a.x);
  expect(Math.hypot(b.x,b.y,b.z)).toBeCloseTo(1);
});
it('rejects missing, stale or unassociated elbows rather than inventing an arm', () => {
  const input = new RobotArmInput(), frame = handFixture(100);
  expect(input.update({...frame, armLandmarks: []},100)).toBeNull();
  expect(input.update({...frame, armTimestampMs: -200},100)).toBeNull();
  expect(input.update({...frame, armTimestampMs: 300},100)).toBeNull();
  frame.armLandmarks![14].visibility = 0; expect(input.update(frame,100)).toBeNull();
  const other = handFixture(150); other.armLandmarks![16].x = .9; expect(input.update(other,150)).toBeNull();
  other.landmarks[0].x = NaN; expect(input.update(other,150)).toBeNull();
});
