import type { ColorBlob, ColorComponentsBackend, ColorRegion } from './ColorWandDetector';
import { PinkGreenComponents } from './PinkGreenComponents';
import { ringScaleCue } from './RingScaleCue';
import { PERSPECTIVE_HOLD_MS, projectivePosition, projectiveSeeds } from './ProjectiveWand';
import { SWORD_MAX_AGE_MS, type SwordDetection, type SwordFrame } from './types';

/** Dimensions agreed with the physical 50 cm, 25 mm diameter wand.
 * Blade endpoints stay at 15/45 cm even when another ring supplies the measurement. */
export const WAND_RINGS = [
  { color: 0, startCm: 12, endCm: 18, centerCm: 15 },
  { color: 0, startCm: 22, endCm: 25, centerCm: 23.5 },
  { color: 1, startCm: 34, endCm: 37, centerCm: 35.5 },
  { color: 1, startCm: 42, endCm: 48, centerCm: 45 },
] as const;
const POSITIONS = WAND_RINGS.map(r => (r.centerCm - 15) / 30);
type Fit = { ax: number; ay: number; dx: number; dy: number; k: number; matches: (ColorBlob | null)[]; count: number; error: number; score: number };

/** Image-plane projective fit of an ordered pink/pink/green/green constellation.
 * Three measured rings acquire identity; two may maintain a recent unambiguous
 * identity. Hidden endpoints are spatial reconstruction, never future motion. */
export class FourRingWandDetector {
  private previous: SwordFrame | null = null;
  private lastTimestamp = -Infinity;
  private width = 0;
  private height = 0;
  private count = 0;
  private perspective = 0;
  private perspectiveAt = -Infinity;
  constructor(private readonly components: ColorComponentsBackend = new PinkGreenComponents()) {}

  reset(): void { this.previous = null; this.lastTimestamp = -Infinity; this.count = 0; this.perspective = 0; this.perspectiveAt = -Infinity; }

  detect(pixels: Uint8ClampedArray, width: number, height: number, timestampMs: number): SwordDetection {
    const invalid = (reason: string): SwordDetection => ({ frame: null, scannedPixels: 0, search: 'full', reason });
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width * height > 640 * 480 || pixels.length !== width * height * 4 || !Number.isFinite(timestampMs)) return invalid('Érvénytelen botkép');
    this.components.prepare(pixels, width, height);
    return this.detectPrepared(width, height, timestampMs);
  }

  /** The backend already owns a fresh image (e.g. native planes in WASM).
   * All geometric, temporal and occlusion gates remain identical. */
  detectPrepared(width: number, height: number, timestampMs: number): SwordDetection {
    const invalid = (reason: string): SwordDetection => ({ frame: null, scannedPixels: 0, search: 'full', reason });
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
      || width * height > 640 * 480 || !Number.isFinite(timestampMs)) return invalid('Érvénytelen botkép');
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; this.reset(); }
    if (timestampMs <= this.lastTimestamp) return invalid('Ismételt vagy régi botkép');
    this.lastTimestamp = timestampMs;
    if (this.previous && timestampMs - this.previous.timestampMs > SWORD_MAX_AGE_MS) {
      this.previous = null; this.perspective = 0; this.perspectiveAt = -Infinity;
    }
    const full: ColorRegion = { x0: 0, y0: 0, x1: width, y1: height };
    let region = full;
    if (this.previous && ++this.count % 15 !== 0) {
      const a = this.previous.base, b = this.previous.tip;
      const margin = Math.max(24, Math.hypot((b.x - a.x) * width, (b.y - a.y) * height) * .3);
      region = { x0: Math.max(0, Math.floor(Math.min(a.x, b.x) * width - margin)),
        y0: Math.max(0, Math.floor(Math.min(a.y, b.y) * height - margin)),
        x1: Math.min(width, Math.ceil(Math.max(a.x, b.x) * width + margin)),
        y1: Math.min(height, Math.ceil(Math.max(a.y, b.y) * height + margin)) };
    }
    let scannedPixels = 0, pinkCount = 0, greenCount = 0;
    const search = (r: ColorRegion) => {
      scannedPixels += (r.x1 - r.x0) * (r.y1 - r.y0);
      const blobs = this.components.components(r);
      pinkCount = blobs[0].length; greenCount = blobs[1].length;
      return this.fit(blobs);
    };
    let result = search(region), mode: SwordDetection['search'] = region === full ? 'full' : 'roi';
    // Partial observations must not hide a stronger constellation elsewhere in
    // the SAME frame. Full search also exposes a competing second wand.
    if (region !== full && (!result || result.count < 3)) { result = search(full); mode = 'full'; }
    if (!result) return { frame: null, scannedPixels, search: mode,
      reason: `${pinkCount} rózsaszín / ${greenCount} zöld színfolt · ${this.previous ? 'bizonytalan botjel' : 'rózsaszín–rózsaszín–zöld–zöld'} · mutass legalább 3 gyűrűt; térbeli dőléshez először mind a 4-et` };
    const supportMask = result.matches.reduce((mask, b, i) => mask | (b ? 1 << i : 0), 0);
    const inferredEndpoints = !(supportMask & 1) || !(supportMask & 8);
    const frame: SwordFrame = { timestampMs, base: { x: result.ax / width, y: result.ay / height },
      tip: { x: (result.ax + result.dx) / width, y: (result.ay + result.dy) / height },
      imageAspectRatio: width / height, confidence: (result.count === 4 ? .98 : result.count === 3 ? .86 : .66) - result.error * .06,
      source: 'four-ring-2d', visibleRings: result.count, inferredEndpoints, supportMask, perspective: result.k,
      scaleCue: ringScaleCue(result.matches,result.dx,result.dy),
      rings: result.matches.flatMap((b, id) => b ? [{ id, x: b.x / width, y: b.y / height }] : []) };
    this.previous = frame;
    if (result.count === 4) { this.perspective = result.k; this.perspectiveAt = timestampMs; }
    return { frame, scannedPixels, search: mode,
      reason: `${result.count}/4 gyűrű mérve${Math.abs(result.k) > .02 ? ' · perspektivikus illesztés' : ''}${inferredEndpoints ? ' · takart végpont a bot geometriájából' : ''}${result.count === 2 ? ' · részleges követés' : ''}` };
  }

  private fit(blobs: [ColorBlob[], ColorBlob[]]): Fit | null {
    const hypotheses: Fit[] = [], w = this.width, h = this.height, previous = this.previous;
    const maxSpan = Math.hypot(w, h) * .8;
    const match = (fit: Fit) => {
      const tolerance = Math.max(3, Math.hypot(fit.dx, fit.dy) * .04), used = new Set<ColorBlob>();
      fit.matches = POSITIONS.map((t, id) => {
        let best: ColorBlob | null = null, distance = tolerance;
        const q = projectivePosition(t, fit.k);
        for (const b of blobs[WAND_RINGS[id].color]) {
          if (used.has(b)) continue;
          const d = Math.hypot(b.x - fit.ax - fit.dx * q, b.y - fit.ay - fit.dy * q);
          if (d < distance) { best = b; distance = d; }
        }
        if (best) used.add(best);
        return best;
      });
      fit.count = used.size;
      return tolerance;
    };
    const refine = (fit: Fit) => {
      let n = 0, st = 0, stt = 0, sx = 0, sy = 0, stx = 0, sty = 0;
      fit.matches.forEach((b, id) => {
        if (!b) return;
        const t = projectivePosition(POSITIONS[id], fit.k); n++; st += t; stt += t * t;
        sx += b.x; sy += b.y; stx += t * b.x; sty += t * b.y;
      });
      const denominator = n * stt - st * st;
      if (n < 2 || denominator < .01) return false;
      fit.dx = (n * stx - st * sx) / denominator; fit.dy = (n * sty - st * sy) / denominator;
      fit.ax = (sx - fit.dx * st) / n; fit.ay = (sy - fit.dy * st) / n;
      return true;
    };
    const add = (a: ColorBlob, b: ColorBlob, ia: number, ib: number, k = 0, requireFour = false) => {
      const ta = projectivePosition(POSITIONS[ia], k), dt = projectivePosition(POSITIONS[ib], k) - ta;
      const dx = (b.x - a.x) / dt, dy = (b.y - a.y) / dt;
      const candidate: Fit = { ax: a.x - dx * ta, ay: a.y - dy * ta, dx, dy, k,
        matches: [], count: 0, error: 0, score: 0 };
      const initialSpan = Math.hypot(dx, dy);
      if (initialSpan < 24 || initialSpan > maxSpan) return;
      match(candidate);
      if (requireFour && candidate.count !== 4) return;
      if (candidate.count < (previous ? 2 : 3) || !refine(candidate)) return;
      const tolerance = match(candidate);
      // A hand can leave half a band visible: its centroid then moves along
      // the shaft. A small, inconsistent fragment must not pull all endpoints.
      if (candidate.count >= 3) {
        const density = (blob: ColorBlob, id: number) => blob.area * Math.pow(1 + k * POSITIONS[id], 3)
          / (WAND_RINGS[id].endCm - WAND_RINGS[id].startCm);
        const densities = candidate.matches.flatMap((blob, id) => blob ? [density(blob, id)] : []).sort((a, b) => a - b);
        const typical = densities[Math.floor(densities.length / 2)];
        candidate.matches.forEach((blob, id) => {
          if (!blob) return;
          const q = projectivePosition(POSITIONS[id], k);
          const residual = Math.hypot(blob.x - candidate.ax - candidate.dx * q, blob.y - candidate.ay - candidate.dy * q);
          if (density(blob, id) < typical * .65
            && residual > Math.max(1.5, initialSpan * .01)) { candidate.matches[id] = null; candidate.count--; }
        });
      }
      if (candidate.count < (previous ? 2 : 3) || !refine(candidate)) return;
      if (requireFour && candidate.count !== 4) return;
      // Do not renew a depth estimate with observations that cannot validate it.
      if (candidate.count < 4 && Math.abs(k) > .02
        && this.lastTimestamp - this.perspectiveAt > PERSPECTIVE_HOLD_MS) return;
      const span = Math.hypot(candidate.dx, candidate.dy);
      if (span < 24 || span > maxSpan) return;
      // Endpoints are geometric ring centres, not necessarily visible pixels.
      // An edge-clipped band is deliberately excluded by the component finder;
      // the other 3 rings (or a recent unambiguous pair) still locate the wand.
      // Keep the span/identity gates; clipping belongs to display and hit testing.
      let error = 0;
      for (let id = 0; id < 4; id++) {
        const blob = candidate.matches[id]; if (!blob) continue;
        const q = projectivePosition(POSITIONS[id], k);
        const distance = Math.hypot(blob.x - candidate.ax - candidate.dx * q, blob.y - candidate.ay - candidate.dy * q);
        if (distance > tolerance) return;
        error += distance * distance;
      }
      candidate.error = Math.sqrt(error / candidate.count) / tolerance;
      let continuity = 0;
      if (previous) {
        const px = (previous.tip.x - previous.base.x) * w, py = (previous.tip.y - previous.base.y) * h;
        const oldSpan = Math.hypot(px, py);
        const movement = Math.max(Math.hypot(candidate.ax - previous.base.x * w, candidate.ay - previous.base.y * h),
          Math.hypot(candidate.ax + candidate.dx - previous.tip.x * w, candidate.ay + candidate.dy - previous.tip.y * h));
        continuity = movement / Math.max(span, oldSpan);
        if ((candidate.count === 2 || candidate.count < 4 && Math.abs(k) > .02) && (span / oldSpan < .7 || span / oldSpan > 1.4
          || movement > Math.max(25, oldSpan * .3) || (px * candidate.dx + py * candidate.dy) / (oldSpan * span) < .5)) return;
      }
      // The two outer bands are twice as wide as the inner bands. Use area
      // only as a soft identity cue: glare or partial coverage can reduce it.
      const densities = candidate.matches.flatMap((b, id) => b ? [b.area * Math.pow(1 + k * POSITIONS[id], 3)
        / (WAND_RINGS[id].endCm - WAND_RINGS[id].startCm)] : []);
      const areaError = Math.log(Math.max(...densities) / Math.min(...densities));
      candidate.score = candidate.count * 10 - candidate.error * 3 - areaError - Math.min(2, continuity) * (candidate.count === 2 ? 4 : 1);
      // Many anchor pairs describe the same constellation. Compare distinct
      // physical poses, not duplicate hypotheses, when rejecting ambiguity.
      const same = hypotheses.find(f => Math.max(Math.hypot(f.ax - candidate.ax, f.ay - candidate.ay),
        Math.hypot(f.ax + f.dx - candidate.ax - candidate.dx, f.ay + f.dy - candidate.ay - candidate.dy)) < Math.max(4, span * .045));
      if (same) { if (candidate.score > same.score) Object.assign(same, candidate); }
      else hypotheses.push(candidate);
    };
    projectiveSeeds(blobs, maxSpan, (pink, green, k) => add(pink, green, 0, 3, k, true));
    // Common case: exactly four components, one independently validated strong
    // constellation. No alternative blob identity exists, so avoid re-solving
    // all affine anchor pairs. Clutter/partial/ambiguous cases take the full path.
    if (blobs[0].length === 2 && blobs[1].length === 2 && hypotheses.length === 1
      && hypotheses[0].count === 4 && hypotheses[0].error < .2) return hypotheses[0];
    const heldK = previous ? this.perspective : 0;
    for (const pink of blobs[0]) for (const green of blobs[1]) for (const ip of [0, 1]) for (const ig of [2, 3]) add(pink, green, ip, ig, heldK);
    if (previous) for (let color = 0; color < 2; color++) for (const a of blobs[color]) for (const b of blobs[color]) {
      if (a !== b) add(a, b, color * 2, color * 2 + 1, heldK);
    }
    hypotheses.sort((a, b) => b.score - a.score);
    const best = hypotheses[0];
    if (!best || hypotheses[1] && best.score - hypotheses[1].score < .85) return null;
    return best;
  }
}
