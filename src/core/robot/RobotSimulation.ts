/** Normalized planar arm with a bounded vertical gripper axis. No network or hardware access.
 * A future robot adapter must supply its own calibrated limits and safety loop. */
export type Point = { x: number; y: number };
export type Cell = Point & { id: number; dock: Point; delivered: boolean; height: number };
export type Obstacle = Point & { width: number; height: number };
export type RobotMode = 'manual' | 'auto';
export type RobotLevel = 1 | 2;
export type RobotObservation = {
  tool: Point; lift: number; cells: readonly Cell[]; holding: number | null;
  obstacles: readonly Obstacle[]; complete: boolean;
};
export type RobotCommand = { target: Point; grip?: 'open' | 'closed' };
export interface RobotController { command(observation: RobotObservation): RobotCommand | null }
export const BASE = { x: .5, y: .92 };
export const LINKS = [.42, .38] as const;
export const TOOL_RADIUS = .025;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));

export function reachable(point: Point): Point {
  let x = clamp(point.x, .10, .90), y = clamp(point.y, .17, .78);
  const d = distance({ x, y }, BASE), maximum = LINKS[0] + LINKS[1] - .005;
  if (d > maximum) { x = BASE.x + (x - BASE.x) * maximum / d; y = BASE.y + (y - BASE.y) * maximum / d; }
  return { x, y };
}
export function elbowFor(tool: Point): Point {
  const dx = tool.x - BASE.x, dy = tool.y - BASE.y, d = distance(tool, BASE);
  const angle = Math.atan2(dy, dx) - Math.acos(clamp((LINKS[0] ** 2 + d ** 2 - LINKS[1] ** 2) / (2 * LINKS[0] * d), -1, 1));
  return { x: BASE.x + Math.cos(angle) * LINKS[0], y: BASE.y + Math.sin(angle) * LINKS[0] };
}
/** Deliberately conservative baseline: direct approach, stop at a shield.
 * It observes current state after every handover; it does not learn or replay. */
export class DirectController implements RobotController {
  command(o: RobotObservation): RobotCommand | null {
    const cell = o.cells.find(c => c.id === o.holding) ?? o.cells.find(c => !c.delivered);
    if (!cell || o.complete) return null;
    const target = o.holding === null ? { x: cell.x, y: cell.y } : cell.dock;
    return { target, ...(distance(o.tool, target) < .025 ? { grip: o.holding === null ? 'closed' as const : 'open' as const } : {}) };
  }
}

export class RobotSimulation {
  tool: Point = { x: .5, y: .74 };
  target: Point = { ...this.tool };
  cells: Cell[] = [];
  obstacles: Obstacle[] = [];
  holding: number | null = null;
  lift = 0;
  private depthTarget: number | null = null;
  private landingAuto = new Set<number>();
  mode: RobotMode = 'manual';
  level: RobotLevel = 1;
  elapsed = 0;
  takeovers = 0;
  autoDeliveries = 0;
  blocked = false;
  dwell = 0;
  private stall = 0;
  private gripCooldown = 0;
  private dwellId = '';
  constructor(private controller: RobotController = new DirectController()) { this.reset(1); }
  get delivered(): number { return this.cells.filter(c => c.delivered).length; }
  get complete(): boolean { return this.delivered === this.cells.length; }
  observation(): RobotObservation {
    return { tool: { ...this.tool }, lift: this.lift, cells: this.cells.map(c => ({ ...c, dock: { ...c.dock } })), holding: this.holding,
      obstacles: this.obstacles.map(o => ({ ...o })), complete: this.complete };
  }
  reset(level: RobotLevel): void {
    this.level = level; this.tool = { x: .5, y: .74 }; this.target = { ...this.tool };
    this.cells = [.30, .46, .62].map((y, id) => ({ id, x: .23, y, dock: { x: .77, y }, delivered: false, height: 0 }));
    this.obstacles = level === 2 ? [{ x: .46, y: .29, width: .08, height: .30 }] : [];
    this.mode = 'manual'; this.holding = null; this.lift = 0; this.depthTarget = null; this.landingAuto.clear(); this.elapsed = this.takeovers = this.autoDeliveries = this.stall = this.dwell = this.gripCooldown = 0;
    this.blocked = false; this.dwellId = '';
  }
  setMode(mode: RobotMode): void {
    if (mode === this.mode || this.complete) return;
    if (mode === 'manual') this.takeovers++;
    this.mode = mode; this.stop();
  }
  /** Flush stale targets whenever input ownership changes or tracking is lost. */
  stop(): void { this.target = { ...this.tool }; this.dwell = this.stall = 0; this.blocked = false; this.dwellId = ''; }
  aim(point: Point): void {
    if (this.mode !== 'manual' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    this.target = reachable(point);
  }
  setDepth(height: number | null): void { this.depthTarget = height === null ? null : Number.isFinite(height) ? clamp(height, 0, .12) : this.depthTarget; }
  /** Idempotent gesture command: repeated closed frames never toggle/release. */
  setGripper(command: 'open' | 'closed'): void {
    if (command === 'closed' ? this.holding === null : this.holding !== null) this.grip();
  }
  private collision(point: Point): boolean {
    return this.obstacles.some(o => point.x > o.x - TOOL_RADIUS && point.x < o.x + o.width + TOOL_RADIUS
      && point.y > o.y - TOOL_RADIUS && point.y < o.y + o.height + TOOL_RADIUS);
  }
  grip(): void {
    if (this.complete || this.gripCooldown > 0) return;
    const held = this.cells.find(c => c.id === this.holding);
    if (held) {
      if (distance(this.tool, held.dock) < .065) {
        held.x = held.dock.x; held.y = held.dock.y;
        if (this.mode === 'auto') this.landingAuto.add(held.id);
      }
      this.holding = null;
    } else {
      if (this.lift > .015) return;
      const cell = this.cells.find(c => !c.delivered && c.height <= .005 && distance(this.tool, c) < .055);
      if (!cell) return;
      this.holding = cell.id; cell.x = this.tool.x; cell.y = this.tool.y;
    }
    this.gripCooldown = .45; this.dwell = 0; this.dwellId = '';
  }
  step(seconds: number, inputAvailable = true, dwellEnabled = true): void {
    if (this.complete || !Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(seconds, .05);
    if (this.mode === 'manual' && !inputAvailable) { this.stop(); return; }
    this.elapsed += dt; this.gripCooldown = Math.max(0, this.gripCooldown - dt);
    if (this.mode === 'auto') {
      const command = this.controller.command(this.observation());
      if (!command || !Number.isFinite(command.target.x) || !Number.isFinite(command.target.y)) { this.stop(); return; }
      this.target = reachable(command.target);
      if ((command.grip === 'closed' && this.holding === null) || (command.grip === 'open' && this.holding !== null)) this.grip();
    }
    const targetLift = this.mode === 'manual' && this.depthTarget !== null ? this.depthTarget : this.holding === null ? 0 : .06;
    this.lift += clamp(targetLift - this.lift, -dt * .18, dt * .18);
    for (const cell of this.cells) if (cell.id !== this.holding && !cell.delivered) {
      cell.height = Math.max(0, cell.height - dt * .18);
      if (cell.height === 0 && distance(cell, cell.dock) < .065) {
        cell.x = cell.dock.x; cell.y = cell.dock.y; cell.delivered = true;
        if (this.landingAuto.delete(cell.id)) this.autoDeliveries++;
      }
    }
    const d = distance(this.tool, this.target), travel = Math.min(d, dt * .38);
    let collided = false;
    if (d > .0001) {
      const from = { ...this.tool }, steps = Math.max(1, Math.ceil(travel / .004));
      for (let i = 1; i <= steps; i++) {
        const next = { x: from.x + (this.target.x - from.x) / d * travel * i / steps, y: from.y + (this.target.y - from.y) / d * travel * i / steps };
        if (this.collision(next)) { collided = true; break; }
        this.tool = next;
      }
    }
    this.stall = collided ? this.stall + dt : 0; this.blocked = this.stall >= .45;
    const held = this.cells.find(c => c.id === this.holding);
    if (held) { held.x = this.tool.x; held.y = this.tool.y; held.height = this.lift; }
    if (this.mode === 'manual' && dwellEnabled) {
      const pick = this.cells.find(c => !c.delivered && distance(this.tool, c) < .045);
      const candidate = held ? distance(this.tool, held.dock) < .05 ? `dock-${held.id}` : '' : pick ? `cell-${pick.id}` : '';
      if (candidate !== this.dwellId) this.dwell = 0;
      this.dwellId = candidate;
      this.dwell = candidate && this.gripCooldown === 0 ? this.dwell + dt : 0;
      if (this.dwell >= .65) this.grip();
    } else { this.dwell = 0; this.dwellId = ''; }
  }
}
