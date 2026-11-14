import { expect, it } from 'vitest';
import { RobotPinchInput } from './RobotPinchInput';
import { handFixture } from './handFixture';
const stable = (input: RobotPinchInput, start: number, closed: boolean, holding = false) => {
  let result; for (let i = 0; i < 5; i++) result = input.update(handFixture(start + i * 40, closed), start + i * 40, holding); return result!;
};
it('requires an open hand to arm, debounces pinch and emits each edge once', () => {
  const input = new RobotPinchInput(); expect(stable(input, 0, true).armed).toBe(false);
  expect(stable(input, 200, false).armed).toBe(true);
  expect(input.update(handFixture(400, true), 400, false)?.grip).toBeNull();
  expect(input.update(handFixture(440, false), 440, false)?.grip).toBeNull();
  for (const t of [480, 520, 560]) expect(input.update(handFixture(t, true), t, false)?.grip).toBeNull();
  expect(input.update(handFixture(600, true), 600, false)?.grip).toBe('closed');
  expect(input.update(handFixture(600, true), 620, true)?.grip).toBeNull();
  for (const t of [640, 680, 720]) expect(input.update(handFixture(t, false), t, true)?.grip).toBeNull();
  expect(input.update(handFixture(760, false), 760, true)?.grip).toBe('open');
});
it('never releases on tracking loss, a swapped hand, or open-hand reacquisition while holding', () => {
  const input = new RobotPinchInput(); stable(input, 0, false); stable(input, 200, true);
  expect(input.update(null, 400, true)).toBeNull();
  expect(stable(input, 440, false, true).armed).toBe(false);
  expect(stable(input, 640, true, true)).toMatchObject({ armed: true, closed: true, grip: null });
  expect(input.update({ ...handFixture(900), handedness: 'left' }, 900, true)).toBeNull();
  expect(input.update(handFixture(900), 1200, true)).toBeNull();
});
it('normalizes pinch by hand size and calibrates depth only from stable open frames', () => {
  const input = new RobotPinchInput(); let result;
  for (let i = 0; i < 20; i++) result = input.update(handFixture(i * 40), i * 40, false);
  expect(result!.depth).toBeCloseTo(0);
  for (let i = 20; i < 40; i++) result = input.update(handFixture(i * 40, false, .5, .5, 1.5), i * 40, false);
  expect(result!.depth).toBeGreaterThan(.10); expect(result!.depth).toBeLessThanOrEqual(.12); expect(result!.closed).toBe(false);
  input.calibrateDepth(); expect(input.update(handFixture(1640), 1640, false)?.depth).toBeNull();
});
it('rejects corrupt, future and too-small landmarks instead of making a gesture', () => {
  const input = new RobotPinchInput(); const f = handFixture(10); f.landmarks[8].x = NaN;
  expect(input.update(f, 10, false)).toBeNull(); expect(input.update(handFixture(500), 100, false)).toBeNull();
  expect(input.update(handFixture(500, false, .5, .5, .01), 500, false)).toBeNull();
});
it('uses full hand opening/closing when selected, with reacquisition and optional pinch mode', () => {
  const input = new RobotPinchInput('hand');
  expect(stable(input,0,true).armed).toBe(false);
  expect(stable(input,200,false).armed).toBe(true);
  expect(stable(input,400,true)).toMatchObject({armed:true,closed:true});
  input.update(null,600,true); expect(stable(input,640,false,true).armed).toBe(false);
  expect(stable(input,840,true,true).armed).toBe(true);
  expect(stable(input,1040,false,true).closed).toBe(false);
  input.setGesture('pinch'); expect(stable(input,1240,false).armed).toBe(true);
});
