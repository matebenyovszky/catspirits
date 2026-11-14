import { canCompleteSum, createMathPuzzle, totalSelected, type MathPuzzle } from './PopMath';
import { segmentDistance, sweptBladeContact } from '../tracking/sword/sweep';
import { clipBlade, swordToScreen, validSword, type Point2, type SwordFrame } from '../tracking/sword/types';
import { HAND_RADIUS, validHands, type HandFrame, type HandPoint } from './HandInput';
export type PopTarget = Point2 & { id: number; active: boolean; age: number; lifetime: number; radius: number; gold: boolean; value: number | null };
export type PopBurst = Point2 & { age: number; points: number; reset?: boolean };
export type PopEvent = 'pop' | 'correct' | 'wrong' | 'pick' | 'undo' | 'miss';
export type PopLevel = 1 | 2 | 3 | 4;

/** Fixed reachable grid and independent target lifetimes. Every hand and every
 * blade segment checks every visible target; each target can score only once. */
export class PopSimulation {
  readonly targets: PopTarget[] = Array.from({ length: 9 }, (_, i) => ({ id: 0, active: false, age: 0, lifetime: 2.5,
    radius: .07, x: .18 + (i % 3) * .32, y: .22 + Math.floor(i / 3) * .26, gold: false, value: null }));
  readonly bursts: PopBurst[] = [];
  phase: 'ready' | 'running' | 'over' = 'ready';
  paused = true; elapsed = 0; score = 0; hits = 0; missed = 0; combo = 0; bestCombo = 0; aspect = 4/3;
  level: PopLevel = 1;
  math: MathPuzzle | null = null;
  mathFeedback: 'ready' | 'picked' | 'wrong' | 'solved' | 'resetting' = 'ready';
  private events: PopEvent[] = [];
  drainEvents(): PopEvent[] { return this.events.splice(0); }
  private emit(event: PopEvent): void { if (this.events.length < 24) this.events.push(event); }
  private mathDelay = 0;
  mathIntroRemaining = 0;
  private mathRound = 0;
  get isMath(): boolean { return this.level >= 3; }
  get duration(): number { return this.isMath ? 90 : 45; }
  private spawnIn = .25;
  private sequence = 0;
  private previousHands = new Map<HandPoint['id'], HandPoint>();
  private previousSword: SwordFrame | null = null;
  private priorTargets = new Set<number>();
  private lastTimestamp = -Infinity;
  get remaining(): number { return Math.max(0, this.duration-this.elapsed); }
  get wave(): number { return Math.min(3, 1+Math.floor(this.elapsed/15)); }
  get multiplier(): number { return Math.min(4, 1+Math.floor(this.combo/5)); }
  start(aspect: number, level: PopLevel = 1): void {
    this.events.length = 0;
    this.level = level === 4 ? 4 : level === 3 ? 3 : level === 2 ? 2 : 1;
    this.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4/3;
    this.elapsed = this.score = this.hits = this.missed = this.combo = this.bestCombo = this.sequence = 0;
    this.spawnIn = .25; this.lastTimestamp = -Infinity; this.phase = 'running'; this.paused = false;
    this.targets.forEach(t => { t.active = false; t.value = null; }); this.bursts.length = 0; this.mathRound = 0; this.math = null; this.mathIntroRemaining = 0; this.breakInput();
    if (this.isMath) this.nextMath();
  }
  breakInput(): void { this.previousHands.clear(); this.previousSword = null; this.priorTargets.clear(); }
  update(delta: number, active: boolean): void {
    this.paused = !active || this.phase !== 'running';
    if (this.paused) { this.breakInput(); return; }
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(.05, delta); this.elapsed = Math.min(this.duration, this.elapsed+dt);
    if (this.elapsed >= this.duration) { this.phase = 'over'; this.paused = true; this.breakInput(); return; }
    for (let i = this.bursts.length-1; i >= 0; i--) if ((this.bursts[i].age += dt) > .45) this.bursts.splice(i, 1);
    if (this.isMath) {
      const wasIntro = this.mathIntroRemaining > 0;
      this.mathIntroRemaining = Math.max(0, this.mathIntroRemaining-dt);
      if (wasIntro && this.mathIntroRemaining === 0) this.breakInput();
      this.mathDelay = Math.max(0, this.mathDelay-dt);
      if (!this.mathDelay && this.mathFeedback === 'solved') this.nextMath();
      else if (!this.mathDelay && this.mathFeedback === 'resetting') this.prepareMath();
      else if (!this.mathDelay && this.mathFeedback === 'wrong') this.mathFeedback = 'ready';
      return;
    }
    for (const target of this.targets) if (target.active && (target.age += dt) >= target.lifetime) {
      target.active = false; this.missed++; this.combo = 0; this.emit('miss');
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
  private nextMath(): void {
    this.math = createMathPuzzle(this.level === 4 ? 'sum' : 'answer', this.mathRound++);
    this.prepareMath();
  }
  private prepareMath(): void {
    this.math!.selected.length = 0;
    this.mathDelay = this.mathIntroRemaining = 2; this.mathFeedback = 'ready'; this.breakInput();
    const slots = [0, 1, 2, 6, 7, 8];
    this.targets.forEach(t => { t.active = false; t.value = null; });
    this.math!.choices.forEach((value, i) => Object.assign(this.targets[slots[i]], {
      id: ++this.sequence, active: true, age: 0, lifetime: Infinity, gold: false, radius: Math.min(.08, this.aspect*.12), value
    }));
  }
  undoMath(reset = false): void {
    if (!this.math || this.mathIntroRemaining > 0 || this.paused || this.phase !== 'running' || (this.mathFeedback === 'solved' || this.mathFeedback === 'resetting')) return;
    if (this.math.selected.length) this.emit('undo');
    if (reset) this.math.selected.length = 0; else this.math.selected.pop();
    this.targets.forEach(t => { if (t.value !== null) t.active = !this.math!.selected.includes(this.math!.choices.indexOf(t.value)); });
    this.mathDelay = .35; this.mathFeedback = 'ready'; this.breakInput();
  }
  private hit(target: PopTarget): void {
    if (!target.active || this.mathIntroRemaining > 0) return;
    if (this.math) {
      if (this.mathDelay || this.mathFeedback === 'solved' || target.value === null) return;
      const puzzle = this.math;
      this.mathDelay = .45; // At most one choice per observation, with a short deliberate-selection delay.
      if (puzzle.kind === 'answer' && target.value !== puzzle.target) {
        this.mathFeedback = 'wrong'; this.combo = 0; this.missed++; this.emit('wrong'); return;
      }
      target.active = false;
      puzzle.selected.push(puzzle.choices.indexOf(target.value));
      if (puzzle.kind === 'sum' && (puzzle.selected.length < 2 || totalSelected(puzzle) !== puzzle.target)) {
        if (!canCompleteSum(puzzle)) {
          this.mathFeedback = 'resetting'; this.mathDelay = .7;
          this.combo = 0; this.missed++; this.emit('wrong'); this.breakInput();
          this.bursts.length = 0;
          for (const t of this.targets) if (t.value !== null) {
            t.active = false; this.bursts.push({ x: t.x, y: t.y, age: 0, points: 0, reset: true });
          }
        } else { this.mathFeedback = 'picked'; this.emit('pick'); }
        return;
      }
      this.mathFeedback = 'solved'; this.mathDelay = 1; this.emit('correct');
    }

    if (!this.isMath) this.emit('pop');
    target.active = false; this.hits++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = (target.gold ? 30 : 10)*this.multiplier; this.score += points;
    if (this.bursts.length >= 18) this.bursts.shift();
    this.bursts.push({ x: target.x, y: target.y, age: 0, points });
  }
  acceptHands(frame: HandFrame | null, now: number): void {
    if (this.mathIntroRemaining > 0) { this.breakInput(); return; }
    if (this.paused || this.phase !== 'running' || !frame || !validHands(frame, now)) { this.breakInput(); return; }
    if (frame.timestampMs <= this.lastTimestamp) return;
    const dt = (frame.timestampMs-this.lastTimestamp)/1000; this.lastTimestamp = frame.timestampMs;
    const hands = frame.hands.map(h => ({ ...h, x: 1-h.x }));
    let first: { target: PopTarget; at: number } | null = null;
    for (const hand of hands) {
      const old = this.previousHands.get(hand.id);
      if (!old || dt > .16 || Math.abs(frame.imageAspectRatio-this.aspect) > .01) continue;
      const speed = Math.hypot((hand.x-old.x)*this.aspect, hand.y-old.y)/dt;
      if (speed < .18 || speed > 12) continue;
      for (const target of this.targets) if (target.active && this.priorTargets.has(target.id)
        && (this.level !== 2 || hand.id === (target.id % 2 ? 'left' : 'right'))
        && segmentDistance(target, old, hand, this.aspect) <= target.radius+HAND_RADIUS) {
          if (!this.isMath) { this.hit(target); continue; }
          // Earliest circle entry along the measured sweep, independent of hand
          // colour, target-array order and camera mirroring.
          const dx = (hand.x-old.x)*this.aspect, dy = hand.y-old.y;
          const ox = (old.x-target.x)*this.aspect, oy = old.y-target.y;
          const a = dx*dx+dy*dy, b = ox*dx+oy*dy, c = ox*ox+oy*oy-(target.radius+HAND_RADIUS)**2;
          const at = c <= 0 ? 0 : (-b-Math.sqrt(Math.max(0, b*b-a*c)))/a;
          if (!first || at < first.at) first = { target, at };
        }
    }
    if (first) this.hit(first.target);
    this.previousHands.clear(); this.previousSword = null;
    for (const hand of hands) this.previousHands.set(hand.id, hand);
    this.rememberTargets();
  }
  acceptSword(measured: SwordFrame | null, now: number): void {
    if (this.mathIntroRemaining > 0) { this.breakInput(); return; }
    if (this.level === 2) { this.breakInput(); return; }
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
    if (this.level === 2) return;
    if (this.paused || this.phase !== 'running' || ![point.x, point.y].every(Number.isFinite)) return;
    for (const target of this.targets) if (target.active && Math.hypot((point.x-target.x)*this.aspect, point.y-target.y) <= target.radius) this.hit(target);
  }
}
