import { describe, expect, it } from 'vitest';
import { BladeTrackingState } from './BladeTrackingState';
import type { SwordFrame } from '../tracking/sword/types';
const frame = (timestampMs: number): SwordFrame => ({ timestampMs, base: { x: .3, y: .5 }, tip: { x: .7, y: .5 }, imageAspectRatio: 1, confidence: 1, source: 'four-ring-2d' });
describe('camera availability separate from hit freshness', () => {
  it('absorbs short null observations without extending visible or measured freshness', () => {
    const state = new BladeTrackingState(); state.observe(frame(100), 105); state.observe(null, 133);
    expect(state.visible(150)).not.toBeNull(); expect(state.available(150)).toBe(true);
    expect(state.visible(221)).toBeNull(); expect(state.available(221)).toBe(true);
    state.observe(null, 300); expect(state.available(341)).toBe(false);
  });
  it('cannot be kept alive by stale, invalid, duplicate or out-of-order measurements', () => {
    const state = new BladeTrackingState(); state.observe(frame(100), 105);
    state.observe(frame(100), 210); state.observe(frame(90), 210);
    state.observe(frame(100), 300); state.observe({ ...frame(320), confidence: 0 }, 320);
    state.observe(frame(1000), 330); expect(state.available(341)).toBe(false);
    state.observe(frame(350), 351); expect(state.available(351)).toBe(true);
    state.reset(); expect(state.available(352)).toBe(false); expect(state.visible(352)).toBeNull();
  });
});
