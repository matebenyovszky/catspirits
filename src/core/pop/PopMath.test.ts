import { describe, expect, it } from 'vitest';
import { createMathPuzzle, signedNumber, totalSelected } from './PopMath';
import { PopSimulation } from './PopSimulation';
import type { HandFrame } from './HandInput';
let seed = 12345;
const random = () => { seed = (Math.imul(seed, 1664525)+1013904223) >>> 0; return seed/2**32; };
const advance = (game: PopSimulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds/.05); i++) game.update(.05, true); };
const tapValue = (game: PopSimulation, value: number) => { const t = game.targets.find(t => t.active && t.value === value)!; game.tap(t); };
function solution(values: number[], target: number): number[] {
  for (let mask = 1; mask < 1 << values.length; mask++) {
    const selected = values.filter((_, i) => mask & 1 << i);
    if (selected.length >= 2 && selected.reduce((a,b) => a+b, 0) === target) return selected;
  }
  return [];
}
describe('math puzzle generation', () => {
  it('always supplies one correct answer, unique finite choices and a valid expression', () => {
    for (let round = 0; round < 1000; round++) {
      const puzzle = createMathPuzzle('answer', round, random);
      const [a, op, b] = puzzle.expression.split(' ');
      expect(puzzle.target).toBe(op === '+' ? Number(a)+Number(b) : Number(a)-Number(b));
      expect(puzzle.choices.filter(n => n === puzzle.target)).toHaveLength(1);
      expect(new Set(puzzle.choices).size).toBe(6); expect(puzzle.choices.every(n => Number.isSafeInteger(n) && n >= 0)).toBe(true);
    }
  });
  it('every sum board can be solved with at least two distinct pieces, never a single answer', () => {
    for (let round = 0; round < 1000; round++) {
      const puzzle = createMathPuzzle('sum', round, random);
      expect(puzzle.choices).toHaveLength(6); expect(new Set(puzzle.choices).size).toBe(6);
      expect(puzzle.choices.some(n => n < 0)).toBe(true); expect(puzzle.choices).not.toContain(0); expect(puzzle.choices).not.toContain(puzzle.target);
      expect(solution(puzzle.choices, puzzle.target).length).toBeGreaterThanOrEqual(2);
    }
    expect(createMathPuzzle('sum', 9, () => 0).choices).toHaveLength(6);
    expect(signedNumber(-20)).toBe('−20'); expect(signedNumber(30)).toBe('+30');
  });
});
describe('Neon Pop math integration', () => {
  it('keeps choices available for thinking, rejects wrong answers and counts one solution per question', () => {
    const game = new PopSimulation(); game.start(1, 3); advance(game, 5);
    expect(game.duration).toBe(90); expect(game.targets.filter(t => t.active)).toHaveLength(6);
    const first = game.math!; const wrong = first.choices.find(n => n !== first.target)!;
    tapValue(game, wrong); expect(game.hits).toBe(0); expect(game.mathFeedback).toBe('wrong');
    tapValue(game, first.target); expect(game.hits).toBe(0); // selection debounce
    advance(game, .5); tapValue(game, first.target); expect(game.hits).toBe(1); expect(game.score).toBe(10);
    for (const t of game.targets) game.tap(t); expect(game.hits).toBe(1);
    advance(game, 1.1); expect(game.math).not.toBe(first); expect(game.targets.filter(t => t.active)).toHaveLength(6);
    advance(game, 90); expect(game.phase).toBe('over'); expect(game.remaining).toBe(0);
  });
  it('accepts signed pieces in any order and supports undo/reset without reusing pieces', () => {
    const game = new PopSimulation(); game.start(1, 4); advance(game, .5);
    const puzzle = game.math!; const values = solution(puzzle.choices, puzzle.target).reverse();
    tapValue(game, values[0]); expect(totalSelected(puzzle)).toBe(values[0]); expect(game.hits).toBe(0);
    advance(game, .5); const first = game.targets.find(t => t.value === values[0])!; game.tap(first); // inactive choice cannot be scored twice
    expect(puzzle.selected).toHaveLength(1);
    game.undoMath(); expect(puzzle.selected).toHaveLength(0); expect(first.active).toBe(true);
    advance(game, .4); tapValue(game, values[0]); game.undoMath(true); expect(totalSelected(puzzle)).toBe(0);
    for (const value of values) { advance(game, .5); tapValue(game, value); }
    expect(game.mathFeedback).toBe('solved'); expect(game.hits).toBe(1);
    game.undoMath(true); expect(game.hits).toBe(1); expect(game.mathFeedback).toBe('solved');
  });
  it('pauses math clocks and prevents a single long camera sweep from selecting several pieces', () => {
    const game = new PopSimulation(); game.start(1, 4); advance(game, .5);
    const frame = (timestampMs: number, x: number): HandFrame => ({ timestampMs, imageAspectRatio: 1, hands: [{ id: 'left', x: 1-x, y: .22 }] });
    game.acceptHands(frame(100, .05), 100); game.acceptHands(frame(180, .95), 180);
    expect(game.math!.selected).toHaveLength(1);
    const elapsed = game.elapsed; game.update(1, false); game.undoMath(true); expect(game.elapsed).toBe(elapsed); expect(game.math!.selected).toHaveLength(1);
    game.acceptHands(null, 200); game.update(0, true); game.acceptHands(frame(220, .05), 220);
    expect(game.math!.selected).toHaveLength(1);
  });
});
