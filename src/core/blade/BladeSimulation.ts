import { segmentDistance, sweptBladeContact } from '../tracking/sword/sweep';
import { clipBlade, swordToScreen, validSword, type Point2, type SwordFrame } from '../tracking/sword/types';

export const CUT_DIRECTIONS = [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }] as const;
export type Crystal = { id: number; active: boolean; x: number; y: number; vx: number; vy: number; age: number; radius: number;
  gold: boolean; hazard: boolean; direction: number; flash: number };
export type Burst = { x: number; y: number; age: number; points: number; gold: boolean; hazard: boolean };

/** Fixed pools, bounded steps, measured sweeps only. Display prediction never
 * enters scoring. A missing measurement always breaks the collision sweep. */
export class BladeSimulation {
  readonly targets: Crystal[] = Array.from({ length: 10 }, () => ({ id: 0, active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0,
    radius: .052, gold: false, hazard: false, direction: 0, flash: 0 }));
  readonly bursts: Burst[] = [];
  elapsed = 0; score = 0; cuts = 0; missed = 0; combo = 0; bestCombo = 0; mistakes = 0;
  phase: 'ready' | 'running' | 'over' = 'ready';
  paused = true;
  aspect = 4 / 3;
  private spawnIn = .45;
  private sequence = 0;
  private previous: SwordFrame | null = null;
  private positions = new Map<number, Point2>();
  private contacts = new Set<number>();
  private lastTimestamp = -Infinity;

  get remaining(): number { return Math.max(0, 60 - this.elapsed); }
  get multiplier(): number { return Math.min(4, 1 + Math.floor(this.combo / 5)); }
  get wave(): number { return Math.min(3, 1 + Math.floor(this.elapsed / 20)); }
  start(aspect: number): void {
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
    this.elapsed = this.score = this.cuts = this.missed = this.combo = this.bestCombo = this.mistakes = this.sequence = 0;
    this.spawnIn = .45; this.lastTimestamp = -Infinity; this.phase = 'running'; this.paused = false;
    this.targets.forEach(target => { target.active = false; }); this.bursts.length = 0; this.contacts.clear(); this.breakSweep();
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
        const hazard = this.wave > 1 && id % (this.wave === 2 ? 6 : 4) === 0;
        Object.assign(target, { id, active: true, age: 0, x: side > 0 ? .17 : .83, y: 1.09,
          vx: side * (.11 + (id % 3) * .018), vy: -.72 - (id % 3) * .065,
          radius: hazard ? .047 : .052, gold: !hazard && id % 7 === 0, hazard, direction: (id - 1) % 4, flash: 0 });
      }
      this.spawnIn = 1.05 - (this.wave - 1) * .18;
    }
    for (const target of this.targets) if (target.active) {
      target.age += dt; target.x += target.vx * dt; target.y += target.vy * dt; target.vy += .4 * dt;
      target.flash = Math.max(0, target.flash - dt);
      if (target.age > 1 && target.y > 1.1) {
        target.active = false; this.contacts.delete(target.id);
        if (!target.hazard) { this.missed++; this.combo = 0; }
      }
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
      const seconds = (frame.timestampMs - previous.timestampMs) / 1000;
      for (const target of this.targets) {
        if (!target.active) continue;
        // One decision per contact: wiggling inside a crystal cannot repair an
        // incorrect cut. Leave it and make a new, deliberate approach.
        if (this.contacts.has(target.id)) {
          if (segmentDistance(target, frame.base, frame.tip, frame.imageAspectRatio) > target.radius + .035) this.contacts.delete(target.id);
          continue;
        }
        const old = this.positions.get(target.id);
        if (!old || target.y < 0 || target.y > 1 || old.y < 0 || old.y > 1) continue;
        const contact = sweptBladeContact(previous, frame, old, target, target.radius + .009);
        if (!contact) continue;
        // Evaluate the actual blade section at the hit. A fast-moving tip must
        // not qualify a stationary handle, nor may target motion earn points.
        const u = contact.along;
        const dx = ((frame.base.x - previous.base.x) * (1 - u) + (frame.tip.x - previous.tip.x) * u) * frame.imageAspectRatio;
        const dy = (frame.base.y - previous.base.y) * (1 - u) + (frame.tip.y - previous.tip.y) * u;
        const movement = Math.hypot(dx, dy);
        if (!target.hazard && movement / seconds < .55) continue;
        this.contacts.add(target.id);
        if (!target.hazard) {
          const direction = CUT_DIRECTIONS[target.direction];
          if ((dx * direction.x + dy * direction.y) / movement < Math.SQRT1_2) {
            this.combo = 0; this.mistakes++; target.flash = .22; continue;
          }
        }
        target.active = false; this.contacts.delete(target.id);
        let points: number;
        if (target.hazard) { points = -Math.min(20, this.score); this.combo = 0; this.mistakes++; }
        else { this.cuts++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); points = (target.gold ? 30 : 10) * this.multiplier; }
        this.score += points;
        if (this.bursts.length >= 24) this.bursts.shift();
        this.bursts.push({ x: target.x, y: target.y, age: 0, points, gold: target.gold, hazard: target.hazard });
      }
    }
    this.previous = frame; this.positions.clear();
    for (const target of this.targets) if (target.active) this.positions.set(target.id, { x: target.x, y: target.y });
  }
}
