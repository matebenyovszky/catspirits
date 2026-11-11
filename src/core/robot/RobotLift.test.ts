import { expect, it } from 'vitest';
import { RobotSimulation } from './RobotSimulation';
const tick = (g: RobotSimulation, seconds: number) => { for (let i = 0; i < seconds * 50; i++) g.step(.02, true, false); };
it('raises after grasp, freezes on missing input and settles before awarding a delivery', () => {
  const g = new RobotSimulation(); g.aim(g.cells[0]); tick(g, 2); g.setGripper('closed'); tick(g, 1);
  expect(g.holding).toBe(0); expect(g.lift).toBe(.06); expect(g.cells[0].height).toBe(.06);
  const pose = { ...g.tool }; g.step(.05, false); expect(g.tool).toEqual(pose); expect(g.lift).toBe(.06);
  g.aim(g.cells[0].dock); tick(g, 2); g.setGripper('open'); expect(g.delivered).toBe(0); tick(g, 1);
  expect(g.delivered).toBe(1); expect(g.cells[0].height).toBe(0);
});
it('supports bounded third-axis movement and refuses an airborne grasp', () => {
  const g = new RobotSimulation(); g.aim(g.cells[0]); tick(g, 2); g.setDepth(.12); tick(g, 1);
  g.setGripper('closed'); expect(g.holding).toBeNull(); expect(g.lift).toBe(.12);
  g.setDepth(0); tick(g, 1); g.setGripper('closed'); expect(g.holding).toBe(0);
  g.setDepth(100); tick(g, 1); expect(g.cells[0].height).toBe(.12);
  g.setMode('auto'); tick(g, 1); expect(g.lift).toBe(.06);
});
