import { onTrackingLinesChange, trackingLinesEnabled } from './overlayPreference';
import type { PoseFrame, PoseLandmark } from './types';
import { clipBlade, validSword, type SwordFrame, type Point2 } from './sword/types';
const NS='http://www.w3.org/2000/svg';
const BODY = [[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
const HAND = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
/** Object-fit projection in unmirrored CSS pixels. The SVG receives the video's
 * identical CSS transform, so mirroring and cover/contain cropping stay aligned. */
export function previewPoint(point:Point2,width:number,height:number,aspect:number,fit:string):Point2 {
  if(fit==='fill')return {x:point.x*width,y:point.y*height};
  const scale=fit==='cover'?Math.max(width/aspect,height):Math.min(width/aspect,height);
  return {x:(width-aspect*scale)/2+point.x*aspect*scale,y:(height-scale)/2+point.y*scale};
}
const visible=(p:PoseLandmark|undefined):p is PoseLandmark=>!!p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1 && (p.visibility??1)>=.5;
export function skeletonPaths(points:PoseLandmark[],project:(p:Point2)=>Point2):{lines:string;dots:string} {
  const edges=points.length===21?HAND:points.length===33?BODY:[];
  if(!edges.length)return {lines:'',dots:''};
  const xy=(p:Point2)=>{const q=project(p);return `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;};
  return {lines:edges.filter(([a,b])=>visible(points[a]) && visible(points[b])).map(([a,b])=>`M${xy(points[a])}L${xy(points[b])}`).join(''),
    dots:points.filter(visible).map(p=>`M${xy(p)}h.01`).join('')};
}
/** Small event-driven SVG, reusing measured landmarks only. No pixel readback,
 * inference, animation loop or canvas bitmap. At most 20 draws/s; hidden/stale
 * previews clear. Inserted after the video so game canvases/panels stay above it. */
export class TrackingOverlay {
  private svg:SVGSVGElement;
  private lines:SVGPathElement;
  private dots:SVGPathElement;
  private arm:SVGPathElement;
  private lastDraw=-Infinity;
  private expires=0;
  private timer?:ReturnType<typeof setTimeout>;
  private layout='';
  private fit='contain';
  private width=0;
  private height=0;
  private disposed=false;
  private unsubscribe:()=>void;
  constructor(private video:HTMLVideoElement) {
    const doc=video.ownerDocument;
    this.svg=doc.createElementNS(NS,'svg');this.svg.classList.add('tracking-overlay');this.svg.setAttribute('aria-hidden','true');
    this.svg.style.cssText='position:absolute;pointer-events:none;overflow:hidden;margin:0;padding:0;inset:auto;z-index:auto;display:none;';
    this.arm=doc.createElementNS(NS,'path');this.lines=doc.createElementNS(NS,'path');this.dots=doc.createElementNS(NS,'path');
    for(const path of [this.arm,this.lines,this.dots]){path.setAttribute('fill','none');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');}
    this.arm.setAttribute('stroke','#67baff');this.arm.setAttribute('stroke-width','1.6');
    this.lines.setAttribute('stroke','#54f5cf');this.lines.setAttribute('stroke-width','1.8');
    this.dots.setAttribute('stroke','#ffffff');this.dots.setAttribute('stroke-width','3.5');
    this.svg.append(this.arm,this.lines,this.dots);video.after(this.svg);
    this.unsubscribe=onTrackingLinesChange(()=>{if(!trackingLinesEnabled())this.clear();});
  }
  private prepare(timestamp:number,aspect:number,maxAge:number):((p:Point2)=>Point2)|null {
    const now=performance.now();
    if(this.disposed || !trackingLinesEnabled())return null;
    if(this.video.ownerDocument.hidden || !Number.isFinite(timestamp) || now-timestamp>maxAge || timestamp>now+50 || !Number.isFinite(aspect) || aspect<=0
      || this.video.hidden || this.video.closest('[hidden]') || !this.video.getClientRects().length){this.clear();return null;}
    this.expires=timestamp+maxAge;
    if(!this.timer)this.timer=setTimeout(()=>this.expire(),Math.max(0,this.expires-now));
    if(now-this.lastDraw<50)return null;
    this.lastDraw=now;
    const width=this.video.clientWidth,height=this.video.clientHeight;
    if(!width || !height){this.clear();return null;}
    const left=this.video.offsetLeft+this.video.clientLeft,top=this.video.offsetTop+this.video.clientTop;
    const layout=`${left},${top},${width},${height}`;
    if(layout!==this.layout){
      this.layout=layout;this.width=width;this.height=height;
      const style=getComputedStyle(this.video);this.fit=style.objectFit || 'contain';
      Object.assign(this.svg.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`,borderRadius:style.borderRadius,transform:style.transform,transformOrigin:style.transformOrigin});
      this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    }
    this.svg.style.display='block';
    return point=>previewPoint(point,this.width,this.height,aspect,this.fit);
  }
  pose(frame:PoseFrame):void {
    if(this.disposed || !trackingLinesEnabled())return;
    if(frame.landmarks.length!==21 && frame.landmarks.length!==33){this.clear();return;}
    const project=this.prepare(frame.timestampMs,frame.imageAspectRatio??this.video.videoWidth/this.video.videoHeight,400);if(!project)return;
    const paths=skeletonPaths(frame.landmarks,project);
    this.lines.setAttribute('stroke','#54f5cf');this.lines.removeAttribute('stroke-dasharray');
    this.lines.setAttribute('d',paths.lines);this.dots.setAttribute('d',paths.dots);
    const armFresh=frame.armTimestampMs!==undefined && performance.now()-frame.armTimestampMs<=250;
    this.arm.setAttribute('d',armFresh && frame.armLandmarks?skeletonPaths(frame.armLandmarks,project).lines:'');
  }
  sword(frame:SwordFrame|null):void {
    if(this.disposed || !trackingLinesEnabled())return;
    if(!frame || !validSword(frame,performance.now())){this.clear();return;}
    const blade=clipBlade(frame);if(!blade){this.clear();return;}
    const project=this.prepare(frame.timestampMs,frame.imageAspectRatio,120);if(!project)return;
    const base=project(blade.base),tip=project(blade.tip);
    this.lines.setAttribute('stroke','#ffa1e9');this.lines.setAttribute('stroke-dasharray',frame.inferredEndpoints?'5 4':'none');
    this.lines.setAttribute('d',`M${base.x} ${base.y}L${tip.x} ${tip.y}`);
    this.dots.setAttribute('d',(frame.rings??[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>{const q=project(p);return `M${q.x} ${q.y}h.01`;}).join(''));
    this.arm.setAttribute('d','');
  }
  private expire():void {
    this.timer=undefined;const remaining=this.expires-performance.now();
    if(remaining<=0 || this.video.ownerDocument.hidden || this.video.hidden || this.video.closest('[hidden]'))this.clear();
    else this.timer=setTimeout(()=>this.expire(),remaining);
  }
  clear():void {clearTimeout(this.timer);this.timer=undefined;this.svg.style.display='none';this.lastDraw=-Infinity;}
  dispose():void {if(this.disposed)return;this.disposed=true;this.unsubscribe();this.clear();this.svg.remove();}
}
export function createTrackingOverlay(video:HTMLVideoElement):TrackingOverlay|undefined {
  return video.parentElement ? new TrackingOverlay(video) : undefined;
}
