import { RunnerSimulation } from '../tracking/RunnerSimulation';
import type { MotionInput } from '../tracking/types';
export { DUCK_GATE_HALF_DEPTH } from '../tracking/RunnerSimulation';
export type ObstacleKind = 'jump' | 'duck';
const DUCK_SECTIONS: readonly (readonly number[])[] = [[], [], [2, 5], [1, 4, 6], [1, 3, 5, 7]];

export const WORLDS = [
  { name: 'Neonváros', subtitle: 'A kaland itt indul', color: '#53f2d1', accent: '#ae7aff', sky: '#090d26', speed: 3.5, spacing: 8, tempo: 112, root: 45 },
  { name: 'Pixelkert', subtitle: 'Kövesd a fényeket', color: '#a8f36b', accent: '#42dbf4', sky: '#092024', speed: 3.9, spacing: 7.8, tempo: 120, root: 48 },
  { name: 'Csillagkikötő', subtitle: 'Ugorj és hajolj a fénykapuknál', color: '#65caff', accent: '#fa90ce', sky: '#0e1434', speed: 4.3, spacing: 7.5, tempo: 128, root: 50 },
  { name: 'Lávafény', subtitle: 'Forró ritmus, nagy ugrások', color: '#ffb36b', accent: '#fa75b9', sky: '#241026', speed: 4.7, spacing: 7.2, tempo: 132, root: 52 },
  { name: 'Szivárványhíd', subtitle: 'A végső fényfutam', color: '#eaf77b', accent: '#a38bff', sky: '#171434', speed: 5.1, spacing: 7, tempo: 140, root: 53 },
] as const;

export const SUITS = [
  { name: 'Menta', color: '#53f2d1', requiredStars: 0 },
  { name: 'Rózsaszín', color: '#ff84cb', requiredStars: 3 },
  { name: 'Napfény', color: '#ffe778', requiredStars: 7 },
  { name: 'Galaxis', color: '#a994ff', requiredStars: 11 },
] as const;
export type JumperPhase = 'ready' | 'running' | 'paused' | 'level-complete' | 'game-over' | 'victory';
export type JumperDifficulty = 'chill' | 'normal';
export type Pickup = { id: number; distance: number; height: number; lane: number; kind: 'crystal' | 'shield'; resolved: boolean };
type PickupPattern = Omit<Pickup, 'id' | 'resolved'>;
export type CourseSection = { index: number; kind: ObstacleKind; distance: number; lane: number; pickups: (PickupPattern & { slot: number })[] };
export const LOOK_AHEAD_SECTIONS = 4;
export type JumperEvent = { type: 'jump' | 'duck' | 'land' | 'crystal' | 'shield' | 'hit' | 'clear' | 'level' | 'finish'; lane?: number; height?: number; value?: number };
export type JumperSave = { version: 1; best: number; stars: number[]; suit: number; difficulty: JumperDifficulty; music: number; effects: number };

export const freshSave = (): JumperSave => ({ version: 1, best: 0, stars: [0,0,0,0,0], suit: 0, difficulty: 'normal', music: .55, effects: .75 });
export function validateSave(raw: unknown): JumperSave {
  const clean = freshSave();
  if (!raw || typeof raw !== 'object') return clean;
  const value = raw as Partial<JumperSave>;
  if (value.version !== 1) return clean;
  clean.best = typeof value.best === 'number' && Number.isFinite(value.best) ? Math.max(0, Math.floor(value.best)) : 0;
  if (Array.isArray(value.stars)) clean.stars = Array.from({ length: 5 }, (_, index) => {
    const star = value.stars![index];
    return Number.isFinite(star) ? Math.max(0, Math.min(3, Math.floor(star))) : 0;
  });
  const total = clean.stars.reduce((a,b) => a+b, 0);
  const suit = value.suit;
  if (typeof suit === 'number' && Number.isInteger(suit) && SUITS[suit] && SUITS[suit].requiredStars <= total) clean.suit = suit;
  clean.difficulty = value.difficulty === 'chill' ? 'chill' : 'normal';
  for (const key of ['music', 'effects'] as const) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) clean[key] = Math.max(0, Math.min(1, value[key]!));
  }
  return clean;
}

/** Uses the original camera runner's jump physics and measured momentum. */
export class JumperSimulation {
  readonly runner = new RunnerSimulation();
  phase: JumperPhase = 'ready';
  level = 0;
  score = 0;
  hearts = 3;
  crystals = 0;
  combo = 0;
  maxCombo = 0;
  shield = false;
  lane = 0;
  elapsed = 0;
  stars = 0;
  readonly hurdleCount = 8;
  pickups: Pickup[] = [];
  difficulty: JumperDifficulty = 'normal';
  ducking = false;
  private events: JumperEvent[] = [];
  private segment = 0;
  private checkpoint = 0;
  private nextId = 0;
  private previousHeight = 0;
  private jumpBuffer = 0;
  private bufferedStrength = .8;
  private duckHeld = false;
  private duckBuffer = 0;
  private lastRunPace = 0;
  private readonly keyboard: MotionInput = { tracked: true, calibrated: true, calibrationProgress: 1, runSpeed: 1, jump: false, crouch: false, lane: 0 };

  start(level = 0, difficulty: JumperDifficulty = this.difficulty, keepScore = false): void {
    this.level = Math.max(0, Math.min(WORLDS.length - 1, Math.floor(level)));
    this.difficulty = difficulty;
    if (!keepScore) this.score = 0;
    this.checkpoint = this.score;
    this.hearts = difficulty === 'chill' ? 5 : 3;
    this.crystals = this.combo = this.maxCombo = this.elapsed = this.stars = this.segment = this.lane = 0;
    this.previousHeight = this.jumpBuffer = 0;
    this.ducking = this.duckHeld = false; this.duckBuffer = this.lastRunPace = 0;
    this.shield = false;
    const world = WORLDS[this.level];
    this.runner.configureCourse({ speed: world.speed * (difficulty === 'chill' ? .8 : 1), spacing: world.spacing, clearance: .24 });
    this.runner.reset();
    this.phase = 'running';
    this.events = [];
    this.spawnPickups();
  }

  retry(): void { this.score = this.checkpoint; this.start(this.level, this.difficulty, true); }
  next(): void { if (this.phase === 'level-complete') this.start(this.level + 1, this.difficulty, true); }
  pause(): void { if (this.phase === 'running') { this.phase = 'paused'; this.jumpBuffer = this.duckBuffer = 0; this.duckHeld = this.ducking = false; } }
  resume(): void { if (this.phase === 'paused') this.phase = 'running'; }
  jump(strength = .8): void {
    if (this.phase !== 'running' || this.duckHeld || this.duckBuffer > 0) return;
    this.jumpBuffer = .14;
    this.bufferedStrength = Math.max(.65, Math.min(1, Number.isFinite(strength) ? strength : .8));
  }
  setDucking(held: boolean): void {
    this.duckHeld = held && this.phase === 'running';
    if (this.duckHeld) this.jumpBuffer = 0;
  }
  /** Click-only assistive activation or a downward swipe supplies a short duck. */
  duck(): void { if (this.phase === 'running') { this.duckBuffer = 1.1; this.jumpBuffer = 0; } }
  get obstacleKind(): ObstacleKind { return this.sectionKind(this.segment); }
  private sectionKind(segment: number): ObstacleKind { return DUCK_SECTIONS[this.level].includes(segment) ? 'duck' : 'jump'; }
  move(direction: number): void { if (this.phase === 'running') this.lane = Math.max(-1, Math.min(1, this.lane + Math.sign(direction))); }
  setLane(lane: number): void { if (Number.isFinite(lane)) this.lane = Math.max(-1, Math.min(1, Math.round(lane))); }
  drainEvents(): JumperEvent[] { return this.events.splice(0); }

  private sectionLane(segment: number): number { return [0, -1, 1, 0, 1, -1, 0, 0][segment % 8]; }

  private pickupPattern(segment: number): PickupPattern[] {
    // Deliberately designed patterns, never random impossible hurdles.
    const lane = this.sectionLane(segment);
    const gap = WORLDS[this.level].spacing;
    const duck = this.sectionKind(segment) === 'duck';
    const pickups: PickupPattern[] = [2, 3.1, 4.2, gap - 1.2, gap - .3].map((distance, i) => ({
      distance, lane, height: duck || i < 3 ? .25 : i === 3 ? .8 : 1.05, kind: 'crystal',
    }));
    if (segment === 2 || segment === 5) pickups.push({ distance: 5.2, lane: 0, height: .4, kind: 'shield' });
    return pickups;
  }

  private spawnPickups(): void {
    this.pickups = this.pickupPattern(this.segment).map(pickup => ({ ...pickup, id: this.nextId++, resolved: false }));
  }

  /** Read-only preview of the same authored patterns used by scoring. */
  get lookAhead(): CourseSection[] {
    if (this.phase !== 'running' && this.phase !== 'paused') return [];
    const gap = WORLDS[this.level].spacing;
    // Runner recycles a gate after it passes 1.5 units behind the player.
    const cycle = gap + 1.5;
    return Array.from({ length: Math.min(LOOK_AHEAD_SECTIONS, this.hurdleCount - this.segment) }, (_, offset) => {
      const index = this.segment + offset;
      const start = this.runner.state.obstacleDistance - gap + offset * cycle;
      return { index, kind: this.sectionKind(index), distance: this.runner.state.obstacleDistance + offset * cycle, lane: this.sectionLane(index),
        pickups: offset === 0 ? this.pickups.map((p, slot) => ({ ...p, slot })).filter(p => !p.resolved)
          : this.pickupPattern(index).map((p, slot) => ({ ...p, slot, distance: p.distance + start })),
      };
    });
  }

  update(delta: number, cameraInput?: MotionInput): void {
    if (this.phase !== 'running' || !Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(.05, delta);
    const input = cameraInput ?? this.keyboard;
    if (!input.tracked || !input.calibrated) { this.jumpBuffer = this.duckBuffer = 0; this.ducking = this.duckHeld = false; this.lastRunPace = 0; return; }
    const requestedDuck = this.duckHeld || this.duckBuffer > 0 || input.crouch;
    const wasDucking = this.ducking;
    this.ducking = requestedDuck && this.runner.state.height <= .05;
    if (this.ducking && !wasDucking) this.events.push({ type: 'duck' });
    if (requestedDuck) this.jumpBuffer = 0;
    if (!requestedDuck) this.lastRunPace = Math.max(0, Math.min(1, input.runSpeed));
    if (this.jumpBuffer > 0 && this.runner.state.height === 0 && !requestedDuck) {
      this.runner.jump(this.bufferedStrength); this.jumpBuffer = 0;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.duckBuffer = Math.max(0, this.duckBuffer - dt);
    this.elapsed += dt;
    const before = { ...this.runner.state };
    // A manual camera run keeps its approach pace during the brief duck, when
    // bent/hidden legs cannot produce alternating foot contacts.
    const game = this.runner.update(dt, { ...input, crouch: this.ducking,
      runSpeed: requestedDuck ? Math.max(input.runSpeed, this.lastRunPace) : input.runSpeed }, this.obstacleKind);
    if (this.previousHeight === 0 && game.height > 0) this.events.push({ type: 'jump' });
    if (this.previousHeight > 0 && game.height === 0) this.events.push({ type: 'land' });
    this.previousHeight = game.height;
    const travel = game.distance - before.distance;
    for (const pickup of this.pickups) {
      const previous = pickup.distance;
      pickup.distance -= travel;
      if (pickup.resolved || previous < -.25 || pickup.distance > .3) continue;
      if (pickup.distance >= -.25 && pickup.lane === this.lane && Math.abs(game.height - pickup.height) < .45) {
        pickup.resolved = true;
        if (pickup.kind === 'crystal') { this.crystals++; this.score += 25; }
        else this.shield = true;
        this.events.push({ type: pickup.kind, lane: this.lane, height: pickup.height });
      } else if (pickup.distance < -.25) pickup.resolved = true;
    }
    if (game.cleared > before.cleared) {
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      const points = 100 + Math.min(this.combo - 1, 4) * 25;
      this.score += points;
      this.events.push({ type: 'clear', value: points });
    }
    if (game.missed > before.missed) {
      this.combo = 0;
      if (this.shield) { this.shield = false; this.events.push({ type: 'shield', value: -1 }); }
      else { this.hearts--; this.events.push({ type: 'hit' }); }
      if (this.hearts <= 0) { this.phase = 'game-over'; return; }
    }
    if (game.cleared + game.missed >= this.hurdleCount) {
      this.stars = game.missed === 0 && this.crystals >= 15 ? 3 : game.missed <= 2 ? 2 : 1;
      this.score += this.stars * 250;
      this.phase = this.level === WORLDS.length - 1 ? 'victory' : 'level-complete';
      this.events.push({ type: this.phase === 'victory' ? 'finish' : 'level', value: this.stars });
      return;
    }
    if (game.obstacleDistance > before.obstacleDistance) { this.segment++; this.spawnPickups(); }
  }

  get progress(): number { return Math.min(1, (this.runner.state.cleared + this.runner.state.missed) / this.hurdleCount); }
  get speed(): number { return WORLDS[this.level].speed * (this.difficulty === 'chill' ? .8 : 1); }
}
