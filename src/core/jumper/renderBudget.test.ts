import { describe, expect, it } from 'vitest';
import { MAX_RENDER_PIXELS, renderPixelRatio } from './renderBudget';
describe('GPU pixel budget', () => {
  it.each([[3840,2160,2], [7680,4320,3], [1920,1080,2], [390,844,3]])('bounds the drawing buffer at %dx%d with DPR %d', (width,height,dpr) => {
    const ratio=renderPixelRatio(width,height,dpr);
    expect(Math.floor(width*ratio)*Math.floor(height*ratio)).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
    expect(ratio).toBeGreaterThan(0);expect(ratio).toBeLessThanOrEqual(1.5);
  });
  it('keeps standard-density small displays at native resolution', () => {
    expect(renderPixelRatio(800,600,1)).toBe(1);
    expect(renderPixelRatio(0,0,1)).toBe(1);
  });
});
