import type { MotionInput } from './types';
export const DUCK_GATE_HALF_DEPTH = .6;

export type RunnerState = {
  distance: number; cleared: number; missed: number; height: number;
  companionHeight: number; obstacleDistance: number; paused: boolean;
};

/** Small deterministic game loop. No camera, renderer or AI dependencies. */
export class RunnerSimulation {
  private course = { speed: 3.5, spacing: 7, clearance: 0.24 };
  private velocity = 0;
  private companionVelocity = 0;
  private pendingJump = false;
  private pendingJumpStrength = 0;
  private airborneMomentum = 0;
  private landingMomentumSeconds = 0;
  private obstacleResolved = false;
  private duckUnsafe = false;
  readonly state: RunnerState = {
    distance: 0, cleared: 0, missed: 0, height: 0,
    companionHeight: 0, obstacleDistance: 7, paused: true
  };

  jump(strength = 0.5): void {
    this.pendingJump = true;
    this.pendingJumpStrength = Math.max(this.pendingJumpStrength, Math.max(0, Math.min(1, strength)));
  }

  /** Arcade shells can tune the course; camera playground keeps the original defaults. */
  configureCourse(options: Partial<typeof this.course>): void {
    for (const key of ['speed', 'spacing', 'clearance'] as const) {
      const value = options[key];
      if (value !== undefined && Number.isFinite(value)) {
        this.course[key] = Math.max(key === 'spacing' ? 4 : 0.1, Math.min(key === 'speed' ? 8 : 12, value));
      }
    }
  }

  reset(): void {
    this.velocity = this.companionVelocity = 0;
    this.airborneMomentum = this.landingMomentumSeconds = 0;
    this.pendingJump = this.obstacleResolved = false;
    this.duckUnsafe = false;
    this.pendingJumpStrength = 0;
    Object.assign(this.state, { distance: 0, cleared: 0, missed: 0, height: 0,
      companionHeight: 0, obstacleDistance: this.course.spacing, paused: true });
  }

  update(delta: number, input: MotionInput, obstacle: 'jump' | 'duck' = 'jump'): RunnerState {
    const dt = Math.max(0, Math.min(0.05, delta));
    const s = this.state;
    s.paused = !input.tracked || !input.calibrated;
    const requestedPace = s.paused ? 0 : Math.max(0, Math.min(1, input.runSpeed));
    const wasAirborne = s.height > 0 || this.velocity !== 0;
    if (!s.paused && this.pendingJump && s.height === 0) {
      // A small hop still clears the gameplay threshold, while a visibly higher
      // take-off produces a clearly higher arc.
      this.velocity = 2.7 + this.pendingJumpStrength * 2.4;
      this.airborneMomentum = Math.max(this.airborneMomentum, requestedPace);
      this.landingMomentumSeconds = 0;
    }
    this.pendingJump = false;
    this.pendingJumpStrength = 0;
    if (this.velocity !== 0 || s.height > 0) {
      s.height = Math.max(0, s.height + this.velocity * dt - 4.9 * dt * dt);
      this.velocity = s.height > 0 ? this.velocity - 9.8 * dt : 0;
    }
    const airborne = s.height > 0;
    if (wasAirborne && !airborne) this.landingMomentumSeconds = 0.5;
    let pace = requestedPace;
    if (airborne) {
      this.airborneMomentum = Math.max(this.airborneMomentum, requestedPace);
      pace = Math.max(pace, this.airborneMomentum);
    } else if (this.landingMomentumSeconds > 0) {
      pace = Math.max(pace, this.airborneMomentum * this.landingMomentumSeconds / 0.5);
      this.landingMomentumSeconds = Math.max(0, this.landingMomentumSeconds - dt);
    } else {
      this.airborneMomentum = requestedPace;
    }
    const speed = s.paused ? 0 : pace * this.course.speed;
    // Local companion timing keeps gameplay responsive; conversational AI still owns its bones.
    // Aim for the jump's apex at the collision plane, including at a slow walking pace.
    // A stationary player must not cause repeated companion jumps beside the same hurdle.
    if (obstacle === 'jump' && speed > 0 && s.obstacleDistance > 0.28 && s.obstacleDistance < 0.28 + speed * 0.35
      && s.companionHeight === 0 && !this.obstacleResolved) this.companionVelocity = 3.8;
    if (this.companionVelocity !== 0 || s.companionHeight > 0) {
      s.companionHeight = Math.max(0, s.companionHeight + this.companionVelocity * dt - 4.9 * dt * dt);
      this.companionVelocity = s.companionHeight > 0 ? this.companionVelocity - 9.8 * dt : 0;
    }
    // Losing the feet during a real jump must not leave either avatar floating.
    // Finish gravity, but pause the course and discard new game events.
    if (s.paused) return { ...s };
    s.distance += speed * dt;
    const previous = s.obstacleDistance;
    s.obstacleDistance -= speed * dt;
    if (obstacle === 'duck' && !this.obstacleResolved && previous > -DUCK_GATE_HALF_DEPTH
      && s.obstacleDistance <= DUCK_GATE_HALF_DEPTH) {
      // Stay low through the whole beam, not just one sampled collision plane.
      this.duckUnsafe ||= !input.crouch || s.height > .05;
      if (s.obstacleDistance <= -DUCK_GATE_HALF_DEPTH) {
        this.obstacleResolved = true;
        if (this.duckUnsafe) s.missed += 1; else s.cleared += 1;
      }
    } else if (obstacle === 'jump' && !this.obstacleResolved && previous > 0.28 && s.obstacleDistance <= 0.28) {
      this.obstacleResolved = true;
      if (s.height >= this.course.clearance) s.cleared += 1;
      else s.missed += 1;
    }
    if (s.obstacleDistance < -1.5) {
      s.obstacleDistance = this.course.spacing;
      this.obstacleResolved = false;
      this.duckUnsafe = false;
    }
    return { ...s };
  }
}
