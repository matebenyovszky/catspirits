import { describe, expect, it } from 'vitest';
import { BASE, LINKS, RobotSimulation, distance, elbowFor, reachable, type Point } from './RobotSimulation';
import { RobotHandInput } from './RobotHandInput';
const advance = (game: RobotSimulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 50); i++) game.step(.02); };
const move = (game: RobotSimulation, p: Point, seconds = 3) => { game.aim(p); advance(game, seconds); };
describe('virtual arm and controller ownership', () => {
  it('autonomously completes the clear mission with three distinct deliveries', () => {
    const game = new RobotSimulation(); game.setMode('auto'); advance(game, 60);
    expect(game.complete).toBe(true); expect(game.delivered).toBe(3); expect(game.autoDeliveries).toBe(3);
    const elapsed = game.elapsed; advance(game, 10); expect(game.elapsed).toBe(elapsed);
  });
  it('stops at a shield, accepts a manual detour and continues the held cell without resetting', () => {
    const game = new RobotSimulation(); game.reset(2); game.setMode('auto'); advance(game, 10);
    expect(game.blocked).toBe(true); expect(game.holding).toBe(0); expect(game.tool.x).toBeLessThan(.46 - .025);
    const tool = { ...game.tool }, held = game.holding;
    game.setMode('manual'); expect(game.tool).toEqual(tool); expect(game.target).toEqual(tool); expect(game.holding).toBe(held);
    move(game, { x: .39, y: .72 }); move(game, { x: .72, y: .72 }); move(game, { x: .72, y: .30 });
    game.setMode('auto'); advance(game, 1);
    expect(game.cells[0].delivered).toBe(true); expect(game.takeovers).toBe(1); expect(game.autoDeliveries).toBe(1);
  });
  it('uses dwell to grab and dock, without scoring an incorrect dock or picking delivered cells again', () => {
    const game = new RobotSimulation(); move(game, game.cells[0]); expect(game.holding).toBe(0);
    move(game, game.cells[1].dock); expect(game.delivered).toBe(0); expect(game.holding).toBe(0);
    move(game, game.cells[0].dock); expect(game.cells[0].delivered).toBe(true); expect(game.holding).toBeNull();
    advance(game, 5); expect(game.delivered).toBe(1); expect(game.holding).toBeNull(); expect(game.autoDeliveries).toBe(0);
  });
  it('holds safely on tracking loss, clears the old destination and preserves the task', () => {
    const game = new RobotSimulation(); move(game, game.cells[0]); game.aim(game.cells[0].dock);
    const tool = { ...game.tool }, elapsed = game.elapsed; game.step(.04, false);
    expect(game.tool).toEqual(tool); expect(game.target).toEqual(tool); expect(game.holding).toBe(0); expect(game.elapsed).toBe(elapsed);
    game.setMode('auto'); game.step(.04, false); expect(game.tool.x).toBeGreaterThan(tool.x);
  });
  it('caps time jumps and rejects invalid external commands', () => {
    const game = new RobotSimulation(); const initial = { ...game.tool };
    game.aim({ x: NaN, y: 1 }); expect(game.target).toEqual(initial);
    game.aim({ x: Infinity, y: 0 }); expect(game.target).toEqual(initial);
    game.aim({ x: .2, y: .3 }); game.step(1000); expect(distance(initial, game.tool)).toBeLessThanOrEqual(.019001);
    const after = { ...game.tool }; game.step(NaN); game.step(-10); expect(game.tool).toEqual(after);
    const invalid = new RobotSimulation({ command: () => ({ target: { x: NaN, y: 0 } }) }); invalid.setMode('auto'); invalid.step(.05);
    expect(invalid.tool).toEqual(initial);
  });
  it('does not tunnel through a shield and keeps the two rigid link lengths', () => {
    const game = new RobotSimulation(); game.reset(2); move(game, { x: .23, y: .46 }); move(game, { x: .77, y: .46 }, 10);
    expect(game.tool.x).toBeLessThan(.435); expect(game.blocked).toBe(true);
    for (let x = -1; x <= 2; x += .2) for (let y = -1; y <= 2; y += .2) {
      const tool = reachable({ x, y }), elbow = elbowFor(tool);
      expect(distance(BASE, elbow)).toBeCloseTo(LINKS[0], 8); expect(distance(elbow, tool)).toBeCloseTo(LINKS[1], 8);
    }
  });
  it('provides detached observations so a controller cannot mutate the simulation', () => {
    const game = new RobotSimulation(); const o = game.observation(); o.tool.x = 100; o.cells[0].dock.x = 100;
    expect(game.tool.x).toBe(.5); expect(game.cells[0].dock.x).toBe(.77);
  });
});
describe('camera hand ownership', () => {
  it('mirrors the wrist and refuses stale or swapped hands until a new session', () => {
    const input = new RobotHandInput();
    const frame = { timestampMs: 100, imageAspectRatio: 4 / 3, hands: [{ id: 'right' as const, x: .2, y: .5 }] };
    expect(input.point(frame, 100)?.x).toBeCloseTo(.74); expect(input.point(frame, 400)).toBeNull();
    expect(input.point({ ...frame, hands: [{ id: 'left', x: .8, y: .5 }] }, 100)).toBeNull();
    input.reset(); expect(input.point({ ...frame, hands: [{ id: 'left', x: .8, y: .5 }] }, 100)?.x).toBeCloseTo(.26);
    expect(input.point(null, 100)).toBeNull();
  });
});
