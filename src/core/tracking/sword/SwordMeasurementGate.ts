import { validSword, type SwordFrame } from './types';

/** Reject a single impossible-looking measurement, not legitimate fast motion.
 * A second nearby sample confirms a new location. Rejected frames are NULL to
 * gameplay, so no sweep can bridge a jump or a tracking loss. */
export class SwordMeasurementGate {
  private good: SwordFrame | null = null;
  private pending: SwordFrame | null = null;
  private lastTimestamp = -Infinity;
  rejected = false;
  reset(): void { this.good=this.pending=null;this.lastTimestamp=-Infinity;this.rejected=false; }
  accept(frame: SwordFrame | null, now: number): SwordFrame | null {
    this.rejected=false;
    if(!frame || !validSword(frame,now)){this.pending=null;return null;}
    if(frame.timestampMs<=this.lastTimestamp)return null;
    this.lastTimestamp=frame.timestampMs;
    const old=this.good, dt=old?(frame.timestampMs-old.timestampMs)/1000:0;
    if(old && (dt<.15 || this.pending) && frame.imageAspectRatio===old.imageAspectRatio && !this.compatible(old,frame)) {
      if(!this.pending || frame.timestampMs-this.pending.timestampMs>80 || !this.compatible(this.pending,frame)) {
        this.pending=frame;this.rejected=true;return null;
      }
    }
    this.good=frame;this.pending=null;return frame;
  }
  private compatible(a: SwordFrame,b: SwordFrame): boolean {
    const aspect=b.imageAspectRatio,dt=Math.min(.05,Math.max(.008,(b.timestampMs-a.timestampMs)/1000));
    const ax=(a.tip.x-a.base.x)*aspect,ay=a.tip.y-a.base.y,bx=(b.tip.x-b.base.x)*aspect,by=b.tip.y-b.base.y;
    const length=Math.hypot(ax,ay),nextLength=Math.hypot(bx,by);
    const center=Math.hypot(((b.base.x+b.tip.x)-(a.base.x+a.tip.x))*aspect/2,((b.base.y+b.tip.y)-(a.base.y+a.tip.y))/2);
    return length>.01 && nextLength/length>.6 && nextLength/length<1.65
      && center<.08+5*dt && (ax*bx+ay*by)/(length*nextLength)>Math.cos(Math.min(2.3,.5+20*dt));
  }
}
