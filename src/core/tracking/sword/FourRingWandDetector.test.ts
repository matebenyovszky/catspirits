import { describe, expect, it } from 'vitest';
import { FourRingWandDetector, WAND_RINGS } from './FourRingWandDetector';
import { PinkGreenComponents } from './PinkGreenComponents';
import { validSword } from './types';

const W = 320, H = 240;
type Options = { mask?: number; x?: number; y?: number; angle?: number; scale?: number; colors?: number[][] };
export function wandPicture(options: Options = {}, image = new Uint8ClampedArray(W * H * 4)) {
  const { mask = 15, x = 80, y = 140, angle = 0, scale = 5, colors = [[245, 35, 130], [15, 225, 55]] } = options;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const dx = px + .5 - x, dy = py + .5 - y;
    if (Math.abs(-dx * uy + dy * ux) > 1.25 * scale) continue;
    const position = 15 + (dx * ux + dy * uy) / scale;
    WAND_RINGS.forEach((ring, id) => {
      if ((mask & 1 << id) && position >= ring.startCm && position < ring.endCm) image.set([...colors[ring.color], 255], (py * W + px) * 4);
    });
  }
  return image;
}
function endpoints(result: ReturnType<FourRingWandDetector['detect']>, options: Options = {}, tolerance = 2) {
  expect(result.frame, result.reason).not.toBeNull();
  const { x = 80, y = 140, angle = 0, scale = 5 } = options;
  expect(Math.hypot(result.frame!.base.x * W - x, result.frame!.base.y * H - y)).toBeLessThan(tolerance);
  expect(Math.hypot(result.frame!.tip.x * W - x - Math.cos(angle) * scale * 30,
    result.frame!.tip.y * H - y - Math.sin(angle) * scale * 30)).toBeLessThan(tolerance);
  expect(validSword(result.frame!, result.frame!.timestampMs)).toBe(true);
}

describe('physical four-ring pink/green wand', () => {
  it.each([-.15,0,.15])('extracts a bounded size cue from a synthetically perspective-projected cylinder (depth slope %s)', depth => {
    const width=640,height=480,pixels=new Uint8ClampedArray(width*height*4);
    for(let y=210;y<270;y++)for(let x=100;x<600;x++) {
      const u=x+.5-160,t=u/(300-depth*u),cm=15+30*t;
      const diameter=25/(1+depth*t);
      if(Math.abs(y+.5-240)>diameter/2)continue;
      const ring=WAND_RINGS.find(r=>cm>=r.startCm&&cm<r.endCm);
      if(ring)pixels.set(ring.color?[15,225,55,255]:[245,35,130,255],(y*width+x)*4);
    }
    const result=new FourRingWandDetector().detect(pixels,width,height,0);
    expect(result.frame?.visibleRings,result.reason).toBe(4);
    const cue=result.frame?.scaleCue;
    expect(cue).toBeDefined();expect(Math.abs(cue!.tipToBase-1/(1+depth))).toBeLessThan(.08);
  });
  it.each([
    { x: -5, y: 120, angle: 0 }, { x: 325, y: 120, angle: Math.PI },
    { x: 160, y: -5, angle: Math.PI / 2 }, { x: 160, y: 245, angle: -Math.PI / 2 },
    { x: 180, y: 120, angle: 0 }, { x: 140, y: 120, angle: Math.PI },
    { x: 160, y: 100, angle: Math.PI / 2 }, { x: 160, y: 140, angle: -Math.PI / 2 },
  ])('acquires from three rings when either outer ring crosses any image edge: %j', options => {
    const result = new FourRingWandDetector().detect(wandPicture(options), W, H, 0);
    endpoints(result, options);
    expect(result.frame).toMatchObject({ visibleRings: 3, inferredEndpoints: true });
  });

  it('ignores a biased edge fragment, maintains two green rings, then reacquires all four', () => {
    const detector = new FourRingWandDetector();
    for (const [i, x] of [20, 5, -10, -25, -40, -55, -70, -55, -40, -25, -10, 5, 20].entries()) {
      const result = detector.detect(wandPicture({ x }), W, H, i * 33);
      endpoints(result, { x });
      if (x === 5) expect(result.frame!.supportMask).toBe(14); // pink fragment touches edge
      if (x <= -40) expect(result.frame!.supportMask).toBe(12);
      expect(result.frame!.rings!.every(r => r.x >= 0 && r.x <= 1)).toBe(true);
    }
    // A cold ambiguous green pair still must not manufacture a blade.
    expect(new FourRingWandDetector().detect(wandPicture({ x: -70 }), W, H, 0).frame).toBeNull();
  });

  it('recognizes the actual 12–18 / 22–25 / 34–37 / 42–48 cm constellation', () => {
    const pixels = wandPicture(), copy = pixels.slice();
    const result = new FourRingWandDetector().detect(pixels, W, H, 0);
    endpoints(result);
    expect(result.frame).toMatchObject({ source: 'four-ring-2d', visibleRings: 4, inferredEndpoints: false, supportMask: 15 });
    expect(result.frame!.rings).toHaveLength(4);
    expect(Buffer.compare(Buffer.from(pixels.buffer), Buffer.from(copy.buffer))).toBe(0);
  });

  it.each([0, 1, 2, 3])('acquires with ring %i fully occluded, reconstructing the same blade', hidden => {
    const result = new FourRingWandDetector().detect(wandPicture({ mask: 15 ^ 1 << hidden }), W, H, 0);
    endpoints(result);
    expect(result.frame!.visibleRings).toBe(3);
    expect(result.frame!.inferredEndpoints).toBe(hidden === 0 || hidden === 3);
    expect(result.frame!.rings!.some(r => r.id === hidden)).toBe(false);
  });

  it.each([3, 5, 9, 6, 10, 12])('maintains a recent identity with only two rings (mask %i)', mask => {
    const detector = new FourRingWandDetector();
    endpoints(detector.detect(wandPicture(), W, H, 0));
    const result = detector.detect(wandPicture({ mask, x: 84 }), W, H, 33);
    endpoints(result, { x: 84 });
    expect(result.frame!.visibleRings).toBe(2);
    expect(result.frame!.confidence).toBeGreaterThanOrEqual(.55);
    for (let i = 2; i < 15; i++) endpoints(detector.detect(wandPicture({ mask, x: 84 }), W, H, i * 33), { x: 84 });
    endpoints(detector.detect(wandPicture({ x: 84 }), W, H, 500), { x: 84 });
  });

  it('never invents a blade from one ring, or acquires an ambiguous pair cold', () => {
    for (const mask of [0, 1, 2, 4, 8, 3, 5, 9, 6, 10, 12]) {
      expect(new FourRingWandDetector().detect(wandPicture({ mask }), W, H, 0).frame).toBeNull();
    }
    const detector = new FourRingWandDetector(); detector.detect(wandPicture(), W, H, 0);
    expect(detector.detect(wandPicture({ mask: 1 }), W, H, 33).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 9 }), W, H, 200).frame).toBeNull();
  });

  it('tracks rotation, translation, scale, ROI escape and full-image refresh', () => {
    const detector = new FourRingWandDetector(), modes: string[] = [];
    for (let i = 0; i < 40; i++) {
      const options = { x: 80 + Math.sin(i * .2) * 25, y: 80 + Math.cos(i * .2) * 20,
        angle: .3 + Math.sin(i * .15) * .2, scale: 4 + Math.sin(i * .1) * .3 };
      const result = detector.detect(wandPicture(options), W, H, i * 33);
      endpoints(result, options); modes.push(result.search);
    }
    expect(modes).toContain('roi'); expect(modes.filter(m => m === 'full').length).toBeGreaterThanOrEqual(3);
    const jumped = { x: 120, y: 205, scale: 4, angle: -.1 };
    const result = detector.detect(wandPicture(jumped), W, H, 1400);
    endpoints(result, jumped); expect(result.search).toBe('full');
  });

  it('rejects wrong spacing and two equally plausible wands, but tolerates isolated colored clutter', () => {
    const wrong = new Uint8ClampedArray(W * H * 4);
    for (const [i, cx] of [70, 90, 190, 240].entries()) for (let y = 100; y < 110; y++) for (let x = cx; x < cx + 10; x++) wrong.set(i < 2 ? [245, 35, 130, 255] : [15, 225, 55, 255], (y * W + x) * 4);
    expect(new FourRingWandDetector().detect(wrong, W, H, 0).frame).toBeNull();
    const two = wandPicture({ y: 70 }); wandPicture({ y: 180 }, two);
    expect(new FourRingWandDetector().detect(two, W, H, 0).frame).toBeNull();
    const clutter = wandPicture();
    for (let y = 30; y < 40; y++) for (let x = 20; x < 30; x++) clutter.set([245, 35, 130, 255], (y * W + x) * 4);
    endpoints(new FourRingWandDetector().detect(clutter, W, H, 0));
  });

  it('tolerates partial masking of one ring and never bridges a complete tracking loss', () => {
    const detector = new FourRingWandDetector();
    endpoints(detector.detect(wandPicture(), W, H, 0));
    const covered = wandPicture();
    // Cover half the outer pink band; its remaining centroid is biased.
    for (let y = 130; y < 150; y++) for (let x = 65; x < 80; x++) covered.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
    const partial = detector.detect(covered, W, H, 33);
    endpoints(partial, {}, 3);
    expect(partial.frame!.visibleRings).toBeGreaterThanOrEqual(3);
    expect(detector.detect(new Uint8ClampedArray(W * H * 4), W, H, 66).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 1 }), W, H, 100).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 9 }), W, H, 200).frame).toBeNull();
    endpoints(detector.detect(wandPicture(), W, H, 233));
  });

  it('rejects 2-ring pose changes that contradict the recent scale/identity', () => {
    const detector = new FourRingWandDetector(); detector.detect(wandPicture(), W, H, 0);
    expect(detector.detect(wandPicture({ mask: 3, x: 240, y: 40, angle: Math.PI / 2 }), W, H, 33).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 9, x: 45, scale: 8 }), W, H, 66).frame).toBeNull();
    endpoints(detector.detect(wandPicture(), W, H, 100));
  });

  it('rejects stale/duplicate frames, resets on resize and never carries two-ring identity across a gap', () => {
    const detector = new FourRingWandDetector(), image = wandPicture();
    detector.detect(image, W, H, 100);
    for (const time of [100, 99, NaN, Infinity]) expect(detector.detect(image, W, H, time).frame).toBeNull();
    expect(detector.detect(new Uint8ClampedArray(4), W, H, 120).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 9 }), W, H, 300).frame).toBeNull();
    endpoints(detector.detect(image, W, H, 333));
    detector.reset();
    expect(detector.detect(wandPicture({ mask: 9 }), W, H, 0).frame).toBeNull();
    expect(detector.detect(new Uint8ClampedArray(640 * 480 * 4), 640, 480, 10).frame).toBeNull();
    expect(detector.detect(wandPicture({ mask: 9 }), W, H, 20).frame).toBeNull();
  });

  it('accepts foil brightness/hue variation, while rejecting skin, gray, red and cyan', () => {
    for (const colors of [[[245, 35, 130], [15, 225, 55]], [[125, 15, 65], [10, 115, 25]], [[250, 65, 160], [35, 250, 110]]]) {
      endpoints(new FourRingWandDetector().detect(wandPicture({ colors }), W, H, 0));
    }
    const components = new PinkGreenComponents();
    for (const color of [[200, 130, 100], [150, 150, 150], [240, 20, 15], [20, 220, 230]]) {
      const pixels = wandPicture({ colors: [color, color] });
      components.prepare(pixels, W, H);
      expect(components.components({ x0: 0, y0: 0, x1: W, y1: H })).toEqual([[], []]);
      expect(new FourRingWandDetector().detect(pixels, W, H, 0).frame).toBeNull();
    }
  });
});
