import { describe, expect, it } from 'vitest';
import { ColorWandDetector } from './ColorWandDetector';
const W = 320, H = 240;
function picture(markers: [number, number, number, number, number[]][] = [[100, 100, 6, 12, [240, 20, 200]], [155, 80, 6, 12, [20, 220, 230]]]) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (const [left, top, width, height, color] of markers) for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    data.set([...color, 255], (y * W + x) * 4);
  }
  return data;
}
describe('ColorWandDetector', () => {
  it('measures distinct band centroids without changing image data', () => {
    const detector = new ColorWandDetector(), data = picture(), original = data.slice();
    const result = detector.detect(data, W, H, 100);
    expect(result.frame).toMatchObject({ source: 'color-bands-2d', confidence: 1, base: { x: 103 / W, y: 106 / H }, tip: { x: 158 / W, y: 86 / H } });
    expect(data).toEqual(original);
  });
  it('reuses a smaller ROI and immediately reacquires a swing outside it', () => {
    const detector = new ColorWandDetector();
    const a = detector.detect(picture(), W, H, 0);
    const b = detector.detect(picture(), W, H, 33);
    expect(a.search).toBe('full'); expect(b.search).toBe('roi'); expect(b.scannedPixels).toBeLessThan(a.scannedPixels * .4);
    const moved = picture([[230, 180, 6, 12, [240, 20, 200]], [290, 150, 6, 12, [20, 220, 230]]]);
    const c = detector.detect(moved, W, H, 66);
    expect(c.search).toBe('full'); expect(c.frame?.base.x).toBe(233 / W);
  });
  it('periodically checks the full image and reacquires after a long gap', () => {
    const detector = new ColorWandDetector(), modes: string[] = [];
    for (let i = 0; i < 20; i++) modes.push(detector.detect(picture(), W, H, i * 33).search);
    expect(modes.filter(m => m === 'full').length).toBeGreaterThanOrEqual(2);
    expect(detector.detect(picture(), W, H, 1200).search).toBe('full');
  });
  it('rejects a missing band, ambiguous pairs, grayscale, clipping and tiny markers', () => {
    const cases = [[], [[100, 100, 6, 12, [240, 20, 200]]],
      [[100, 100, 6, 12, [240, 20, 200]], [155, 80, 6, 12, [20, 220, 230]], [180, 100, 6, 12, [20, 220, 230]]],
      [[100, 100, 6, 12, [200, 200, 200]], [155, 80, 6, 12, [240, 240, 240]]],
      [[0, 100, 6, 12, [240, 20, 200]], [155, 80, 6, 12, [20, 220, 230]]],
      [[100, 100, 1, 2, [240, 20, 200]], [155, 80, 1, 2, [20, 220, 230]]]];
    for (const markers of cases) expect(new ColorWandDetector().detect(picture(markers as Parameters<typeof picture>[0]), W, H, 0).frame).toBeNull();
  });
  it('rejects old timestamps, invalid buffers, foreshortening and oversize inputs', () => {
    const detector = new ColorWandDetector(); detector.detect(picture(), W, H, 100);
    expect(detector.detect(picture(), W, H, 100).frame).toBeNull();
    expect(detector.detect(picture(), W, H, 90).frame).toBeNull();
    expect(detector.detect(new Uint8ClampedArray(2), W, H, 110).frame).toBeNull();
    expect(detector.detect(picture(), 999999, 999999, 110).frame).toBeNull();
    expect(new ColorWandDetector().detect(picture([[100, 100, 3, 5, [240, 20, 200]], [105, 100, 3, 5, [20, 220, 230]]]), W, H, 0).frame).toBeNull();
  });
});
