import { describe, expect, it } from 'vitest';
import { SideGameSimulation, type SideGameInput } from './SideGameSimulation';
import { sweptBladeHits } from './sweep';
import { clipBlade, swordToScreen, validSword, type SwordFrame } from './types';

const frame = (t: number, x: number): SwordFrame => ({ timestampMs: t, base: { x, y: .25 }, tip: { x, y: .8 },
  imageAspectRatio: 4 / 3, confidence: 1, source: 'color-bands-2d' });
const input: SideGameInput = { mode: 'slice', active: true, pace: 1, player: { x: .5, y: .55 }, aspect: 4 / 3 };
function advance(game: SideGameSimulation, duration: number, config = input) { for (let i = 0; i < duration * 60; i++) game.update(1 / 60, config); }
function targetGame() {
  const game = new SideGameSimulation(); game.update(.016, input);
  Object.assign(game.targets[0], { id: 90, active: true, x: .5, y: .5 }); return game;
}
describe('sword geometry and game', () => {
  const cropped = (t: number, y: number): SwordFrame => ({ ...frame(t, .5), source: 'four-ring-2d',
    base: { x: -.2, y }, tip: { x: .6, y }, inferredEndpoints: true, supportMask: 14,
    rings: [{ id: 1, x: .027, y }, { id: 2, x: .347, y }, { id: 3, x: .6, y }] });
  it('accepts bounded offscreen reconstruction only with fresh visible support', () => {
    expect(validSword(cropped(0, .5), 0)).toBe(true);
    expect(validSword({ ...cropped(0, .5), rings: [] }, 0)).toBe(false);
    expect(validSword({ ...cropped(0, .5), supportMask: 15 }, 0)).toBe(false);
    expect(validSword({ ...cropped(0, .5), base: { x: -2, y: .5 } }, 0)).toBe(false);
    expect(validSword(cropped(0, .5), 200)).toBe(false);
  });
  it('clips along the segment, preserving angle and never touching the measured geometry', () => {
    const blade = { base: { x: -.2, y: .2 }, tip: { x: .6, y: .6 } };
    const result = clipBlade(blade)!;
    expect(result.base.x).toBeCloseTo(0); expect(result.base.y).toBeCloseTo(.3);
    expect(result.tip).toEqual(blade.tip); expect(blade.base.x).toBe(-.2);
    expect(clipBlade({ base: {x:-.1,y:0}, tip: {x:-.1,y:1} })).toBeNull();
    expect(clipBlade({ base: {x:NaN,y:0}, tip: {x:1,y:1} })).toBeNull();
  });
  it('allows a visible cropped blade cut but no invisible offscreen target cuts', () => {
    for (const x of [.5, 1.05]) {
      const game = targetGame(); game.targets[0].x = x;
      game.acceptSword(cropped(0, .3), 0); game.acceptSword(cropped(33, .7), 33);
      expect(game.cleared).toBe(x === .5 ? 1 : 0);
    }
  });
  it('sweeps between camera samples even when neither endpoint pose touches the target', () => {
    expect(sweptBladeHits(frame(0, .1), frame(33, .9), { x: .5, y: .5 }, { x: .5, y: .5 }, .04)).toBe(true);
    expect(sweptBladeHits(frame(0, .1), frame(33, .9), { x: .5, y: .95 }, { x: .5, y: .95 }, .04)).toBe(false);
  });
  it('handles moving targets, degenerate segments and non-square images', () => {
    expect(sweptBladeHits(frame(0, .5), frame(33, .5), { x: .1, y: .5 }, { x: .9, y: .5 }, .01)).toBe(true);
    const dot = { ...frame(0, .2), base: { x: .2, y: .5 }, tip: { x: .2, y: .5 } };
    expect(sweptBladeHits(dot, dot, { x: .25, y: .5 }, { x: .25, y: .5 }, .06)).toBe(false);
  });
  it('scores a measured cut only once and preserves correct screen left/right', () => {
    const game = targetGame(); game.acceptSword(frame(0, .9), 0); game.acceptSword(frame(33, .1), 33);
    expect(game.cleared).toBe(1); expect(game.targets[0].active).toBe(false);
    game.acceptSword(frame(33, .9), 34); game.acceptSword(frame(66, .9), 66); expect(game.cleared).toBe(1);
    expect(swordToScreen(frame(0, .9)).base.x).toBeCloseTo(.1);
  });
  it('does not award stationary, stale, low-confidence or re-acquisition cuts', () => {
    for (const variant of ['stationary', 'stale', 'confidence', 'lost', 'gap', 'aspect', 'support-change']) {
      const game = targetGame(); game.acceptSword(frame(0, variant === 'stationary' ? .5 : .9), 0);
      if (variant === 'lost') game.acceptSword(null, 10);
      const next = frame(variant === 'gap' ? 160 : 33, variant === 'stationary' ? .5 : .1);
      if (variant === 'confidence') next.confidence = .1;
      if (variant === 'aspect') next.imageAspectRatio = 1;
      if (variant === 'support-change') next.supportMask = 7;
      game.acceptSword(next, variant === 'stale' ? 200 : next.timestampMs);
      expect(game.cleared, variant).toBe(0);
    }
  });
  it('alternates left/right, pauses and scales progress with cadence', () => {
    const game = new SideGameSimulation(); advance(game, 2.5);
    expect(game.snapshot().targets.map(t => t.side)).toEqual(['left', 'right']);
    const before = game.snapshot().targets; advance(game, 2, { ...input, pace: 0 });
    expect(game.snapshot().targets).toEqual(before); expect(game.paused).toBe(true);
    advance(game, 1, { ...input, pace: .5 });
    expect(game.targets[0].x - before[0].x).toBeCloseTo(.17);
  });
  it('counts escaped slice targets, permits dodging, and resets the pool and pending cuts', () => {
    const game = new SideGameSimulation(); advance(game, 5); expect(game.missed).toBeGreaterThan(0);
    game.reset(); expect(game.snapshot().targets).toHaveLength(0); expect(game.cleared + game.missed).toBe(0);
    advance(game, 6, { ...input, mode: 'dodge', player: { x: .5, y: 0 } });
    expect(game.cleared).toBeGreaterThan(0); expect(game.missed).toBe(0);
  });
  it('registers one side collision at the visible hit ring', () => {
    const game = new SideGameSimulation(); advance(game, 2, { ...input, mode: 'dodge' });
    expect(game.missed).toBe(0);
    advance(game, 1, { ...input, mode: 'dodge' }); expect(game.missed).toBe(1);
  });
  it('rejects nonfinite, future and out-of-frame measurements', () => {
    expect(validSword(frame(200, .5), 100)).toBe(false);
    expect(validSword(frame(100, NaN), 100)).toBe(false);
    expect(validSword(frame(100, 1.5), 100)).toBe(false);
    expect(validSword({ ...frame(100, .5), confidence: NaN }, 100)).toBe(false);
  });
});
