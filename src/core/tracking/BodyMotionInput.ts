import { emptyMotionInput, type MotionInput, type PoseFrame, type PoseLandmark } from "./types";

const CALIBRATION_MS = 1000;
const MAX_FRAME_GAP_MS = 600;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
type Pair = [number, number];
type Sample = {
  time: number; hipX: number; hipY: number; shoulderY: number;
  leftShoulderY: number; rightShoulderY: number; torso: number; shoulderSpan: number;
  knees: Pair | null; ankles: Pair | null; feet: Pair | null;
};
export type GestureDiagnostics = {
  reason: string;
  legSource: "ankles" | "knees" | "none";
  stepSignal: number;
  steps: number;
  jumpPhase: "grounded" | "airborne";
  rise: number;
  upwardSpeed: number;
  jumpStrength: number;
  jumpSource: "feet+torso" | "torso" | "none";
};

function visible(point: PoseLandmark | undefined, threshold: number): point is PoseLandmark {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.visibility ?? 1) && (point.visibility ?? 1) >= threshold
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function measure(frame: PoseFrame): Sample | null {
  const p = frame.landmarks;
  // A hidden foot must not reset calibration or suppress a shoulder/hip jump.
  if (![11, 12, 23, 24].every(i => visible(p[i], 0.5))) return null;
  const hipX = (p[23].x + p[24].x) / 2, hipY = (p[23].y + p[24].y) / 2;
  const shoulderY = (p[11].y + p[12].y) / 2;
  const aspect = Number.isFinite(frame.imageAspectRatio) && frame.imageAspectRatio! > 0 ? frame.imageAspectRatio! : 1;
  const torso = Math.hypot(((p[11].x + p[12].x) / 2 - hipX) * aspect, hipY - shoulderY);
  if (torso < 0.065 || hipY - shoulderY < 0.045) return null;
  const pair = (index: number): Pair | null => [index, index + 1].every(i => visible(p[i], 0.35))
    ? [(p[index].y - p[23].y) / torso, (p[index + 1].y - p[24].y) / torso] : null;
  const ankles = pair(27);
  return { time: frame.timestampMs, hipX, hipY, shoulderY, leftShoulderY: p[11].y,
    rightShoulderY: p[12].y, torso, shoulderSpan: Math.abs(p[11].x-p[12].x)*aspect, knees: pair(25), ankles,
    feet: ankles ? [p[27].y, p[28].y] : null };
}

function kneeAngle(p: PoseLandmark[], side: number): number {
  const hip = p[23 + side], knee = p[25 + side], ankle = p[27 + side];
  const length = Math.hypot(hip.x - knee.x, hip.y - knee.y) * Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
  if (length < 1e-6) return 0;
  return Math.acos(clamp(((hip.x - knee.x) * (ankle.x - knee.x) + (hip.y - knee.y) * (ankle.y - knee.y)) / length, -1, 1)) * 180 / Math.PI;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Temporal gestures, normalized by current torso size, not absolute screen Y. */
export class BodyMotionInput {
  private baseline: Sample | null = null;
  private calibration: Sample[] = [];
  private history: Sample[] = [];
  private previousTimestamp: number | null = null;
  private lastInput = emptyMotionInput();
  private speed = 0;
  private lane = 0;
  private airborne = false;
  private lastJumpAt = -Infinity;
  private previousStep: { side: number; time: number } | null = null;
  private stepIntervals: number[] = [];
  private cadenceSpm = 0;
  private lastAlternatingAt = -Infinity;
  private lastLegAt = -Infinity;
  private recovering = false;
  private diagnostic: GestureDiagnostics = this.emptyDiagnostics();

  constructor(private readonly response: 'standard' | 'quick' = 'standard', private readonly crouchMode: 'legs' | 'torso' = 'legs') {}

  diagnostics(): GestureDiagnostics { return { ...this.diagnostic }; }

  private emptyDiagnostics(): GestureDiagnostics {
    return { reason: "A vállak és a csípő legyenek láthatók.", legSource: "none", stepSignal: 0,
      steps: 0, jumpPhase: "grounded", rise: 0, upwardSpeed: 0, jumpStrength: 0, jumpSource: "none" };
  }

  reset(): void {
    this.baseline = null;
    this.calibration = [];
    this.history = [];
    this.previousTimestamp = null;
    this.lastInput = emptyMotionInput();
    this.speed = this.lane = 0;
    this.airborne = this.recovering = false;
    this.lastJumpAt = this.lastAlternatingAt = this.lastLegAt = -Infinity;
    this.previousStep = null;
    this.stepIntervals = [];
    this.cadenceSpm = 0;
    this.diagnostic = this.emptyDiagnostics();
  }

  lost(): MotionInput { this.reset(); return emptyMotionInput(); }

  update(frame: PoseFrame): MotionInput {
    if (!Number.isFinite(frame.timestampMs)) return this.lost();
    // Duplicate samples are not new events and must not erase calibration.
    if (this.previousTimestamp !== null && frame.timestampMs <= this.previousTimestamp) {
      return { ...this.lastInput, jump: false };
    }
    const sample = measure(frame);
    if (!sample) {
      if (this.baseline && this.previousTimestamp !== null && frame.timestampMs - this.previousTimestamp <= MAX_FRAME_GAP_MS) {
        this.recovering = true;
        this.speed = 0;
        this.history = [];
        this.previousStep = null;
        this.stepIntervals = [];
        this.diagnostic.reason = "A váll vagy csípő kitakarva; a pálya szünetel.";
        return { ...emptyMotionInput(), calibrated: true, calibrationProgress: 1 };
      }
      return this.lost();
    }
    if (this.previousTimestamp !== null && sample.time - this.previousTimestamp > MAX_FRAME_GAP_MS) this.reset();
    const dt = this.previousTimestamp === null ? 0 : sample.time - this.previousTimestamp;
    this.previousTimestamp = sample.time;
    this.history.push(sample);
    this.history = this.history.filter(item => sample.time - item.time <= 450);
    if (!this.baseline) {
      this.lastInput = this.calibrate(frame, sample);
      return { ...this.lastInput };
    }

    const base = this.baseline;
    // Moving closer to the camera or lower in the image is NOT a squat.
    const legCrouch = !!sample.ankles && !!base.ankles
      && Math.max(...sample.ankles) < Math.max(...base.ankles) * 0.78
      && sample.hipY > base.hipY + sample.torso * 0.08;
    const hipDrop = (sample.hipY-base.hipY)/base.torso;
    const shoulderDrop = (sample.shoulderY-base.shoulderY)/base.torso;
    const widthRatio = sample.shoulderSpan/base.shoulderSpan;
    const torsoRatio = sample.torso/base.torso;
    // A forward bend shortens the torso relative to shoulder width. Moving
    // toward/away from the lens scales both together and must not duck.
    const torsoCrouch = this.crouchMode === 'torso' && base.shoulderSpan > base.torso*.25
      && sample.shoulderSpan > sample.torso*.25 && widthRatio > .75 && widthRatio < 1.25
      && ((torsoRatio/widthRatio < .72 && torsoRatio/widthRatio > .4 && shoulderDrop > .25 && hipDrop > -.08)
        || (hipDrop > .22 && shoulderDrop > .22 && Math.abs(widthRatio-1) < .12 && Math.abs(torsoRatio-1) < .2));
    const crouch = legCrouch || torsoCrouch;
    const jump = this.detectJump(sample, crouch);
    const runAvailable = !!sample.ankles || !!sample.knees;
    const cadenceSpm = this.detectSteps(sample, crouch, dt);
    const targetLane = clamp((base.hipX - sample.hipX) / (sample.torso * 0.95), -1, 1);
    this.lane += (targetLane - this.lane) * -Math.expm1(-dt / (this.response === 'quick' ? 45 : 100));

    // Follow slow framing/scale changes while grounded, not a take-off or squat.
    if (!this.airborne && !crouch && this.diagnostic.upwardSpeed < 0.25) {
      const alpha = -Math.expm1(-dt / 550);
      for (const key of ["hipY", "shoulderY", "leftShoulderY", "rightShoulderY", "torso", "shoulderSpan"] as const) base[key] += (sample[key] - base[key]) * alpha;
      if (sample.feet && base.feet) base.feet = sample.feet.map((v, i) => base.feet![i] + (v - base.feet![i]) * alpha) as Pair;
    }
    // Legs may enter the frame after a torso-only calibration.
    if (!base.knees && sample.knees) base.knees = [...sample.knees];
    if (!base.ankles && sample.ankles) { base.ankles = [...sample.ankles]; base.feet = sample.feet ? [...sample.feet] : null; }
    this.recovering = false;
    this.diagnostic.jumpPhase = this.airborne ? "airborne" : "grounded";
    this.diagnostic.reason = crouch ? this.crouchMode === 'torso' ? "Lehajolás érzékelve." : "Guggolás: az előrehaladás szünetel."
      : !runAvailable ? "Ugrásra kész. Futáshoz a két térd vagy a két boka legyen látható."
      : this.speed > 0.02 ? "Futás érzékelve; a pálya halad."
      : this.previousStep ? "Az egyik lábemelést látom; most emeld a másik lábad."
      : "Készen állsz: válts bal és jobb lábemelés között, vagy ugorj.";
    this.lastInput = { tracked: true, calibrated: true, calibrationProgress: 1, runAvailable,
      runSpeed: this.speed, cadenceSpm, jump, jumpStrength: jump ? this.diagnostic.jumpStrength : 0,
      crouch, lane: this.lane };
    return { ...this.lastInput };
  }

  private detectJump(sample: Sample, crouch: boolean): boolean {
    const base = this.baseline!;
    // Arcade take-off uses a shorter window; both modes require coherent torso motion.
    // Sparse camera results need the original small-hop thresholds.
    const quick = this.response === 'quick' && this.history.length > 1
      && sample.time - this.history[this.history.length - 2].time <= 100;
    const previous = [...this.history].reverse().find(item => sample.time - item.time >= (quick ? 60 : 90)) ?? this.history[0];
    const elapsed = (sample.time - previous.time) / 1000;
    const rise = Math.min(previous.hipY - sample.hipY,
      previous.leftShoulderY - sample.leftShoulderY, previous.rightShoulderY - sample.rightShoulderY) / previous.torso;
    const speed = elapsed > 0 ? rise / elapsed : 0;
    const height = Math.min(base.hipY - sample.hipY, base.shoulderY - sample.shoulderY) / base.torso;
    this.diagnostic.rise = rise;
    this.diagnostic.upwardSpeed = speed;
    if (!this.airborne) {
      this.diagnostic.jumpStrength = 0;
      this.diagnostic.jumpSource = "none";
    }
    if (height < 0.07 && speed < -0.3) this.history = [sample];
    if (this.airborne) {
      if (sample.time - this.lastJumpAt > 350 && height < 0.07 && speed < 0.3) {
        this.airborne = false;
        this.history = [sample]; // a fresh launch must not compare to the previous apex
        // Do not fold the time spent in the air into the next step interval.
        // Keep the measured cadence briefly so the first landing steps can take over smoothly.
        this.previousStep = null;
        this.lastAlternatingAt = sample.time;
      }
      // Repositioning after a jump must not leave the input permanently disarmed.
      if (sample.time - this.lastJumpAt > 1800 && Math.abs(speed) < 0.15 && !crouch) {
        this.airborne = false;
        base.hipY = sample.hipY; base.shoulderY = sample.shoulderY;
      }
      return false;
    }
    if (this.recovering || crouch || elapsed <= 0 || sample.time - this.lastJumpAt < 650) return false;
    const stableScale = Math.abs(sample.torso / previous.torso - 1) < 0.18;
    const footRise = previous.feet && sample.feet
      ? Math.min(previous.feet[0] - sample.feet[0], previous.feet[1] - sample.feet[1]) / previous.torso : 0;
    // Shoulders AND hips drive take-off. Rising feet strengthen evidence, but
    // are not mandatory: occluded/temporally flattened ankles are common.
    const feetConfirmed = footRise > 0.035 && rise > (quick ? 0.065 : 0.075) && height > (quick ? 0.08 : 0.10) && speed > (quick ? 0.7 : 0.5);
    const torsoConfirmed = rise > (quick ? 0.14 : 0.16) && height > (quick ? 0.14 : 0.16) && speed > (quick ? 1 : 0.85);
    if (!stableScale || (!feetConfirmed && !torsoConfirmed)) return false;
    this.airborne = true;
    this.lastJumpAt = sample.time;
    const heightScore = clamp((height - 0.08) / 0.42);
    const speedScore = clamp((speed - 0.45) / 3.2);
    this.diagnostic.jumpStrength = clamp(0.15 + heightScore * 0.55 + speedScore * 0.3, 0.2, 1);
    this.diagnostic.jumpSource = feetConfirmed ? "feet+torso" : "torso";
    return true;
  }

  private detectSteps(sample: Sample, crouch: boolean, dt: number): number {
    const base = this.baseline!;
    // SAME-FRAME leg differences still cross zero with bent knees in a run.
    const signal = (pair: Pair | null, rest: Pair | null, threshold: number) => pair
      ? ((pair[1] - pair[0]) - (rest ? rest[1] - rest[0] : 0)) / threshold : 0;
    const ankleSignal = signal(sample.ankles, base.ankles, 0.07);
    const kneeSignal = signal(sample.knees, base.knees, 0.10);
    const useAnkles = !!sample.ankles && (!sample.knees || Math.abs(ankleSignal) >= Math.abs(kneeSignal));
    const stride = useAnkles ? ankleSignal : kneeSignal;
    this.diagnostic.legSource = useAnkles ? "ankles" : sample.knees ? "knees" : "none";
    this.diagnostic.stepSignal = stride;
    if (sample.ankles || sample.knees) this.lastLegAt = sample.time;
    // During a jump there cannot be a trustworthy left/right contact event.
    // Preserve the take-off cadence instead of decaying the course to a stop.
    if (this.airborne) return this.cadenceSpm;
    const side = stride > 1 ? 0 : stride < -1 ? 1 : null;
    if (!this.recovering && !crouch && !this.airborne && side !== null
      && side !== this.previousStep?.side) {
      const interval = this.previousStep ? sample.time - this.previousStep.time : Infinity;
      if (interval >= 180) {
        if (interval <= 2200) {
          this.stepIntervals.push(interval);
          if (this.stepIntervals.length > 3) this.stepIntervals.shift();
          this.lastAlternatingAt = sample.time;
        } else this.stepIntervals = [];
        this.previousStep = { side, time: sample.time };
        this.diagnostic.steps++;
      }
    }
    // Only the last three contacts are retained: responsive enough for a pace
    // change, while averaging detector/frame-rate quantisation (for example
    // alternating 300/350 ms observations for a real 333 ms interval).
    const meanInterval = this.stepIntervals.length
      ? this.stepIntervals.reduce((sum, value) => sum + value, 0) / this.stepIntervals.length : 0;
    const measuredCadence = meanInterval ? 60000 / meanInterval : 0;
    const interval = measuredCadence ? 60000 / measuredCadence : 0;
    const overdue = sample.time - this.lastAlternatingAt - clamp(interval * 1.6, 400, 1600);
    let cadence = measuredCadence * Math.exp(-Math.max(0, overdue) / 500);
    if (sample.time - this.lastLegAt > 300 || crouch) cadence = 0;
    const target = clamp(cadence / 240);
    const responseMs = target > this.speed ? 90 : 360;
    this.speed += (target - this.speed) * -Math.expm1(-dt / responseMs);
    if (this.speed < 0.01 && target < 0.01) this.speed = 0;
    if (overdue > 1800) this.stepIntervals = [];
    this.cadenceSpm = this.speed === 0 ? 0 : cadence;
    return this.cadenceSpm;
  }

  private calibrate(frame: PoseFrame, sample: Sample): MotionInput {
    // Reject a clear deep squat, not normal knee flexion or an occluded ankle.
    if (sample.knees && sample.ankles && kneeAngle(frame.landmarks, 0) < 125 && kneeAngle(frame.landmarks, 1) < 125) {
      this.calibration = [];
      this.diagnostic.reason = "Kalibráláshoz egyenesedj fel egy pillanatra.";
      return { ...emptyMotionInput(), tracked: true };
    }
    this.calibration.push(sample);
    this.calibration = this.calibration.filter(item => sample.time - item.time <= 1400);
    // Torso medians tolerate foot jitter and preparatory motion. A major framing
    // change starts a new reference window; losing an ankle does not.
    const anchor = this.calibration[0];
    if (Math.abs(sample.hipY - anchor.hipY) > sample.torso * 0.35 || Math.abs(sample.torso / anchor.torso - 1) > 0.3) this.calibration = [sample];
    const progress = clamp((sample.time - this.calibration[0].time) / CALIBRATION_MS);
    if (progress >= 1 && this.calibration.length >= 5) {
      this.baseline = { ...sample, knees: sample.knees ? [...sample.knees] : null,
        ankles: sample.ankles ? [...sample.ankles] : null, feet: sample.feet ? [...sample.feet] : null };
      for (const key of ["hipX", "hipY", "shoulderY", "leftShoulderY", "rightShoulderY", "torso", "shoulderSpan"] as const) {
        this.baseline[key] = median(this.calibration.map(item => item[key]));
      }
      for (const key of ["knees", "ankles", "feet"] as const) {
        const pairs = this.calibration.flatMap(item => item[key] ? [item[key]!] : []);
        if (pairs.length) this.baseline[key] = [median(pairs.map(p => p[0])), median(pairs.map(p => p[1]))];
      }
      this.calibration = [];
    }
    this.diagnostic.reason = this.baseline ? "Kalibrálva; kezdheted a mozgást." : "Testarányok felvétele… " + Math.round(progress * 100) + "%";
    return { ...emptyMotionInput(), tracked: true, calibrated: !!this.baseline, calibrationProgress: progress };
  }
}
