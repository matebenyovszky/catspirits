import { describe, expect, it } from 'vitest';
import { BladeSimulation } from './BladeSimulation';
import type { SwordFrame } from '../tracking/sword/types';
const blade = (x: number, time: number, mask = 15): SwordFrame => ({ timestampMs: time, base: { x: 1 - x, y: .35 }, tip: { x: 1 - x, y: .65 }, confidence: 1, source: 'four-ring-2d', imageAspectRatio: 1, supportMask: mask });
function round() {
  const game = new BladeSimulation(); game.start(1);
  Object.assign(game.targets[0], { active: true, id: 100, x: .5, y: .5 }); return game;
}
describe('Neon Blade measured gameplay', () => {
  it('catches fast sweeps, scores each crystal once, and keeps practice coordinates mirrored consistently', () => {
    const game = round(); game.accept(blade(.2, 10), 10); game.accept(blade(.8, 43), 43);
    expect(game.cuts).toBe(1); expect(game.score).toBe(10); expect(game.bursts).toHaveLength(1);
    game.accept(blade(.2, 76), 76); expect(game.score).toBe(10);
  });
  it('never awards hits from stationary, duplicate, stale or missing observations', () => {
    for (const middle of [null, blade(.8, -200), { ...blade(.8, 25), confidence: .1 }]) {
      const game = round(); game.accept(blade(.2, 10), 10); game.accept(middle, 25); game.accept(blade(.8, 43), 43);
      expect(game.cuts).toBe(0);
    }
    const game = round(); game.accept(blade(.5, 10), 10); game.accept(blade(.5, 43), 43);
    game.accept(blade(.8, 43), 43); expect(game.cuts).toBe(0);
  });
  it('does not bridge changes in visible rings, aspect ratio, pause, or old captures', () => {
    for (const next of [blade(.8, 43, 7), { ...blade(.8, 43), imageAspectRatio: .75 }, blade(.8, 200)]) {
      const game = round(); game.accept(blade(.2, 10), 10); game.accept(next, next.timestampMs); expect(game.cuts).toBe(0);
    }
    const game = round(); game.accept(blade(.2, 10), 10); game.update(1, false); game.update(.01, true);
    game.accept(blade(.8, 43), 43); expect(game.cuts).toBe(0);
  });
  it('pauses time and targets on tracking loss, finishes in 60 active seconds and bounds pools', () => {
    const game = round(); game.update(50, false); expect(game.elapsed).toBe(0);
    for (let i = 0; i < 1201; i++) game.update(.05, true);
    expect(game.phase).toBe('over'); expect(game.remaining).toBe(0);
    expect(game.targets).toHaveLength(10); expect(game.missed).toBeGreaterThan(30);
    const score = game.score; game.accept(blade(.2, 10), 10); game.accept(blade(.8, 43), 43); expect(game.score).toBe(score);
  });
  it('builds bounded multipliers, triples gold, and resets combo on a miss', () => {
    const game = round();
    for (let i = 0; i < 20; i++) {
      Object.assign(game.targets[0], { active: true, id: i + 100, x: .5, y: .5, gold: false });
      game.breakSweep(); game.accept(blade(.2, i * 66 + 1), i * 66 + 1); game.accept(blade(.8, i * 66 + 34), i * 66 + 34);
    }
    expect(game.multiplier).toBe(4); expect(game.bestCombo).toBe(20);
    const before = game.score; Object.assign(game.targets[0], { active: true, id: 1000, gold: true });
    game.breakSweep(); game.accept(blade(.2, 1400), 1400); game.accept(blade(.8, 1433), 1433); expect(game.score - before).toBe(120);
    Object.assign(game.targets[0], { active: true, y: 1.2, age: 2 }); game.update(.02, true);
    expect(game.combo).toBe(0); expect(game.bestCombo).toBe(21);
  });
});
