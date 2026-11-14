import { describe, expect, it } from 'vitest';
import { canCompleteSum, createMathPuzzle, signedNumber, totalSelected } from './PopMath';
import { PopSimulation } from './PopSimulation';
import type { HandFrame } from './HandInput';
let seed = 12345;
const random = () => { seed = (Math.imul(seed, 1664525)+1013904223) >>> 0; return seed/2**32; };
const advance = (game: PopSimulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds/.05); i++) game.update(.05, true); };
const tapValue = (game: PopSimulation, value: number) => { const t = game.targets.find(t => t.active && t.value === value)!; game.tap(t); };
function placeThirty(game: PopSimulation, index: number): void {
  if (game.level !== 4) return;
  const other = game.targets.find(t => t.value === 30)!;
  [other.value, game.targets[index].value] = [game.targets[index].value, other.value];
}
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
    const game = new PopSimulation(); game.start(1, 4); advance(game, 2.1);
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
    const game = new PopSimulation(); game.start(1, 4); advance(game, 2.1);
    placeThirty(game, 0);
    const frame = (timestampMs: number, x: number): HandFrame => ({ timestampMs, imageAspectRatio: 1, hands: [{ id: 'left', x: 1-x, y: .22 }] });
    game.acceptHands(frame(100, .05), 100); game.acceptHands(frame(180, .95), 180);
    expect(game.math!.selected).toHaveLength(1);
    const elapsed = game.elapsed; game.update(1, false); game.undoMath(true); expect(game.elapsed).toBe(elapsed); expect(game.math!.selected).toHaveLength(1);
    game.acceptHands(null, 200); game.update(0, true); game.acceptHands(frame(220, .05), 220);
    expect(game.math!.selected).toHaveLength(1);
  });
});

it('math accepts either hand irrespective of target parity and selects the earliest swept number', () => {
  for (const level of [3,4] as const) for (const id of ['left','right'] as const) {
    const game=new PopSimulation(); game.start(1,level); advance(game, 2.1);
    placeThirty(game, 2);
    const rightmost=game.targets[2];
    if(level===3) game.math!.target=rightmost.value!;
    const frame=(timestampMs:number,x:number):HandFrame=>({timestampMs,imageAspectRatio:1,hands:[{id,x:1-x,y:.22}]});
    game.acceptHands(frame(100,.97),100); game.acceptHands(frame(180,.04),180);
    expect(game.math!.selected).toEqual([game.math!.choices.indexOf(rightmost.value!)]);
    expect(game.drainEvents()).toEqual([level===3?'correct':'pick']); expect(game.drainEvents()).toEqual([]);
  }
});
it('does not use stale or reacquired math hand positions as a selection sweep', () => {
  for(const id of ['left','right'] as const){
    const game=new PopSimulation();game.start(1,4);advance(game, 2.1);
    const frame=(timestampMs:number,x:number):HandFrame=>({timestampMs,imageAspectRatio:1,hands:[{id,x:1-x,y:.22}]});
    game.acceptHands(frame(100,.05),100);game.acceptHands(frame(150,.3),500);expect(game.math!.selected).toHaveLength(0);
    game.acceptHands(frame(520,.3),520);expect(game.math!.selected).toHaveLength(0);
  }
});
it('emits exactly one wrong/correct cue per accepted answer and one undo cue per change', () => {
  const game=new PopSimulation();game.start(1,3);advance(game, 2.1);
  tapValue(game,game.math!.choices.find(v=>v!==game.math!.target)!);expect(game.drainEvents()).toEqual(['wrong']);
  tapValue(game,game.math!.target);expect(game.drainEvents()).toEqual([]);
  advance(game,.5);tapValue(game,game.math!.target);expect(game.drainEvents()).toEqual(['correct']);
  game.start(1,4);advance(game, 2.1);tapValue(game,30);expect(game.drainEvents()).toEqual(['pick']);
  game.undoMath();expect(game.drainEvents()).toEqual(['undo']);game.undoMath();expect(game.drainEvents()).toEqual([]);
});

it('ignores positions for two seconds on every new math board and requires a fresh movement afterwards', () => {
  for (const level of [3,4] as const) {
    const game = new PopSimulation(); game.start(1,level); placeThirty(game, 2);
    const frame = (timestampMs:number,x:number):HandFrame => ({timestampMs,imageAspectRatio:1,hands:[{id:'left',x:1-x,y:.22}]});
    advance(game,1.9); game.acceptHands(frame(1900,.05),1900); game.acceptHands(frame(1933,.95),1933);
    for (const t of game.targets) game.tap(t);
    expect(game.hits).toBe(0); expect(game.math!.selected).toHaveLength(0);
    advance(game,.2); game.acceptHands(frame(2100,.82),2100); game.acceptHands(frame(2133,.82),2133);
    expect(game.math!.selected).toHaveLength(0); // no old sweep or stationary-hand selection
    if (level === 3) game.math!.target = game.targets[2].value!;
    game.acceptHands(frame(2200,.60),2200); expect(game.math!.selected).toHaveLength(1);
    if (level === 3) {
      advance(game,1.1); expect(game.mathIntroRemaining).toBeGreaterThan(1.8);
      game.acceptHands(frame(3300,.05),3300); game.acceptHands(frame(3333,.95),3333);
      expect(game.math!.selected).toHaveLength(0); expect(game.hits).toBe(1);
    }
  }
});

it('detects exactly which signed-number prefixes still have a solution', () => {
  for (let round = 0; round < 100; round++) {
    const puzzle = createMathPuzzle('sum', round, random);
    const solutions: number[] = [];
    for (let mask = 0; mask < 64; mask++) {
      const pieces = puzzle.choices.filter((_, i) => mask & (1 << i));
      if (pieces.length >= 2 && pieces.reduce((a,b) => a+b,0) === puzzle.target) solutions.push(mask);
    }
    for (let selected = 0; selected < 64; selected++) {
      puzzle.selected = puzzle.choices.map((_,i) => i).filter(i => selected & (1 << i));
      expect(canCompleteSum(puzzle)).toBe(solutions.some(mask => (mask & selected) === selected));
    }
  }
});
it('bursts once on a dead end, then restores the same puzzle with a protected introduction', () => {
  const game = new PopSimulation(); game.start(1,4); advance(game,2.1);
  const puzzle = game.math!, choices = [...puzzle.choices], ids = game.targets.map(t => t.id);
  game.score = 40; game.combo = 3;
  tapValue(game,30); expect(game.mathFeedback).toBe('picked'); // overshoot is recoverable with −20
  advance(game,.5); tapValue(game,-4); // no remaining subset can add −16
  expect(game.mathFeedback).toBe('resetting'); expect(game.missed).toBe(1); expect(game.combo).toBe(0);
  expect(game.score).toBe(40); expect(game.hits).toBe(0); expect(game.bursts).toHaveLength(6);
  expect(game.bursts.every(b => b.reset && b.points === 0)).toBe(true);
  expect(game.targets.some(t => t.active)).toBe(false); expect(game.drainEvents()).toEqual(['pick','wrong']);
  const selection = [...puzzle.selected]; game.undoMath(true); game.targets.forEach(t => game.tap(t));
  expect(puzzle.selected).toEqual(selection); expect(game.drainEvents()).toEqual([]);
  const elapsed = game.elapsed; game.update(.05,false); expect(game.elapsed).toBe(elapsed);
  expect(game.mathFeedback).toBe('resetting');
  advance(game,.75); expect(game.math).toBe(puzzle); expect(puzzle.choices).toEqual(choices);
  expect(puzzle.selected).toEqual([]); expect(game.targets.filter(t => t.active)).toHaveLength(6);
  expect(game.targets.map(t => t.id)).not.toEqual(ids); expect(game.bursts).toHaveLength(0);
  expect(game.mathIntroRemaining).toBeGreaterThan(1.9);
  advance(game,1.8); tapValue(game,30); expect(puzzle.selected).toHaveLength(0);
  advance(game,.3); tapValue(game,30); advance(game,.5); tapValue(game,-20);
  expect(game.mathFeedback).toBe('solved'); expect(game.hits).toBe(1); expect(game.score).toBe(50);
});
it('also resets when an exhausted selection has no valid total', () => {
  const game = new PopSimulation(); game.start(1,4); advance(game,2.1);
  const puzzle = game.math!;
  // Exercise an already exhausted/stuck board, including choices selected before the guard.
  puzzle.selected = puzzle.choices.map((_,i) => i).slice(1);
  game.targets.forEach(t => { t.active = t.value === puzzle.choices[0]; });
  tapValue(game,puzzle.choices[0]); expect(puzzle.selected).toHaveLength(6);
  expect(game.mathFeedback).toBe('resetting'); advance(game,.75);
  expect(puzzle.selected).toHaveLength(0); expect(game.targets.filter(t => t.active)).toHaveLength(6);
});
