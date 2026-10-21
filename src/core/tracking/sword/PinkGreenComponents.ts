import type { ColorBlob, ColorComponentsBackend, ColorRegion } from './ColorWandDetector';

/** Saturated foil colors, not skin/red, cyan or gray. Buffers are reused.
 * Thresholds deliberately leave a gap between the two classes; geometry is
 * still required before any colored object may become a sword. */
export class PinkGreenComponents implements ColorComponentsBackend {
  private pixels: Uint8ClampedArray = new Uint8ClampedArray(0);
  private mask = new Uint8Array(0);
  private queue = new Int32Array(0);
  private width = 0;
  private height = 0;

  prepare(pixels: Uint8ClampedArray, width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width * height > 640 * 480 || pixels.length !== width * height * 4) throw new RangeError('Invalid foil image');
    if (width !== this.width || height !== this.height) {
      this.mask = new Uint8Array(width * height); this.queue = new Int32Array(width * height);
      this.width = width; this.height = height;
    }
    this.pixels = pixels;
  }

  components(r: ColorRegion): [ColorBlob[], ColorBlob[]] {
    const w = this.width, h = this.height, pixels = this.pixels, mask = this.mask, queue = this.queue;
    if (![r.x0, r.y0, r.x1, r.y1].every(Number.isInteger) || r.x0 < 0 || r.y0 < 0
      || r.x1 > w || r.y1 > h || r.x1 <= r.x0 || r.y1 <= r.y0) return [[], []];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const i = y * w + x, p = i * 4, red = pixels[p], green = pixels[p + 1], blue = pixels[p + 2];
      mask[i] = pixels[p + 3] < 128 ? 0
        : red > 65 && blue > 35 && red > green * 1.4 + 15 && blue > green * 1.05 + 5 && red > blue * .7 ? 1
        : green > 60 && green > red * 1.35 + 15 && green > blue * 1.2 + 10 ? 2 : 0;
    }
    const blobs: [ColorBlob[], ColorBlob[]] = [[], []];
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const i = y * w + x, color = mask[i];
      if (!color) continue;
      let head = 0, tail = 1, sx = 0, sy = 0, x0 = x, x1 = x, y0 = y, y1 = y;
      let sxx=0,sxy=0,syy=0;
      queue[0] = i; mask[i] = 0;
      const enqueue = (j: number) => { if (mask[j] === color) { mask[j] = 0; queue[tail++] = j; } };
      while (head < tail) {
        const j = queue[head++], py = Math.floor(j / w), px = j - py * w;
        sx += px + .5; sy += py + .5;
        sxx+=(px+.5)*(px+.5);sxy+=(px+.5)*(py+.5);syy+=(py+.5)*(py+.5);
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        if (px > r.x0) enqueue(j - 1); if (px + 1 < r.x1) enqueue(j + 1);
        if (py > r.y0) enqueue(j - w); if (py + 1 < r.y1) enqueue(j + w);
      }
      if (tail < 5 || tail > w * h * .025 || tail / ((x1 - x0 + 1) * (y1 - y0 + 1)) < .2) continue;
      // A clipped centroid is biased. ROI search will retry on the full image.
      if (x0 === r.x0 || x1 === r.x1 - 1 || y0 === r.y0 || y1 === r.y1 - 1) continue;
      const cx=sx/tail,cy=sy/tail;
      blobs[color - 1].push({ x: cx, y: cy, area: tail,
        moments:{xx:sxx/tail-cx*cx,xy:sxy/tail-cx*cy,yy:syy/tail-cy*cy} });
      if (blobs[color - 1].length > 12) return [[], []];
    }
    return blobs;
  }
}
