type Sample = { yaw: number; pitch: number };
export type HeadMotion = Sample & { yawRate: number; pitchRate: number };
export type HeadState = 'off' | 'connecting' | 'waiting' | 'denied' | 'error' | 'live';

const relativeAngle = (angle: number, neutral: number) => Math.atan2(Math.sin(angle - neutral), Math.cos(angle - neutral));
const still: HeadMotion = { yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0 };
const RECENTER_AFTER_MS = 30_000;
const STABLE_RADIUS = .07;

function rate(angle: number, gain: number, limit: number): number {
  const outsideCenter = Math.abs(angle) - .056;
  return outsideCenter > 0 ? Math.sign(angle) * Math.min(limit, outsideCenter * gain) : 0;
}

export class HeadOrientation {
  private neutral?: Sample;
  private lastTime?: number;
  private stable?: { since: number; pose: Sample; average: Sample };

  reset(): void {
    this.neutral = this.stable = undefined;
    this.lastTime = undefined;
  }

  sample(value: Sample, time = performance.now()): HeadMotion {
    this.neutral ??= value;
    const elapsed = time - (this.lastTime ?? time);
    this.lastTime = time;
    const stable = this.stable;
    if (!stable || elapsed < 0 || elapsed > 360
      || Math.hypot(relativeAngle(value.yaw, stable.pose.yaw), relativeAngle(value.pitch, stable.pose.pitch)) > STABLE_RADIUS) {
      this.stable = { since: time, pose: value, average: { ...value } };
    } else {
      const blend = 1 - Math.exp(-elapsed / 750);
      stable.average.yaw += relativeAngle(value.yaw, stable.average.yaw) * blend;
      stable.average.pitch += relativeAngle(value.pitch, stable.average.pitch) * blend;

      const activeTime = Math.min(elapsed, time - stable.since - RECENTER_AFTER_MS);
      if (activeTime > 0) {
        const follow = 1 - Math.exp(-activeTime / 10_000);
        const maxStep = activeTime * .000025;
        const adjust = (angle: number, previous: number) => {
          const step = relativeAngle(angle, previous) * follow;
          return previous + Math.max(-maxStep, Math.min(maxStep, step));
        };
        this.neutral = {
          yaw: adjust(stable.average.yaw, this.neutral.yaw),
          pitch: adjust(stable.average.pitch, this.neutral.pitch),
        };
      }
    }

    const yaw = relativeAngle(this.neutral.yaw, value.yaw);
    const pitch = relativeAngle(value.pitch, this.neutral.pitch);
    return {
      yaw, pitch,
      yawRate: rate(yaw, 2.6, 1.25),
      pitchRate: rate(pitch, 1.85, .82),
    };
  }
}

export class AirPodsLink {
  private source?: EventSource;
  private stale?: ReturnType<typeof setTimeout>;
  private readonly orientation = new HeadOrientation();
  private state: HeadState = 'off';

  constructor(private readonly onState: (state: HeadState) => void, private readonly onMotion: (motion: HeadMotion) => void) {}

  start(): void {
    if (this.source) return;
    this.neutralize();
    this.setState('connecting');
    const source = new EventSource('http://127.0.0.1:8767/events');
    this.source = source;
    source.onopen = () => {
      if (source === this.source) this.setState('waiting');
    };
    source.onerror = () => {
      if (source !== this.source) return;
      this.neutralize();
      this.setState('connecting');
    };
    source.addEventListener('status', event => {
      if (source !== this.source) return;
      const state = (event as MessageEvent).data;
      if (state === 'waiting' || state === 'denied' || state === 'error') {
        this.neutralize();
        this.setState(state);
      }
    });
    source.onmessage = ({ data }) => {
      if (source !== this.source) return;
      try {
        const sample = JSON.parse(data) as Partial<Sample> | null;
        if (!sample || typeof sample.yaw !== 'number' || typeof sample.pitch !== 'number'
          || !Number.isFinite(sample.yaw) || !Number.isFinite(sample.pitch)) return;
        this.setState('live');
        this.onMotion(this.orientation.sample({ yaw: sample.yaw, pitch: sample.pitch }));
        clearTimeout(this.stale);
        this.stale = setTimeout(() => {
          this.onMotion(still);
          this.setState('waiting');
        }, 360);
      } catch { /* An invalid event cannot steer the graph. */ }
    };
  }

  calibrate(): void {
    this.neutralize();
    if (this.state === 'live') this.setState('waiting');
  }

  stop(): void {
    this.source?.close();
    this.source = undefined;
    this.neutralize();
    this.setState('off');
  }

  private neutralize(): void {
    clearTimeout(this.stale);
    this.orientation.reset();
    this.onMotion(still);
  }

  private setState(state: HeadState): void {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }
}
