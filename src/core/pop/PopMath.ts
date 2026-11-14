export type MathKind = 'answer' | 'sum';
export type MathPuzzle = { kind: MathKind; expression: string; target: number; choices: number[]; selected: number[] };
export const signedNumber = (value: number): string => value < 0 ? `−${Math.abs(value)}` : `+${value}`;
export const totalSelected = (puzzle: MathPuzzle): number => puzzle.selected.reduce((sum, index) => sum + puzzle.choices[index], 0);
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}
/** Small integer puzzles. Every board is solvable, with unique choices. Sum
 * boards require at least two pieces, and accept any valid combination. */
export function createMathPuzzle(kind: MathKind, round: number, random: () => number = Math.random): MathPuzzle {
  const integer = (max: number) => 1 + Math.floor(random()*max);
  const limit = round < 3 ? 10 : round < 7 ? 20 : 50;
  if (kind === 'answer') {
    let a = integer(limit), b = integer(limit); const subtract = random() < .5;
    if (subtract && b > a) [a, b] = [b, a];
    const target = subtract ? a-b : a+b;
    const choices = new Set([target]);
    // A finite shuffled candidate list avoids retry loops with unlucky RNGs.
    for (const value of shuffle(Array.from({ length: 11 }, (_, i) => target+i-5).filter(n => n >= 0 && n !== target), random)) {
      choices.add(value); if (choices.size === 6) break;
    }
    return { kind, expression: `${a} ${subtract ? '−' : '+'} ${b}`, target, choices: shuffle([...choices], random), selected: [] };
  }
  if (round === 0) return { kind, expression: '10', target: 10, choices: shuffle([30, -20, 7, -4, 11, -8], random), selected: [] };
  const count = 2 + Math.min(2, Math.floor(round/3));
  for (let attempt = 0; attempt < 100; attempt++) {
    const pool = shuffle(Array.from({ length: limit*2 }, (_, i) => i < limit ? i-limit : i-limit+1), random);
    const parts = pool.slice(0, count); const target = parts.reduce((a, b) => a+b, 0);
    if (target <= 0 || parts.includes(target)) continue;
    const choices = [...parts, ...pool.slice(count).filter(n => n !== target).slice(0, 6-count)];
    if (choices.every(n => n > 0)) choices[5] = pool.find(n => n < 0)!;
    return { kind, expression: String(target), target, choices: shuffle(choices, random), selected: [] };
  }
  return { kind, expression: '10', target: 10, choices: shuffle([30, -20, 7, -4, 11, -8], random), selected: [] };
}
