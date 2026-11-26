import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import type { HandLandmarks as Hand } from '../tracking/types';

const palmIndices = [0, 5, 9, 13, 17] as const;
type Palm = {
  x: number;
  y: number;
  logScale?: number;
  orientation?: Quaternion;
  source: 'world' | 'image';
};
type GripStep = { dx: number; dy: number; zoom: number; turn?: Quaternion };

export function measurePalm(
  hand: Pick<Hand, 'points' | 'worldPoints'>, aspect: number, screen: { width: number; height: number },
): Palm {
  const { points, worldPoints } = hand;
  const worldIsValid = worldPoints?.length === 21 && palmIndices.every(index => {
    const { x, y, z } = worldPoints[index];
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
  });
  const landmarks = worldIsValid ? worldPoints : points;
  const ratio = worldIsValid ? 1 : aspect;
  // Mirror to the preview and convert to camera coordinates (x right, y up, z toward the viewer).
  const palm = palmIndices.map(index => {
    const { x, y, z } = landmarks[index];
    return new Vector3(-x * ratio, -y, Number.isFinite(z) ? -z * ratio : 0);
  });
  const forward = palm[2].clone().sub(palm[0]);
  const across = palm[1].clone().sub(palm[4]);
  const normal = across.clone().cross(forward);
  let orientation: Quaternion | undefined;
  if (forward.lengthSq() > .0001 && across.lengthSq() > .0001 && normal.lengthSq() > .07 * forward.lengthSq() * across.lengthSq()) {
    across.normalize();
    normal.normalize();
    forward.crossVectors(normal, across);
    orientation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, forward, normal));
  }

  let imageEnergy = 0, modelEnergy = 0;
  for (let i = 0; i < palmIndices.length; i++) {
    for (let j = i + 1; j < palmIndices.length; j++) {
      if (worldIsValid) {
        const a = points[palmIndices[i]], b = points[palmIndices[j]];
        imageEnergy += ((a.x - b.x) * aspect) ** 2 + (a.y - b.y) ** 2;
        modelEnergy += (palm[i].x - palm[j].x) ** 2 + (palm[i].y - palm[j].y) ** 2;
      } else {
        imageEnergy += palm[i].distanceToSquared(palm[j]);
        modelEnergy += 1;
      }
    }
  }
  // The ratio of the two projected palms cancels most foreshortening from wrist turns.
  // Both landmark sets are hand-relative, so the scale is only a relative depth cue.
  const scale = modelEnergy > .0006 ? Math.sqrt(imageEnergy / modelEnergy) : 0;
  const wrist = points[0];
  return {
    x: ((1 - wrist.x - .16) / .68) * screen.width,
    y: ((wrist.y - .12) / .72) * screen.height,
    logScale: scale > .012 && Number.isFinite(scale) ? Math.log(scale) : undefined,
    orientation,
    source: worldIsValid ? 'world' : 'image',
  };
}

export class SpatialGrip {
  private filtered?: Palm;
  private applied?: Palm;
  private rawRotation?: Quaternion;
  private start = 0;
  private last = 0;
  private active = false;

  get moved(): boolean { return this.active; }

  reset(): void {
    this.filtered = this.applied = undefined;
    this.rawRotation = undefined;
    this.active = false;
  }

  update(palm: Palm, time: number): GripStep | undefined {
    const dt = time - this.last;
    if (!this.applied || dt > 160 || this.filtered?.source !== palm.source) {
      if (!this.applied) this.start = time;
      this.filtered = palm;
      this.applied = { ...palm };
      this.rawRotation = palm.orientation;
      this.last = time;
      return;
    }
    if (dt <= 0) return;
    this.last = time;
    const previous = this.filtered;
    const applied = this.applied;
    const blend = 1 - Math.exp(-dt / 52);
    const x = MathUtils.lerp(previous.x, palm.x, blend);
    const y = MathUtils.lerp(previous.y, palm.y, blend);

    const logScale = palm.logScale === undefined ? undefined : MathUtils.lerp(previous.logScale ?? palm.logScale, palm.logScale, blend);
    if (logScale === undefined || applied.logScale === undefined) applied.logScale = logScale;
    let orientation = palm.orientation;
    const discontinuity = orientation && this.rawRotation && this.rawRotation.angleTo(orientation) > 1.22;
    if (orientation && previous.orientation && !discontinuity) {
      orientation = previous.orientation.clone().slerp(orientation, blend);
    } else {
      // Rebase the rotation across an occlusion or a single implausible pose jump.
      applied.orientation = orientation;
    }
    this.rawRotation = palm.orientation;
    this.filtered = { ...palm, x, y, logScale, orientation };

    const pixels = Math.hypot(x - applied.x, y - applied.y);
    const depth = logScale === undefined || applied.logScale === undefined ? 0 : logScale - applied.logScale;
    const angle = orientation && applied.orientation ? applied.orientation.angleTo(orientation) : 0;
    if (!this.active) {
      if (time - this.start < 155 || (pixels < 15 && Math.abs(depth) < .055 && angle < .115)) return;
      this.active = true;
    }
    let turn: Quaternion | undefined;
    if (angle >= .024 && orientation && applied.orientation) {
      const next = applied.orientation.clone().rotateTowards(orientation, Math.min(.23, dt * .005));
      turn = next.clone().multiply(applied.orientation.clone().invert());
      applied.orientation = next;
    }
    let dx = 0, dy = 0;
    if (pixels >= 2) {
      const share = Math.min(1, 58 / pixels);
      dx = (x - applied.x) * share;
      dy = (y - applied.y) * share;
      applied.x += dx;
      applied.y += dy;
    }
    const change = Math.abs(depth) >= .012 ? MathUtils.clamp(depth, -.17, .17) : 0;
    if (change && applied.logScale !== undefined) applied.logScale += change;
    return { dx, dy, zoom: Math.exp(change * .88), turn };
  }
}
