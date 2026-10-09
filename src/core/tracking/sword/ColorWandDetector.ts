import { SWORD_MAX_AGE_MS, type SwordDetection, type SwordFrame } from './types';

export type ColorBlob = { x: number; y: number; area: number };
export type ColorRegion = { x0: number; y0: number; x1: number; y1: number };
type Blob = ColorBlob;
type Region = ColorRegion;
export interface ColorComponentsBackend {
  prepare(rgba: Uint8ClampedArray, width: number, height: number): void;
  components(region: Region): [Blob[], Blob[]];
}

/** Two-color connected components. No NN, OpenCV download or HSV conversion.
 * Buffers are reused; temporal ROI is only a search hint, never a measurement.
 * Fail closed on ambiguous pairs, missing colors and foreshortened axes. */
export class ColorWandDetector {
  private mask = new Uint8Array(0);
  private queue = new Int32Array(0);
  private previous: SwordFrame | null = null;
  private width = 0;
  private height = 0;
  private count = 0;

  /** Optional numeric kernel; pairing, ROI and all validity gates stay shared. */
  constructor(private readonly backend?: ColorComponentsBackend) {}

  reset(): void { this.previous = null; this.count = 0; }

  detect(rgba: Uint8ClampedArray, width: number, height: number, timestampMs: number): SwordDetection {
    const invalid = (reason: string): SwordDetection => ({ frame: null, scannedPixels: 0, search: 'full', reason });
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width * height > 640 * 480 || rgba.length !== width * height * 4 || !Number.isFinite(timestampMs)) return invalid('Érvénytelen kép');
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      if (!this.backend) { this.mask = new Uint8Array(width * height); this.queue = new Int32Array(width * height); }
      this.reset();
    }
    if (this.previous && timestampMs <= this.previous.timestampMs) return invalid('Ismételt vagy régi kép');
    if (this.previous && timestampMs - this.previous.timestampMs > SWORD_MAX_AGE_MS) this.previous = null;
    const full = { x0: 0, y0: 0, x1: width, y1: height };
    let region = full;
    if (this.previous && ++this.count % 15 !== 0) {
      const a = this.previous.base, b = this.previous.tip;
      const margin = Math.max(24, Math.hypot((a.x - b.x) * width, (a.y - b.y) * height) * .6);
      region = { x0: Math.max(0, Math.floor(Math.min(a.x, b.x) * width - margin)),
        y0: Math.max(0, Math.floor(Math.min(a.y, b.y) * height - margin)),
        x1: Math.min(width, Math.ceil(Math.max(a.x, b.x) * width + margin)),
        y1: Math.min(height, Math.ceil(Math.max(a.y, b.y) * height + margin)) };
    }
    let scannedPixels = 0;
    this.backend?.prepare(rgba, width, height);
    const search = (r: Region): { frame: SwordFrame | null; reason: string } => {
      scannedPixels += (r.x1 - r.x0) * (r.y1 - r.y0);
      const [magenta, cyan] = this.backend ? this.backend.components(r) : this.components(rgba, r);
      const candidates: { base: Blob; tip: Blob; score: number }[] = [];
      for (const base of magenta) for (const tip of cyan) {
        const length = Math.hypot(base.x - tip.x, base.y - tip.y);
        if (length < 10 || length > Math.hypot(width, height) * .75) continue;
        if (Math.min(base.area, tip.area) / Math.max(base.area, tip.area) < .2) continue;
        const displacement = this.previous ? Math.hypot(base.x / width - this.previous.base.x, base.y / height - this.previous.base.y)
          + Math.hypot(tip.x / width - this.previous.tip.x, tip.y / height - this.previous.tip.y) : 0;
        candidates.push({ base, tip, score: Math.min(1, Math.min(base.area, tip.area) / 12) / (1 + displacement * 8) });
      }
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (!best) return { frame: null, reason: 'Mindkét színsáv legyen látható és egymástól elkülönülő' };
      if (candidates[1] && candidates[1].score > best.score * .8) return { frame: null, reason: 'Több hasonló színfolt: egyszínű háttér szükséges' };
      return { frame: { timestampMs, base: { x: best.base.x / width, y: best.base.y / height },
        tip: { x: best.tip.x / width, y: best.tip.y / height }, imageAspectRatio: width / height,
        confidence: Math.min(1, Math.min(best.base.area, best.tip.area) / 12), source: 'color-bands-2d' }, reason: 'Két színsáv mérve · képsíkbeli követés' };
    };
    let result = search(region);
    let mode: SwordDetection['search'] = region === full ? 'full' : 'roi';
    // A fast swing can leave the ROI. Reacquire on THIS image, not one frame later.
    if (!result.frame && region !== full) { result = search(full); mode = 'full'; }
    this.previous = result.frame;
    return { ...result, scannedPixels, search: mode };
  }

  private components(rgba: Uint8ClampedArray, r: Region): [Blob[], Blob[]] {
    const w = this.width, h = this.height, mask = this.mask, queue = this.queue;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const index = y * w + x, p = index * 4, red = rgba[p], green = rgba[p + 1], blue = rgba[p + 2];
      // Dominance + relative saturation tolerate brightness variation. White,
      // gray, skin, yellow, red-only and blue-only pixels are not marker colors.
      mask[index] = rgba[p + 3] < 128 ? 0
        : red > 65 && blue > 65 && red > green * 1.5 + 15 && blue > green * 1.35 + 15 && red < blue * 2.5 && blue < red * 2.5 ? 1
        : green > 65 && blue > 65 && green > red * 1.45 + 15 && blue > red * 1.45 + 15 && green < blue * 2.2 && blue < green * 2.2 ? 2 : 0;
    }
    const result: [Blob[], Blob[]] = [[], []];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const index = y * w + x, color = mask[index];
      if (!color) continue;
      let head = 0, tail = 1, sx = 0, sy = 0, x0 = x, x1 = x, y0 = y, y1 = y;
      queue[0] = index; mask[index] = 0;
      const enqueue = (i: number) => { if (mask[i] === color) { mask[i] = 0; queue[tail++] = i; } };
      while (head < tail) {
        const i = queue[head++], py = Math.floor(i / w), px = i - py * w;
        sx += px + .5; sy += py + .5; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        if (px > r.x0) enqueue(i - 1); if (px + 1 < r.x1) enqueue(i + 1);
        if (py > r.y0) enqueue(i - w); if (py + 1 < r.y1) enqueue(i + w);
      }
      if (tail < 7 || tail > w * h * .025 || tail / ((x1 - x0 + 1) * (y1 - y0 + 1)) < .25) continue;
      // A clipped blob has a biased centroid; retry the full image when it is a ROI edge.
      if (x0 === r.x0 || y0 === r.y0 || x1 === r.x1 - 1 || y1 === r.y1 - 1) continue;
      result[color - 1].push({ x: sx / tail, y: sy / tail, area: tail });
    }
    // Bound pair matching even in pathological patterned backgrounds; ambiguity
    // is preferable to selecting an arbitrary object from hundreds of candidates.
    if (result.some(blobs => blobs.length > 12)) return [[], []];
    return result;
  }
}
