import type { PopSimulation } from '../../core/pop/PopSimulation';
import { HAND_RADIUS, validHands, type HandFrame } from '../../core/pop/HandInput';
import { clipBlade, swordToScreen, validSword, type SwordFrame } from '../../core/tracking/sword/types';

/** Small 2D canvas with bounded effects and pre-rasterised score labels. */
export class PopView {
  private c: CanvasRenderingContext2D;
  private width = 1; private height = 1; private dpr = 1;
  private labels = new Map<number, HTMLCanvasElement>();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext('2d'); if (!c) throw new Error('Canvas unavailable'); this.c = c;
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect(); this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.dpr = Math.min(devicePixelRatio || 1, 1.5, 1440/this.width, 1080/this.height);
    this.canvas.width = Math.round(this.width*this.dpr); this.canvas.height = Math.round(this.height*this.dpr);
    this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.labels.clear();
    for (const points of [10, 20, 30, 40, 60, 90, 120]) {
      const label = document.createElement('canvas'); label.width = Math.ceil(100*this.dpr); label.height = Math.ceil(42*this.dpr);
      const c = label.getContext('2d')!; c.scale(this.dpr, this.dpr); c.font = '800 22px system-ui'; c.fillStyle = '#fff4c9'; c.textAlign = 'center'; c.fillText(`+${points}`, 50, 29);
      this.labels.set(points, label);
    }
  }
  draw(game: PopSimulation, hands: HandFrame | null, sword: SwordFrame | null, now: number, camera: boolean): void {
    const c = this.c, w = this.width, h = this.height;
    c.clearRect(0, 0, w, h); c.fillStyle = camera ? '#081b2e70' : '#101a30'; c.fillRect(0, 0, w, h);
    for (const target of game.targets) {
      const x = target.x*w, y = target.y*h, r = target.radius*h;
      c.strokeStyle = '#91e0db20'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r+5, 0, Math.PI*2); c.stroke();
      if (!target.active) continue;
      const colour = target.gold ? '#ffe4a1' : target.id%2 ? '#83e9d9' : '#b6a4ff';
      const rise = this.reduced ? 0 : Math.max(0, 1-target.age/.12)*r*.2;
      c.save(); c.translate(x, y+rise);
      c.fillStyle = target.gold ? '#69502b' : target.id%2 ? '#24585f' : '#413a67'; c.strokeStyle = colour; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.fill(); c.stroke();
      c.strokeStyle = colour; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath();
      c.arc(0, 0, r+5, -Math.PI/2, -Math.PI/2+Math.PI*2*(1-target.age/target.lifetime)); c.stroke();
      c.fillStyle = '#f2fff8';
      for (const sign of [-1, 1]) { c.beginPath(); c.ellipse(sign*r*.28, -r*.08, r*.075, r*.13, 0, 0, Math.PI*2); c.fill(); }
      c.lineWidth = 2; c.strokeStyle = '#f2fff8'; c.beginPath(); c.arc(0, r*.12, r*.25, .2, Math.PI-.2); c.stroke(); c.restore();
    }
    for (const burst of game.bursts) {
      const u = burst.age/.45, x = burst.x*w, y = burst.y*h; c.globalAlpha = 1-u;
      c.strokeStyle = '#9ef9e6'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, h*(.055+u*.08), 0, Math.PI*2); c.stroke();
      const label = this.labels.get(burst.points); if (label) c.drawImage(label, x-50, y-30-(this.reduced ? 0 : u*30), 100, 42);
      c.globalAlpha = 1;
    }
    if (hands && validHands(hands, now)) for (const hand of hands.hands) {
      const x = (1-hand.x)*w, y = hand.y*h, r = HAND_RADIUS*h;
      c.fillStyle = hand.id === 'left' ? '#88ffee45' : '#ffb1df45'; c.strokeStyle = hand.id === 'left' ? '#88ffee' : '#ffb1df'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 3, 0, Math.PI*2); c.fill();
    }
    if (sword && validSword(sword, now)) {
      const blade = clipBlade(swordToScreen(sword)); if (!blade) return;
      c.lineCap = 'round'; c.strokeStyle = '#8dffe9'; c.lineWidth = 9; c.beginPath(); c.moveTo(blade.base.x*w, blade.base.y*h); c.lineTo(blade.tip.x*w, blade.tip.y*h); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    }
  }
}
