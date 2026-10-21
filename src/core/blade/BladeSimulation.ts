import { sweptBladeHits } from '../tracking/sword/sweep';
import { clipBlade, swordToScreen, validSword, type Point2, type SwordFrame } from '../tracking/sword/types';

export type Crystal = { id: number; active: boolean; x: number; y: number; vx: number; vy: number; age: number; radius: number; gold: boolean };
export type Burst = { x: number; y: number; age: number; points: number; gold: boolean };

/** Fixed pools, bounded steps, measured sweeps only. Display prediction never
 * enters scoring. Tracking loss freezes the round and breaks the sweep. */
export class BladeSimulation {
  readonly targets: Crystal[] = Array.from({ length: 10 }, () => ({ id: 0, active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, radius: .052, gold: false }));
  readonly bursts: Burst[] = [];
  elapsed = 0; score = 0; cuts = 0; missed = 0; combo = 0; bestCombo = 0;
  phase: 'ready' | 'running' | 'over' = 'ready';
  paused = true;
  aspect = 4 / 3;
  private spawnIn = .45;
  private sequence = 0;
  private previous: SwordFrame | null = null;
  private positions = new Map<number, Point2>();
  private lastTimestamp = -Infinity;

  get remaining(): number { return Math.max(0, 60 - this.elapsed); }
  get multiplier(): number { return Math.min(4, 1 + Math.floor(this.combo / 5)); }
  get wave(): number { return Math.min(3, 1 + Math.floor(this.elapsed / 20)); }
  start(aspect: number): void {
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
    this.elapsed = this.score = this.cuts = this.missed = this.combo = this.bestCombo = this.sequence = 0;
    this.spawnIn = .45; this.lastTimestamp = -Infinity; this.phase = 'running'; this.paused = false;
    this.targets.forEach(target => { target.active = false; }); this.bursts.length = 0; this.breakSweep();
  }
  breakSweep(): void { this.previous = null; this.positions.clear(); }
  update(delta: number, active: boolean): void {
    this.paused = !active || this.phase !== 'running';
    if (this.paused) { this.breakSweep(); return; }
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(.05, delta);
    this.elapsed = Math.min(60, this.elapsed + dt);
    if (this.elapsed >= 60) { this.phase = 'over'; this.paused = true; this.breakSweep(); return; }
    for (let i = this.bursts.length - 1; i >= 0; i--) if ((this.bursts[i].age += dt) > .6) this.bursts.splice(i, 1);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const target = this.targets.find(target => !target.active);
      if (target) {
        const id = ++this.sequence, side = id % 2 ? 1 : -1;
        Object.assign(target, { id, active: true, age: 0, x: side > 0 ? .17 : .83, y: 1.09,
          vx: side * (.11 + (id % 3) * .018), vy: -.72 - (id % 3) * .065,
          radius: .052, gold: id % 7 === 0 });
      }
      this.spawnIn = 1.05 - (this.wave - 1) * .18;
    }
    for (const target of this.targets) if (target.active) {
      target.age += dt; target.x += target.vx * dt; target.y += target.vy * dt; target.vy += .4 * dt;
      if (target.age > 1 && target.y > 1.1) { target.active = false; this.missed++; this.combo = 0; }
    }
  }
  accept(measured: SwordFrame | null, now: number): void {
    if (this.paused || this.phase !== 'running' || !measured || !validSword(measured, now)) { this.breakSweep(); return; }
    if (measured.timestampMs <= this.lastTimestamp) return;
    this.lastTimestamp = measured.timestampMs;
    const screen = swordToScreen(measured), clipped = clipBlade(screen);
    if (!clipped) { this.breakSweep(); return; }
    const frame = { ...screen, ...clipped }, previous = this.previous;
    if (previous && frame.timestampMs - previous.timestampMs <= 120
      && frame.supportMask === previous.supportMask && Math.abs(frame.imageAspectRatio - previous.imageAspectRatio) < .01) {
      const movement = Math.max(...(['base', 'tip'] as const).map(key => Math.hypot(
        (frame[key].x - previous[key].x) * frame.imageAspectRatio, frame[key].y - previous[key].y)));
      if (movement * 1000 / (frame.timestampMs - previous.timestampMs) >= .25) {
        for (const target of this.targets) {
          const old = this.positions.get(target.id);
          if (!target.active || !old || target.y < 0 || target.y > 1 || old.y < 0 || old.y > 1) continue;
          if (sweptBladeHits(previous, frame, old, target, target.radius + .009)) {
            target.active = false; this.cuts++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
            const points = (target.gold ? 30 : 10) * this.multiplier; this.score += points;
            if (this.bursts.length >= 24) this.bursts.shift();
            this.bursts.push({ x: target.x, y: target.y, age: 0, points, gold: target.gold });
          }
        }
      }
    }
    this.previous = frame; this.positions.clear();
    for (const target of this.targets) if (target.active) this.positions.set(target.id, { x: target.x, y: target.y });
  }
}
