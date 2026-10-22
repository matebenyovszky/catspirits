import { describe, expect, it } from 'vitest';
import { PopSimulation } from './PopSimulation';
import { handsFromPose, validHands, type HandFrame } from './HandInput';
import type { SwordFrame } from '../tracking/sword/types';
const hands = (time: number, x: number, y = .5): HandFrame => ({ timestampMs: time, imageAspectRatio: 1, hands: [{ id: 'left', x: 1-x, y }] });
const sword = (time: number, x: number): SwordFrame => ({ timestampMs: time, imageAspectRatio: 1, confidence: 1, source: 'four-ring-2d', supportMask: 15, base: { x: 1-x, y: .05 }, tip: { x: 1-x, y: .95 } });
function gameWithTargets() {
  const game = new PopSimulation(); game.start(1);
  for (let i = 0; i < 5; i++) Object.assign(game.targets[i], { active: true, id: 100+i, x: .5, y: .15+i*.17, radius: .06 });
  return game;
}
describe('Neon Pop targets and inputs', () => {
  it('lets one blade sweep clear five independently active targets exactly once', () => {
    const game = gameWithTargets(); game.acceptSword(sword(100, .2), 100); game.acceptSword(sword(133, .8), 133);
    expect(game.hits).toBe(5); expect(game.score).toBe(60); game.acceptSword(sword(166, .2), 166); expect(game.hits).toBe(5);
  });
  it('checks both hands independently and never swaps identities across a missing hand', () => {
    const game = gameWithTargets();
    const pair = (time: number, left: number, right: number): HandFrame => ({ timestampMs: time, imageAspectRatio: 1,
      hands: [{ id: 'left', x: 1-left, y: .15 }, { id: 'right', x: 1-right, y: .83 }] });
    game.acceptHands(pair(100, .35, .65), 100); game.acceptHands(pair(133, .65, .35), 133);
    expect(game.hits).toBe(2); expect(game.targets[0].active).toBe(false); expect(game.targets[4].active).toBe(false);
    game.acceptHands(hands(166, .35, .49), 166);
    const reappear = { ...hands(199, .65, .49), hands: [{ id: 'right' as const, x: .35, y: .49 }] };
    game.acceptHands(reappear, 199); expect(game.hits).toBe(2);
  });
  it('rejects stale, stationary, impossible jumps and loss/reacquisition cuts', () => {
    for (const kind of ['stale', 'stationary', 'lost', 'jump']) {
      const game = gameWithTargets(); game.acceptHands(hands(100, kind === 'stationary' ? .5 : .35, .49), 100);
      if (kind === 'lost') game.acceptHands(null, 120);
      const next = hands(kind === 'jump' ? 101 : 133, kind === 'stationary' ? .5 : .65, .49);
      game.acceptHands(next, kind === 'stale' ? 400 : next.timestampMs); expect(game.hits, kind).toBe(0);
    }
    const game = gameWithTargets(); game.acceptSword(sword(100, .2), 100); game.acceptSword(null, 110); game.acceptSword(sword(133, .8), 133); expect(game.hits).toBe(0);
  });
  it('never scores a target that appeared after the previous camera sample', () => {
    const game = new PopSimulation(); game.start(1); game.acceptSword(sword(100, .2), 100);
    Object.assign(game.targets[0], { active: true, id: 50, x: .5, y: .5 });
    game.acceptSword(sword(133, .8), 133); expect(game.hits).toBe(0);
    game.acceptSword(sword(166, .2), 166); expect(game.hits).toBe(1);
  });
  it('supports direct taps without camera input and pauses/finishes with bounded pools', () => {
    const game = gameWithTargets(); game.tap({ x: .5, y: .15 }); expect(game.hits).toBe(1);
    game.tap({ x: .5, y: .15 }); expect(game.hits).toBe(1);
    game.update(10, false); const age = game.targets[1].age; game.tap({ x: .5, y: .32 }); expect(game.hits).toBe(1); expect(game.targets[1].age).toBe(age);
    for (let i = 0; i < 901; i++) game.update(.05, true);
    expect(game.phase).toBe('over'); expect(game.remaining).toBe(0); expect(game.targets).toHaveLength(9); expect(game.bursts.length).toBeLessThanOrEqual(18); expect(game.missed).toBeGreaterThan(30);
  });
});
describe('local wrist observations', () => {
  it('accepts either visible arm, preserves image coordinates and rejects old/invalid landmarks', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 0 }));
    landmarks[13].visibility = landmarks[15].visibility = .9; landmarks[15].x = .2;
    const pose = { timestampMs: 100, imageAspectRatio: 4/3, landmarks, worldLandmarks: [], inferenceMs: 10 };
    expect(handsFromPose(pose, 120)?.hands).toEqual([{ id: 'left', x: .2, y: .5 }]);
    expect(handsFromPose(pose, 301)).toBeNull(); landmarks[15].x = NaN; expect(handsFromPose(pose, 120)).toBeNull();
    expect(validHands({ ...hands(100, .5), hands: [{ id: 'left', x: .5, y: .5 }, { id: 'left', x: .6, y: .5 }] }, 100)).toBe(false);
  });
});

it('does not score a stationary handle merely because its tip is moving fast', () => {
  const game = new PopSimulation(); game.start(1); Object.assign(game.targets[0], { id: 99, active: true, x: .5, y: .5 });
  const a = { ...sword(100, .5), base: { x: .5, y: .5 }, tip: { x: .8, y: .8 } };
  const b = { ...a, timestampMs: 133, tip: { x: .2, y: .8 } };
  game.acceptSword(a, 100); game.acceptSword(b, 133); expect(game.hits).toBe(0);
});
