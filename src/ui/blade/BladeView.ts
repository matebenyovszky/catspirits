import type { BladeSimulation } from '../../core/blade/BladeSimulation';
import { SwordDisplayPredictor } from '../../core/tracking/sword/SwordDisplayPredictor';
import { clipBlade, swordToScreen, type SwordFrame } from '../../core/tracking/sword/types';

/** Lightweight 2D arena; no Three.js, neural model or postprocessing in this mode. */
export class BladeView {
  private ctx: CanvasRenderingContext2D;
  private predictor = new SwordDisplayPredictor();
  private width = 800;
  private height = 600;
  private trail: { x: number; y: number; at: number }[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.ctx = context;
  }
  reset(): void { this.predictor = new SwordDisplayPredictor(); this.trail.length = 0; }
  resize(): void {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    const dpr = Math.min(devicePixelRatio || 1, 1.5, 1440 / this.width, 1080 / this.height);
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      c.save(); c.translate(x, y); c.rotate(this.reduced ? .2 : target.age * .8);
      c.shadowColor = target.gold ? '#ffe199' : '#9c91ff'; c.shadowBlur = 16;
      c.fillStyle = target.gold ? '#ffbd6555' : '#a397ff50'; c.strokeStyle = target.gold ? '#ffe3a2' : '#c1b4ff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -r); c.lineTo(r * .78, -.3 * r); c.lineTo(r * .72, r * .55); c.lineTo(0, r);
      c.lineTo(-r * .72, .55 * r); c.lineTo(-r * .78, -.3 * r); c.closePath(); c.fill(); c.stroke();
      c.shadowBlur = 0; c.beginPath(); c.moveTo(0, -r); c.lineTo(-r * .28, -.18 * r); c.lineTo(0, r);
      c.moveTo(-r * .78, -.3 * r); c.lineTo(-r * .28, -.18 * r); c.lineTo(r * .78, -.3 * r); c.stroke(); c.restore();
    }
    for (const burst of game.bursts) {
      const u = burst.age / .6, x = burst.x * w, y = burst.y * h;
      c.globalAlpha = 1 - u; c.fillStyle = burst.gold ? '#ffe1a0' : '#7af5dc';
      if (!this.reduced) for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7, radius = (12 + u * 60) * h / 600;
        c.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 4, 4);
      }
      c.font = `800 ${Math.max(16, h * .035)}px system-ui`; c.textAlign = 'center'; c.fillText(`+${burst.points}`, x, y - 18 - u * 25); c.globalAlpha = 1;
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
    c.lineCap = 'round'; c.shadowColor = '#5fffe0'; c.shadowBlur = 16; c.strokeStyle = '#63efd1'; c.lineWidth = 9;
    c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(tip.x, tip.y); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = '#edfff9'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#f185cc'; c.beginPath(); c.arc(base.x, base.y, 6, 0, Math.PI * 2); c.fill();
    if (camera) for (const ring of screen.rings ?? []) { c.fillStyle = ring.id < 2 ? '#ff76cb' : '#94f67c'; c.beginPath(); c.arc(ring.x * w, ring.y * h, 3, 0, Math.PI * 2); c.fill(); }
  }
}
