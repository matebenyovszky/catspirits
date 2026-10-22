import { segmentDistance, sweptBladeContact } from '../tracking/sword/sweep';
import { clipBlade, swordToScreen, validSword, type Point2, type SwordFrame } from '../tracking/sword/types';
import { HAND_RADIUS, validHands, type HandFrame, type HandPoint } from './HandInput';
export type PopTarget = Point2 & { id: number; active: boolean; age: number; lifetime: number; radius: number; gold: boolean };
export type PopBurst = Point2 & { age: number; points: number };

/** Fixed reachable grid and independent target lifetimes. Every hand and every
 * blade segment checks every visible target; each target can score only once. */
export class PopSimulation {
  readonly targets: PopTarget[] = Array.from({ length: 9 }, (_, i) => ({ id: 0, active: false, age: 0, lifetime: 2.5,
    radius: .07, x: .18 + (i % 3) * .32, y: .22 + Math.floor(i / 3) * .26, gold: false }));
  readonly bursts: PopBurst[] = [];
  phase: 'ready' | 'running' | 'over' = 'ready';
  paused = true; elapsed = 0; score = 0; hits = 0; missed = 0; combo = 0; bestCombo = 0; aspect = 4/3;
  private spawnIn = .25;
  private sequence = 0;
  private previousHands = new Map<HandPoint['id'], HandPoint>();
  private previousSword: SwordFrame | null = null;
  private priorTargets = new Set<number>();
  private lastTimestamp = -Infinity;
  get remaining(): number { return Math.max(0, 45-this.elapsed); }
  get wave(): number { return Math.min(3, 1+Math.floor(this.elapsed/15)); }
  get multiplier(): number { return Math.min(4, 1+Math.floor(this.combo/5)); }
  start(aspect: number): void {
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4/3;
    this.elapsed = this.score = this.hits = this.missed = this.combo = this.bestCombo = this.sequence = 0;
    this.spawnIn = .25; this.lastTimestamp = -Infinity; this.phase = 'running'; this.paused = false;
    this.targets.forEach(t => { t.active = false; }); this.bursts.length = 0; this.breakInput();
  }
  breakInput(): void { this.previousHands.clear(); this.previousSword = null; this.priorTargets.clear(); }
  update(delta: number, active: boolean): void {
    this.paused = !active || this.phase !== 'running';
    if (this.paused) { this.breakInput(); return; }
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(.05, delta); this.elapsed = Math.min(45, this.elapsed+dt);
    if (this.elapsed >= 45) { this.phase = 'over'; this.paused = true; this.breakInput(); return; }
    for (let i = this.bursts.length-1; i >= 0; i--) if ((this.bursts[i].age += dt) > .45) this.bursts.splice(i, 1);
    for (const target of this.targets) if (target.active && (target.age += dt) >= target.lifetime) {
      target.active = false; this.missed++; this.combo = 0;
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const start = (this.sequence * 5 + Math.floor(this.sequence/3)) % 9;
      for (let i = 0; i < 9; i++) {
        const target = this.targets[(start+i)%9]; if (target.active) continue;
        const id = ++this.sequence;
        Object.assign(target, { id, active: true, age: 0, lifetime: 2.5-(this.wave-1)*.35, radius: Math.min(.07, this.aspect*.105), gold: id%5 === 0 }); break;
      }
      this.spawnIn = .65-(this.wave-1)*.12;
    }
  }
  private rememberTargets(): void { this.priorTargets.clear(); for (const t of this.targets) if (t.active) this.priorTargets.add(t.id); }
  private hit(target: PopTarget): void {
    target.active = false; this.hits++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = (target.gold ? 30 : 10)*this.multiplier; this.score += points;
    if (this.bursts.length >= 18) this.bursts.shift();
    this.bursts.push({ x: target.x, y: target.y, age: 0, points });
  }
  acceptHands(frame: HandFrame | null, now: number): void {
    if (this.paused || this.phase !== 'running' || !frame || !validHands(frame, now)) { this.breakInput(); return; }
    if (frame.timestampMs <= this.lastTimestamp) return;
    const dt = (frame.timestampMs-this.lastTimestamp)/1000; this.lastTimestamp = frame.timestampMs;
    const hands = frame.hands.map(h => ({ ...h, x: 1-h.x }));
    for (const hand of hands) {
      const old = this.previousHands.get(hand.id);
      if (!old || dt > .16 || Math.abs(frame.imageAspectRatio-this.aspect) > .01) continue;
      const speed = Math.hypot((hand.x-old.x)*this.aspect, hand.y-old.y)/dt;
      if (speed < .18 || speed > 12) continue;
      for (const target of this.targets) if (target.active && this.priorTargets.has(target.id)
        && segmentDistance(target, old, hand, this.aspect) <= target.radius+HAND_RADIUS) this.hit(target);
    }
    this.previousHands.clear(); this.previousSword = null;
    for (const hand of hands) this.previousHands.set(hand.id, hand);
    this.rememberTargets();
  }
  acceptSword(measured: SwordFrame | null, now: number): void {
    if (this.paused || this.phase !== 'running' || !measured || !validSword(measured, now)) { this.breakInput(); return; }
    if (measured.timestampMs <= this.lastTimestamp) return;
    this.lastTimestamp = measured.timestampMs;
    const screen = swordToScreen(measured), clipped = clipBlade(screen);
    if (!clipped) { this.breakInput(); return; }
    const frame = { ...screen, ...clipped }, old = this.previousSword;
    if (old && frame.timestampMs-old.timestampMs <= 120 && old.supportMask === frame.supportMask
      && Math.abs(frame.imageAspectRatio-old.imageAspectRatio) < .01) {
      const dt = (frame.timestampMs-old.timestampMs)/1000;
      for (const target of this.targets) if (target.active && this.priorTargets.has(target.id)) {
        const contact = sweptBladeContact(old, frame, target, target, target.radius+.009); if (!contact) continue;
        const u = contact.along;
        const dx = ((frame.base.x-old.base.x)*(1-u)+(frame.tip.x-old.tip.x)*u)*this.aspect;
        const dy = (frame.base.y-old.base.y)*(1-u)+(frame.tip.y-old.tip.y)*u;
        if (Math.hypot(dx, dy)/dt >= .25) this.hit(target);
      }
    }
    this.previousSword = frame; this.previousHands.clear(); this.rememberTargets();
  }
  tap(point: Point2): void {
    if (this.paused || this.phase !== 'running' || ![point.x, point.y].every(Number.isFinite)) return;
    for (const target of this.targets) if (target.active && Math.hypot((point.x-target.x)*this.aspect, point.y-target.y) <= target.radius) this.hit(target);
  }
}
