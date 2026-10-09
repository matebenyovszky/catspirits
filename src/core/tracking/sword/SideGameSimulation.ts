import { segmentDistance, sweptBladeHits } from './sweep';
import { SWORD_MAX_AGE_MS, swordToScreen, validSword, type Point2, type SwordFrame } from './types';

export type SideTarget = { id: number; active: boolean; side: 'left' | 'right'; x: number; y: number; radius: number };
export type SideGameMode = 'off' | 'dodge' | 'slice';
export type SideGameInput = { mode: SideGameMode; active: boolean; pace: number; player: Point2; aspect: number };

/** Detector/renderer independent game; fixed-size target pool and deterministic
 * alternating spawns. Only fresh, measured sword frames may award a cut. */
export class SideGameSimulation {
  readonly targets: SideTarget[] = Array.from({ length: 6 }, () => ({ id: 0, active: false, side: 'left', x: 0, y: 0, radius: .065 }));
  cleared = 0;
  missed = 0;
  paused = true;
  mode: SideGameMode = 'off';
  player: Point2 = { x: .5, y: .55 };
  private spawnIn = .8;
  private sequence = 0;
  private previousSword: SwordFrame | null = null;
  private previousTargets = new Map<number, Point2>();
  private lastTimestamp = -Infinity;

  reset(): void {
    this.targets.forEach(t => { t.active = false; });
    this.cleared = this.missed = this.sequence = 0; this.spawnIn = .8; this.paused = true;
    this.previousSword = null; this.previousTargets.clear(); this.lastTimestamp = -Infinity;
  }

  update(delta: number, input: SideGameInput): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    if (input.mode !== this.mode) { this.reset(); this.mode = input.mode; }
    const pace = Number.isFinite(input.pace) ? Math.max(0, Math.min(1.5, input.pace)) : 0;
    this.paused = input.mode === 'off' || !input.active || pace === 0;
    if (this.paused) { this.previousSword = null; this.previousTargets.clear(); this.player = { ...input.player }; return; }
    const dt = Math.min(delta, .05) * pace;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const target = this.targets.find(t => !t.active);
      if (target) {
        const id = ++this.sequence, side = id % 2 ? 'left' : 'right';
        Object.assign(target, { id, side, active: true, x: side === 'left' ? -.12 : 1.12,
          y: [.55, .4, .68, .5][(id - 1) % 4] });
      }
      this.spawnIn = 1.6;
    }
    for (const target of this.targets) {
      if (!target.active) continue;
      const old = { x: target.x, y: target.y };
      target.x += (target.side === 'left' ? 1 : -1) * .34 * dt;
      if (input.mode === 'dodge') {
        // Relative-motion sweep: neither a moving target nor a quick measured
        // lean/jump should skip the visible player collision ring.
        const relativeFrom = { x: old.x - this.player.x, y: old.y - this.player.y };
        const relativeTo = { x: target.x - input.player.x, y: target.y - input.player.y };
        if (segmentDistance({ x: 0, y: 0 }, relativeFrom, relativeTo, input.aspect) <= target.radius + .085) {
          target.active = false; this.missed++; continue;
        }
      }
      if (target.x < -.2 || target.x > 1.2) {
        target.active = false;
        if (input.mode === 'slice') this.missed++; else this.cleared++;
      }
    }
    this.player = { ...input.player };
  }

  acceptSword(measured: SwordFrame | null, nowMs: number): void {
    if (!measured || !validSword(measured, nowMs)) { this.previousSword = null; this.previousTargets.clear(); return; }
    if (measured.timestampMs <= this.lastTimestamp) return;
    this.lastTimestamp = measured.timestampMs;
    const frame = swordToScreen(measured), previous = this.previousSword;
    if (!this.paused && this.mode === 'slice' && previous
      && frame.timestampMs - previous.timestampMs <= SWORD_MAX_AGE_MS
      && Math.abs(frame.imageAspectRatio - previous.imageAspectRatio) < .01) {
      const movement = Math.max(Math.hypot((frame.base.x - previous.base.x) * frame.imageAspectRatio, frame.base.y - previous.base.y),
        Math.hypot((frame.tip.x - previous.tip.x) * frame.imageAspectRatio, frame.tip.y - previous.tip.y));
      // A stationary blade does not rack up cuts from targets passing through it.
      const speed = movement * 1000 / (frame.timestampMs - previous.timestampMs);
      if (speed >= .25) for (const target of this.targets) {
        const old = this.previousTargets.get(target.id);
        if (target.active && old && sweptBladeHits(previous, frame, old, target, target.radius + .012)) {
          target.active = false; this.cleared++;
        }
      }
    }
    this.previousSword = this.paused ? null : frame;
    this.previousTargets.clear();
    if (!this.paused) for (const target of this.targets) if (target.active) this.previousTargets.set(target.id, { x: target.x, y: target.y });
  }

  snapshot() { return { mode: this.mode, paused: this.paused, cleared: this.cleared, missed: this.missed,
    targets: this.targets.filter(t => t.active).map(t => ({ ...t })) }; }
}
