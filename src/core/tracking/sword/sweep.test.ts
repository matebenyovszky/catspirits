import { expect, it, vi } from 'vitest';
import { sweptBladeContact, sweptBladeHits } from './sweep';
import type { SwordFrame } from './types';
const blade = (x: number): SwordFrame => ({ base: { x, y: .2 }, tip: { x, y: .8 }, timestampMs: 0, imageAspectRatio: 1, confidence: 1, source: 'four-ring-2d' });
it('reports the part of the blade that actually hits a moving target', () => {
  const contact = sweptBladeContact(blade(.1), blade(.9), { x: .4, y: .35 }, { x: .6, y: .35 }, .03);
  expect(contact).not.toBeNull(); expect(contact!.along).toBeCloseTo(.25); expect(contact!.time).toBeCloseTo(.5);
});
it('bounds work for an almost touching parallel sweep without inventing a hit', () => {
  const from = { ...blade(0), base: { x: 0, y: .5 }, tip: { x: 1, y: .5 } };
  const to = { ...from, base: { x: 1, y: .5 }, tip: { x: 2, y: .5 } };
  const count = vi.spyOn(Math, 'hypot');
  try {
    const hit = sweptBladeHits(from, to, { x: .5, y: .55000000001 }, { x: 1.5, y: .55000000001 }, .05);
    expect(hit).toBe(false); expect(count.mock.calls.length).toBeLessThanOrEqual(133);
  } finally { count.mockRestore(); }
});
