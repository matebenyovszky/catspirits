import { describe, expect, it } from 'vitest';
import { BladeSimulation } from './BladeSimulation';
import type { SwordFrame } from '../tracking/sword/types';
const blade = (x: number, time: number, mask = 15): SwordFrame => ({ timestampMs: time, base: { x: 1 - x, y: .35 }, tip: { x: 1 - x, y: .65 }, confidence: 1, source: 'four-ring-2d', imageAspectRatio: 1, supportMask: mask });
function round() {
  const game = new BladeSimulation(); game.start(1, 2);
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

describe('deliberate cuts and hazards', () => {
  const directedBlade = (direction: number, offset: number, timestampMs: number): SwordFrame => {
    const [dx, dy] = [[1, 0], [0, -1], [-1, 0], [0, 1]][direction];
    const x = .5 + dx * offset, y = .5 + dy * offset;
    return { ...blade(.5, timestampMs), base: { x: 1 - (x - dy * .15), y: y + dx * .15 }, tip: { x: 1 - (x + dy * .15), y: y - dx * .15 } };
  };
  it('requires all four arrow directions in mirrored camera coordinates', () => {
    for (let direction = 0; direction < 4; direction++) {
      const game = round(); game.targets[0].direction = direction;
      game.accept(directedBlade(direction, -.3, 100), 100); game.accept(directedBlade(direction, .3, 133), 133);
      expect(game.cuts, `direction ${direction}`).toBe(1);
      const wrong = round(); wrong.targets[0].direction = direction; wrong.combo = 5;
      wrong.accept(directedBlade(direction, .3, 100), 100); wrong.accept(directedBlade(direction, -.3, 133), 133);
      expect(wrong.score).toBe(0); expect(wrong.combo).toBe(0); expect(wrong.mistakes).toBe(1); expect(wrong.targets[0].active).toBe(true);
    }
  });
  it('ignores tiny jitter after a wrong contact but allows a later deliberate cut', () => {
    const game = round(); game.accept(blade(.7, 100), 100); game.accept(blade(.5, 133), 133);
    expect(game.mistakes).toBe(1);
    game.accept(null, 140); game.accept(blade(.5, 150), 150); game.accept(blade(.505, 183), 183);
    expect(game.score).toBe(0); expect(game.mistakes).toBe(1);
    game.accept(blade(.2, 216), 216); game.accept(blade(.8, 249), 249); expect(game.score).toBe(10);
  });
  it('does not credit slow drift or a moving tip when the struck handle is stationary', () => {
    const game = round(); game.accept(blade(.5, 100), 100); game.accept(blade(.51, 133), 133); expect(game.score).toBe(0);
    const pivot = round();
    const a = { ...blade(.5, 100), base: { x: .5, y: .5 }, tip: { x: .8, y: .7 } };
    const b = { ...a, timestampMs: 133, tip: { x: .2, y: .7 } };
    pivot.accept(a, 100); pivot.accept(b, 133); expect(pivot.score).toBe(0);
  });
  it('deducts points once for a hazard, never goes negative, and rewards leaving hazards alone', () => {
    const game = round(); game.targets[0].hazard = true; game.score = 10; game.combo = 7;
    game.accept(blade(.2, 100), 100); game.accept(blade(.8, 133), 133);
    expect(game.score).toBe(0); expect(game.combo).toBe(0); expect(game.cuts).toBe(0); expect(game.mistakes).toBe(1);
    expect(game.bursts[0].points).toBe(-10); game.accept(blade(.2, 166), 166); expect(game.mistakes).toBe(1);
    game.combo = 3; Object.assign(game.targets[0], { active: true, y: 1.2, age: 2 }); game.update(.02, true);
    expect(game.combo).toBe(3); expect(game.missed).toBe(0);
  });
  it('introduces hazards only in later waves and keeps every direction available', () => {
    const game = new BladeSimulation(); game.start(1, 2); const seen = new Set<number>(), directions = new Set<number>(); const hazards = [0, 0, 0];
    for (let i = 0; i < 1200; i++) {
      game.update(.05, true);
      for (const target of game.targets) if (target.active && !seen.has(target.id)) {
        seen.add(target.id); directions.add(target.direction); if (target.hazard) hazards[game.wave - 1]++;
      }
    }
    expect(directions.size).toBe(4); expect(hazards[0]).toBe(0); expect(hazards[1]).toBeGreaterThan(0); expect(hazards[2]).toBeGreaterThan(hazards[1]);
  });
});

describe('independent simultaneous targets', () => {
  const longBlade = (x: number, time: number): SwordFrame => ({ ...blade(x, time), base: { x: 1-x, y: .05 }, tip: { x: 1-x, y: .95 } });
  function crowd(directions = [0, 0, 0, 0, 0]) {
    const game = round();
    directions.forEach((direction, i) => Object.assign(game.targets[i], { id: 100+i, active: true, x: .5, y: .15 + i*.17, direction }));
    return game;
  }
  it('checks every target and can score five crystals with one correct sweep', () => {
    const game = crowd(); game.accept(longBlade(.2, 100), 100); game.accept(longBlade(.8, 133), 133);
    expect(game.cuts).toBe(5); expect(game.score).toBe(60);
  });
  it('uses each crystal’s own arrow, regardless of pool order', () => {
    for (const directions of [[0, 2, 0, 1, 0], [2, 0, 1, 0, 0]]) {
      const game = crowd(directions); game.accept(longBlade(.2, 100), 100); game.accept(longBlade(.8, 133), 133);
      expect(game.cuts).toBe(3);
      expect(game.targets.slice(0, 5).map(t => t.active)).toEqual(directions.map(d => d !== 0));
    }
  });
  it('allows a fresh correct swing across all five after a wrong initial contact', () => {
    const game = crowd(); game.accept(longBlade(.7, 100), 100); game.accept(longBlade(.5, 133), 133);
    expect(game.cuts).toBe(0); expect(game.mistakes).toBe(5);
    game.accept(longBlade(.54, 166), 166);
    expect(game.cuts).toBe(5); expect(game.targets.slice(0, 5).every(t => !t.active)).toBe(true);
  });
});

it('level one accepts either direction without hazards and level two retains arrow rules', () => {
  const game = new BladeSimulation(); game.start(1, 1);
  Object.assign(game.targets[0], { id: 500, active: true, x: .5, y: .5, direction: 0 });
  game.accept(blade(.8, 100), 100); game.accept(blade(.2, 133), 133); expect(game.cuts).toBe(1);
  for (let i = 0; i < 1200; i++) { game.update(.05, true); expect(game.targets.some(t => t.active && t.hazard)).toBe(false); }
  game.start(1, 2); expect(game.level).toBe(2); expect(game.score).toBe(0);
});
