import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ColorWandDetector } from './ColorWandDetector';
import { WasmColorComponents } from './WasmColorComponents';
import { PinkGreenComponents } from './PinkGreenComponents';
import { FourRingWandDetector, WAND_RINGS } from './FourRingWandDetector';

const binary = readFileSync(new URL('./color-components.wasm', import.meta.url));
const create = () => WasmColorComponents.create(binary);
function frame(w: number, h: number, x: number, y: number, missing = false) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < rgba.length; j += 4) { rgba[j] = rgba[j + 1] = rgba[j + 2] = 150; rgba[j + 3] = 255; }
  for (const [dx, dy, r, g, b] of [[0, 0, 240, 20, 200], [35, -25, 20, 220, 230]]) {
    if (missing && dx) continue;
    for (let py = y + dy; py < y + dy + 10; py++) for (let px = x + dx; px < x + dx + 6; px++) {
      if (px >= 0 && px < w && py >= 0 && py < h) rgba.set([r, g, b, 255], (py * w + px) * 4);
    }
  }
  return rgba;
}

describe('scalar WASM color kernel parity', () => {
  it('matches all 16,777,216 pink/green RGB classifications and alpha boundaries', async () => {
    const { instance } = await WebAssembly.instantiate(binary, {});
    const e = instance.exports as { memory: WebAssembly.Memory; imagePointer(): number; classify(n: number): number; setPinkGreen(n: number): void };
    e.setPinkGreen(1);
    const rgba = new Uint8Array(e.memory.buffer, e.imagePointer(), 65536 * 4);
    let mismatches = 0;
    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) rgba.set([r, g, b, 255], (g * 256 + b) * 4);
      const mask = new Uint8Array(e.memory.buffer, e.classify(65536), 65536);
      for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) {
        const c = r > 65 && b > 35 && r > g * 1.4 + 15 && b > g * 1.05 + 5 && r > b * .7 ? 1
          : g > 60 && g > r * 1.35 + 15 && g > b * 1.2 + 10 ? 2 : 0;
        if (mask[g * 256 + b] !== c) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
    for (let a = 0; a < 256; a++) rgba.set([245, 35, 130, a], a * 4);
    expect([...new Uint8Array(e.memory.buffer, e.classify(256), 256)])
      .toEqual(Array.from({ length: 256 }, (_, a) => a < 128 ? 0 : 1));
  });

  it('keeps four-ring geometry identical for every occlusion mask, ROI and resolution', async () => {
    const js = new FourRingWandDetector(), wasm = new FourRingWandDetector(await WasmColorComponents.create(binary, true));
    for (const width of [320, 640]) for (let mask = 0; mask < 16; mask++) {
      const height = width * .75, scale = width / 64;
      js.reset(); wasm.reset();
      for (let i = 0; i < 20; i++) {
        const pixels = new Uint8ClampedArray(width * height * 4), visible = i === 0 || i === 19 ? 15 : mask;
        WAND_RINGS.forEach((ring, id) => {
          if (!(visible & 1 << id)) return;
          for (let y = height / 2; y < height / 2 + 2 * scale; y++)
            for (let x = ring.startCm * scale + i; x < ring.endCm * scale + i; x++)
              pixels.set(ring.color === 0 ? [245, 35, 130, 255] : [15, 225, 55, 255], (y * width + x) * 4);
        });
        const original = pixels.slice();
        expect(wasm.detect(pixels, width, height, i * 33)).toEqual(js.detect(pixels, width, height, i * 33));
        expect(Buffer.compare(Buffer.from(pixels.buffer), Buffer.from(original.buffer))).toBe(0);
      }
    }
  });

  it('matches pink/green connected components with random clutter, clipping and alpha', async () => {
    const js = new PinkGreenComponents(), wasm = await WasmColorComponents.create(binary, true);
    let seed = 42;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let n = 0; n < 30; n++) {
      const pixels = new Uint8ClampedArray(320 * 240 * 4);
      for (let i = 0; i < 100; i++) {
        const x0 = random() % 310, y0 = random() % 230, color = [random() % 256, random() % 256, random() % 256, random() % 256];
        for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++) pixels.set(color, (y * 320 + x) * 4);
      }
      js.prepare(pixels, 320, 240); wasm.prepare(pixels, 320, 240);
      for (const roi of [{x0:0,y0:0,x1:320,y1:240},{x0:27,y0:32,x1:290,y1:180}]) expect(wasm.components(roi)).toEqual(js.components(roi));
    }
  });
  it('matches the JS RGB classifier for all 16,777,216 RGB triples', async () => {
    const { instance } = await WebAssembly.instantiate(binary, {});
    const e = instance.exports as { memory: WebAssembly.Memory; imagePointer(): number; classify(n: number): number };
    const n = 65536, rgba = new Uint8Array(e.memory.buffer, e.imagePointer(), n * 4);
    let mismatches = 0;
    for (let r = 0; r < 256; r++) {
      for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) rgba.set([r, g, b, 255], (g * 256 + b) * 4);
      const mask = new Uint8Array(e.memory.buffer, e.classify(n), n);
      for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) {
        const c = r > 65 && b > 65 && r > g * 1.5 + 15 && b > g * 1.35 + 15 && r < b * 2.5 && b < r * 2.5 ? 1
          : g > 65 && b > 65 && g > r * 1.45 + 15 && b > r * 1.45 + 15 && g < b * 2.2 && b < g * 2.2 ? 2 : 0;
        if (mask[g * 256 + b] !== c) mismatches++;
      }
    }
    for (let a = 0; a < 256; a++) rgba.set([240, 20, 200, a], a * 4);
    const alpha = new Uint8Array(e.memory.buffer, e.classify(256), 256);
    expect([...alpha]).toEqual(Array.from({ length: 256 }, (_, a) => a < 128 ? 0 : 1));
    expect(mismatches).toBe(0);
  });

  it('preserves centroids, ROI/reacquisition, staleness, resize, clipping and missing-marker behavior', async () => {
    const js = new ColorWandDetector(), wasm = new ColorWandDetector(await create());
    for (let i = 0; i < 160; i++) {
      const w = i < 80 ? 320 : 640, h = i < 80 ? 240 : 480;
      const x = i % 11 === 0 ? 0 : 20 + (i * 13) % (w - 80), y = 50 + (i * 7) % (h - 80);
      const rgba = frame(w, h, x, y, i % 7 === 0), original = rgba.slice();
      const t = i * 33 + (i > 100 ? 200 : 0);
      expect(wasm.detect(rgba, w, h, t)).toEqual(js.detect(rgba, w, h, t));
      expect(Buffer.compare(Buffer.from(rgba.buffer), Buffer.from(original.buffer))).toBe(0);
    }
    const rgba = frame(640, 480, 100, 100);
    for (const t of [9999, 9999, 9980, NaN, Infinity]) expect(wasm.detect(rgba, 640, 480, t)).toEqual(js.detect(rgba, 640, 480, t));
  });

  it('preserves ambiguity and pathological component-count rejection', async () => {
    const js = new ColorWandDetector(), wasm = new ColorWandDetector(await create());
    for (const count of [2, 12, 13, 30]) {
      const rgba = frame(320, 240, 30, 60);
      for (let n = 1; n < count; n++) {
        const x = 10 + n % 10 * 25, y = 100 + Math.floor(n / 10) * 25;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) rgba.set([240, 20, 200, 255], ((y + j) * 320 + x + i) * 4);
      }
      js.reset(); wasm.reset();
      expect(wasm.detect(rgba, 320, 240, 0)).toEqual(js.detect(rgba, 320, 240, 0));
      expect(wasm.detect(rgba, 320, 240, 33).frame).toBeNull();
    }
  });

  it('rejects malformed buffers and regions before accessing linear memory', async () => {
    const backend = await create();
    expect(() => backend.prepare(new Uint8ClampedArray(4), 320, 240)).toThrow(RangeError);
    backend.prepare(frame(320, 240, 100, 100), 320, 240);
    for (const region of [{ x0: -1, y0: 0, x1: 100, y1: 100 }, { x0: .1, y0: 0, x1: 100, y1: 100 }, { x0: 0, y0: 0, x1: 99999, y1: 100 }]) expect(backend.components(region)).toEqual([[], []]);
  });
});
