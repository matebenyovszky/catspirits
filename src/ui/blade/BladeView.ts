import { CUT_DIRECTIONS, type BladeSimulation } from '../../core/blade/BladeSimulation';
import { SwordDisplayPredictor } from '../../core/tracking/sword/SwordDisplayPredictor';
import { clipBlade, swordToScreen, type SwordFrame } from '../../core/tracking/sword/types';

type Sprite = { canvas: HTMLCanvasElement; width: number; height: number };
/** Lightweight 2D arena; hit glyphs and crystal glows are rasterised at resize,
 * never in the camera callback or on the first hit. All caches are bounded. */
export class BladeView {
  private ctx: CanvasRenderingContext2D;
  private predictor = new SwordDisplayPredictor();
  private width = 800;
  private height = 600;
  private dpr = 1;
  private trail: { x: number; y: number; at: number }[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private crystals: Sprite[] = [];
  private labels = new Map<string, Sprite>();
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.ctx = context;
  }
  reset(): void { this.predictor = new SwordDisplayPredictor(); this.trail.length = 0; }
  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    this.dpr = Math.min(devicePixelRatio || 1, 1.5, 1440 / this.width, 1080 / this.height);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.prepareSprites();
  }
  private sprite(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void): Sprite {
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * this.dpr); canvas.height = Math.ceil(height * this.dpr);
    const c = canvas.getContext('2d')!; c.scale(this.dpr, this.dpr); paint(c); return { canvas, width, height };
  }
  private prepareSprites(): void {
    this.crystals = ['#b9a9ff', '#ffe1a0', '#ff887f'].map((colour, kind) => this.sprite(112, 112, c => {
      c.translate(56, 56); c.shadowColor = colour; c.shadowBlur = 12;
      c.fillStyle = ['#383460', '#634c2e', '#512c39'][kind]; c.strokeStyle = colour; c.lineWidth = 2;
      c.beginPath();
      if (kind === 2) {
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 24 : 34; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      } else {
        c.moveTo(0, -32); c.lineTo(25, -10); c.lineTo(23, 18); c.lineTo(0, 32); c.lineTo(-23, 18); c.lineTo(-25, -10);
      }
      c.closePath(); c.fill(); c.stroke();
    }));
    this.labels.clear();
    const size = Math.max(16, this.height * .035);
    for (const gold of [false, true]) for (let multiplier = 1; multiplier <= 4; multiplier++) {
      const points = (gold ? 30 : 10) * multiplier;
      this.labels.set(`${points}:${gold}`, this.label(`+${points}`, gold ? '#ffe1a0' : '#7af5dc', size));
    }
    for (const points of [0, -10, -20]) this.labels.set(`${points}:false`, this.label(points ? `−${-points}` : '×', '#ffaaa1', size));
  }
  private label(text: string, colour: string, size: number): Sprite {
    return this.sprite(size * 4.5, size * 1.6, c => {
      c.font = `800 ${size}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = colour;
      c.fillText(text, size * 2.25, size * .8);
    });
  }
  draw(game: BladeSimulation, measured: SwordFrame | null, now: number, camera: boolean): void {
    const c = this.ctx, w = this.width, h = this.height;
    c.clearRect(0, 0, w, h);
    const shade = c.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, camera ? 'rgba(8,12,29,.48)' : '#0c142a'); shade.addColorStop(1, camera ? 'rgba(9,10,27,.8)' : '#10112c');
    c.fillStyle = shade; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8b84de19'; c.lineWidth = 1;
    for (let x = 0; x < w; x += h / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += h / 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let i = 0; i < 32; i++) {
      c.fillStyle = i % 3 ? '#c2d3ff35' : '#65e6cf70'; c.fillRect(((i * 137.31) % 1) * w, ((i * 57.17) % 1) * h, 2, 2);
    }
    for (const target of game.targets) if (target.active) {
      const x = target.x * w, y = target.y * h, r = target.radius * h;
      const sprite = this.crystals[target.hazard ? 2 : target.gold ? 1 : 0];
      c.save(); c.translate(x, y); c.rotate(this.reduced ? .2 : target.age * .5);
      if (sprite) c.drawImage(sprite.canvas, -r * 1.75, -r * 1.75, r * 3.5, r * 3.5);
      c.restore();
      c.save(); c.translate(x, y); c.lineCap = c.lineJoin = 'round'; c.lineWidth = Math.max(2, r * .13);
      c.strokeStyle = target.flash ? '#ffaaa1' : '#fff8ed';
      c.beginPath();
      if (target.hazard) {
        c.moveTo(-r * .35, -r * .35); c.lineTo(r * .35, r * .35); c.moveTo(r * .35, -r * .35); c.lineTo(-r * .35, r * .35);
      } else if (game.level === 1) {
        c.moveTo(-r * .3, 0); c.lineTo(r * .3, 0); c.moveTo(0, -r * .3); c.lineTo(0, r * .3);
      } else {
        const dir = CUT_DIRECTIONS[target.direction]; c.rotate(Math.atan2(dir.y, dir.x));
        c.moveTo(-r * .45, 0); c.lineTo(r * .45, 0); c.moveTo(r * .1, -r * .35); c.lineTo(r * .45, 0); c.lineTo(r * .1, r * .35);
      }
      c.stroke();
      if (target.flash) { c.strokeStyle = '#ff887f'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r * 1.2, 0, Math.PI * 2); c.stroke(); }
      c.restore();
    }
    for (const burst of game.bursts) {
      const u = burst.age / .6, x = burst.x * w, y = burst.y * h;
      c.globalAlpha = 1 - u; c.fillStyle = burst.hazard ? '#ffaaa1' : burst.gold ? '#ffe1a0' : '#7af5dc';
      if (!this.reduced) for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7, radius = (12 + u * 60) * h / 600;
        c.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 4, 4);
      }
      const label = this.labels.get(`${burst.points}:${burst.gold}`);
      if (label) c.drawImage(label.canvas, x - label.width / 2, y - 30 - u * 25, label.width, label.height);
      c.globalAlpha = 1;
    }
    const projected = this.predictor.sample(measured, now, !this.reduced);
    if (!projected) { this.trail.length = 0; return; }
    const screen = swordToScreen({ ...measured!, ...projected }), blade = clipBlade(screen);
    if (!blade) return;
    const base = { x: blade.base.x * w, y: blade.base.y * h }, tip = { x: blade.tip.x * w, y: blade.tip.y * h };
    if (!this.reduced) {
      this.trail.push({ ...tip, at: now });
      this.trail = this.trail.filter(point => now - point.at < 120).slice(-10);
      c.strokeStyle = '#68ffe440'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
      this.trail.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.stroke();
    }
    c.lineCap = 'round'; c.strokeStyle = '#63efd12a'; c.lineWidth = 18;
    c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(tip.x, tip.y); c.stroke();
    c.strokeStyle = '#63efd1'; c.lineWidth = 9; c.stroke();
    c.strokeStyle = '#edfff9'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#f185cc'; c.beginPath(); c.arc(base.x, base.y, 6, 0, Math.PI * 2); c.fill();
    if (camera) for (const ring of screen.rings ?? []) { c.fillStyle = ring.id < 2 ? '#ff76cb' : '#94f67c'; c.beginPath(); c.arc(ring.x * w, ring.y * h, 3, 0, Math.PI * 2); c.fill(); }
  }
}
