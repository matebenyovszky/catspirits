import type { PoseFrame } from '../tracking/types';
export type ArmDirection = { x: number; y: number; z: number };
/** Associate a visible body wrist with the actually tracked hand. Handedness
 * labels are not assumed to match body labels for unmirrored camera pixels. */
export class RobotArmInput {
  private side: 0 | 1 | null = null;
  private stamp = -Infinity;
  private last: ArmDirection | null = null;
  reset(): void { this.side = null; this.stamp = -Infinity; this.last = null; }
  update(frame: PoseFrame | null, now: number): ArmDirection | null {
    if (!frame || !Number.isFinite(frame.timestampMs) || now-frame.timestampMs > 250 || frame.timestampMs > now+5
      || !Number.isFinite(frame.armTimestampMs) || now-frame.armTimestampMs! > 250 || frame.armTimestampMs! > now+5
      || !frame.armLandmarks || frame.armLandmarks.length !== 33 || !frame.landmarks[0]
      || !Number.isFinite(frame.imageAspectRatio) || frame.imageAspectRatio! <= 0) return null;
    if (![frame.landmarks[0].x, frame.landmarks[0].y, frame.landmarks[0].z].every(Number.isFinite)) return null;
    const body = frame.armLandmarks, wrist = frame.landmarks[0], aspect = frame.imageAspectRatio!;
    const visible = (i: number) => body[i] && (body[i].visibility ?? 0) >= .6
      && [body[i].x, body[i].y, body[i].z].every(Number.isFinite) && body[i].x >= 0 && body[i].x <= 1 && body[i].y >= 0 && body[i].y <= 1;
    const candidates = ([0, 1] as const).filter(side => [11+side, 13+side, 15+side].every(visible));
    const gap = (side: number) => Math.hypot((body[15+side].x-wrist.x)*aspect, body[15+side].y-wrist.y);
    const side = this.side ?? candidates.sort((a,b) => gap(a)-gap(b))[0];
    if (side === undefined || !candidates.includes(side) || gap(side) > .16) return null;
    if (frame.armTimestampMs === this.stamp) return this.last;
    if (frame.armTimestampMs! < this.stamp) return null;
    const world = frame.armWorldLandmarks;
    const landmarks = world?.length === 33 && [world[11+side], world[13+side]].every(p => p && [p.x,p.y,p.z].every(Number.isFinite)) ? world : body;
    const shoulder = landmarks[11+side], elbow = landmarks[13+side];
    let x = -(elbow.x-shoulder.x)*(landmarks === body ? aspect : 1), y = -(elbow.y-shoulder.y), z = -(elbow.z-shoulder.z);
    const length = Math.hypot(x,y,z); if (length < .03 || length > 2) return null;
    x /= length; y /= length; z /= length;
    const old = this.last; const blend = old && frame.armTimestampMs!-this.stamp <= 250 ? .65 : 1;
    x = (old?.x ?? x)*(1-blend)+x*blend; y = (old?.y ?? y)*(1-blend)+y*blend; z = (old?.z ?? z)*(1-blend)+z*blend;
    const size = Math.hypot(x,y,z); if (size < .01) return null;
    this.side = side; this.stamp = frame.armTimestampMs!; this.last = { x: x/size, y: y/size, z: z/size }; return this.last;
  }
}
