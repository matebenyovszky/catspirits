import { validSword, type Point2, type SwordFrame } from './types';
import { motionInterval } from '../motionInterval';

/** Render-only continuation between camera frames. Output has no timestamp or
 * confidence and cannot be passed to the measured-hit game API as a SwordFrame.
 * At most 50 ms / 0.04 image heights of extrapolation, rigid blade length. */
export class SwordDisplayPredictor {
  private current: SwordFrame | null = null;
  private previous: SwordFrame | null = null;
  private correction = {x:0,y:0,angle:0,at:-Infinity};
  accept(frame: SwordFrame, now: number, enabled: boolean): void {
    if (frame===this.current || !validSword(frame,now)) return;
    const old=this.current && this.sample(this.current,now,enabled);
    this.previous=this.current;this.current=frame;
    this.correction={x:0,y:0,angle:0,at:-Infinity};
    if (!old || !enabled || !this.previous || frame.imageAspectRatio!==this.previous.imageAspectRatio
      || frame.timestampMs-this.previous.timestampMs>100) return;
    const target=this.project(frame,now,enabled), aspect=frame.imageAspectRatio;
    const x=((old.base.x+old.tip.x)-(target.base.x+target.tip.x))*aspect/2;
    const y=((old.base.y+old.tip.y)-(target.base.y+target.tip.y))/2;
    const gain=Math.min(1,.02/Math.max(1e-9,Math.hypot(x,y)));
    const angle=Math.atan2(old.tip.y-old.base.y,(old.tip.x-old.base.x)*aspect)
      -Math.atan2(target.tip.y-target.base.y,(target.tip.x-target.base.x)*aspect);
    this.correction={x:x*gain,y:y*gain,angle:Math.max(-.08,Math.min(.08,Math.atan2(Math.sin(angle),Math.cos(angle)))),at:now};
  }
  sample(frame: SwordFrame | null, now: number, enabled: boolean, validAtMs=now): {base:Point2;tip:Point2} | null {
    if (!frame || !validSword(frame,validAtMs)) { this.current=this.previous=null;this.correction.at=-Infinity;return null; }
    if(frame!==this.current)this.accept(frame,validAtMs,enabled);
    const raw=this.project(frame,now,enabled);
    const u=Math.min(1,Math.max(0,(now-this.correction.at)/32)), gain=enabled?1-u*u*(3-2*u):0;
    if (!gain) return raw;
    const aspect=frame.imageAspectRatio,angle=this.correction.angle*gain,c=Math.cos(angle),s=Math.sin(angle);
    const dx=(raw.tip.x-raw.base.x)*aspect/2,dy=(raw.tip.y-raw.base.y)/2;
    const cx=(raw.base.x+raw.tip.x)*aspect/2+this.correction.x*gain,cy=(raw.base.y+raw.tip.y)/2+this.correction.y*gain;
    const halfX=dx*c-dy*s,halfY=dx*s+dy*c;
    const sourceX=(frame.tip.x-frame.base.x)*aspect/2,sourceY=(frame.tip.y-frame.base.y)/2;
    const turn=Math.atan2(sourceX*halfY-sourceY*halfX,sourceX*halfX+sourceY*halfY);
    const mx=(frame.base.x+frame.tip.x)*aspect/2,my=(frame.base.y+frame.tip.y)/2;
    const limit=Math.min(1,.04/Math.max(1e-9,Math.hypot(cx-mx,cy-my)+Math.abs(turn)*Math.hypot(sourceX,sourceY)));
    const rotation=turn*limit,rc=Math.cos(rotation),rs=Math.sin(rotation);
    const bx=sourceX*rc-sourceY*rs,by=sourceX*rs+sourceY*rc;
    const x=mx+(cx-mx)*limit,y=my+(cy-my)*limit;
    return {base:{x:(x-bx)/aspect,y:y-by},tip:{x:(x+bx)/aspect,y:y+by}};
  }
  private project(frame:SwordFrame,now:number,enabled:boolean):{base:Point2;tip:Point2} {
    const a=this.previous,b=frame, dt=motionInterval(b,a);
    if (!enabled || !a || dt<8 || dt>100 || b.confidence<.65 || a.supportMask!==b.supportMask
      || a.imageAspectRatio!==b.imageAspectRatio) return b;
    // Cover the 30 Hz observation interval plus delivery/display phase. Keep
    // the existing .04 image-height displacement bound, with a smooth stop.
    const age=Math.max(0,now-b.timestampMs), horizon=age<=33?age:33+17*(-Math.expm1(-(age-33)/17));
    const aspect=b.imageAspectRatio, ratio=horizon/dt;
    const ax=(a.base.x+a.tip.x)*aspect/2,ay=(a.base.y+a.tip.y)/2;
    const bx=(b.base.x+b.tip.x)*aspect/2,by=(b.base.y+b.tip.y)/2;
    const adx=(a.tip.x-a.base.x)*aspect,ady=a.tip.y-a.base.y,bdx=(b.tip.x-b.base.x)*aspect,bdy=b.tip.y-b.base.y;
    const length=Math.hypot(bdx,bdy),oldLength=Math.hypot(adx,ady);
    if (oldLength<.01 || length/oldLength<.75 || length/oldLength>1.3) return b;
    const angle=Math.atan2(adx*bdy-ady*bdx,adx*bdx+ady*bdy);
    if (Math.abs(angle)>Math.PI/3) return b;
    const travel=Math.hypot(bx-ax,by-ay)+Math.abs(angle)*length/2;
    // Subpixel stationary noise should not become a display velocity.
    if(travel/dt*1000<.02)return b;
    const gain=Math.min(ratio,.04/Math.max(1e-6,travel));
    const rotation=angle*gain,c=Math.cos(rotation),s=Math.sin(rotation);
    const dx=(bdx*c-bdy*s)/2,dy=(bdx*s+bdy*c)/2,cx=bx+(bx-ax)*gain,cy=by+(by-ay)*gain;
    const base={x:(cx-dx)/aspect,y:cy-dy},tip={x:(cx+dx)/aspect,y:cy+dy};
    // Offscreen display endpoints are clipped by the view. Returning the old
    // measurement here would visibly snap back at the camera border.
    return {base,tip};
  }
}
