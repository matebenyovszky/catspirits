import type { PoseFrame, PoseLandmark } from './types';
import { clipBlade, validSword, type SwordFrame, type Point2 } from './sword/types';
const NS='http://www.w3.org/2000/svg';
const BODY = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
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

/** Measured body, hands and wand share one preview but expire independently. */
export class TrackingOverlay {
  private readonly svg: SVGSVGElement;
  private readonly paths: Record<string, SVGPathElement>;
  private observation?: PoseFrame;
  private wand?: SwordFrame;
  private timer?: ReturnType<typeof setTimeout>;
  private lastDraw = -Infinity;
  private layout = '';
  private fit = 'contain';
  private disposed = false;

  constructor(private readonly video: HTMLVideoElement) {
    const doc = video.ownerDocument;
    const svg = this.svg = doc.createElementNS(NS, 'svg');
    svg.classList.add('tracking-overlay');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;display:none;';
    const path = (name: string, color: string, width: number) => {
      const node = doc.createElementNS(NS, 'path');
      node.dataset.trackingPart = name;
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', color);
      node.setAttribute('stroke-width', String(width));
      node.setAttribute('stroke-linecap', 'round');
      node.setAttribute('stroke-linejoin', 'round');
      svg.append(node);
      return node;
    };
    this.paths = {
      body: path('body', '#78c1ff', 1.7),
      hand: path('hand', '#75ffda', 1.7),
      fingers: path('fingers', '#e3fff8', 3),
      second: path('second-hand', '#e5adff', 1.7),
      secondFingers: path('second-fingers', '#f5e0ff', 3),
      wand: path('wand', '#f9bf6c', 2.6),
      rings: path('wand-rings', '#ffebae', 4.5),
    };
    video.after(svg);
  }

  pose(frame: PoseFrame): void {
    this.observation = frame;
    const empty = !frame.landmarks.length && !frame.hands?.length && !frame.armLandmarks?.length;
    this.update(empty);
  }

  sword(frame: SwordFrame | null): void {
    this.wand = frame ?? undefined;
    this.update(!frame);
  }

  private update(immediate = false): void {
    if (this.disposed) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    const video = this.video;
    if (video.ownerDocument.hidden || video.hidden || video.closest('[hidden]') || !video.getClientRects().length) {
      this.clear();
      return;
    }
    const now = performance.now();
    const frame = this.observation;
    const fresh = (time: number, age: number) => Number.isFinite(time) && time <= now + 50 && now - time < age;
    const handTime = frame?.handTimestampMs ?? frame?.timestampMs ?? -Infinity;
    const bodyTime = frame?.armTimestampMs ?? (frame?.landmarks.length === 33 ? frame.timestampMs : -Infinity);
    const handsFresh = !!frame && fresh(handTime, 390);
    const bodyFresh = !!frame && fresh(bodyTime, 285);
    const wand = this.wand && validSword(this.wand, now) && fresh(this.wand.timestampMs, 120) ? this.wand : undefined;
    const hands = handsFresh ? frame.hands : undefined;
    const hand = hands?.[0]?.points ?? (handsFresh && frame.landmarks.length === 21 ? frame.landmarks : []);
    const second = hands?.[1]?.points ?? [];
    const body = bodyFresh ? frame.armLandmarks ?? (frame.landmarks.length === 33 ? frame.landmarks : []) : [];
    if (!hand.length && !second.length && !body.length && !wand) {
      this.resetPaths();
      return;
    }

    const expires = Math.min(hand.length || second.length ? handTime + 390 : Infinity,
      body.length ? bodyTime + 285 : Infinity, wand ? wand.timestampMs + 120 : Infinity);
    const delay = Math.max(33 - (now - this.lastDraw), 0);
    if (!immediate && delay && expires > now + delay) {
      this.timer = setTimeout(() => this.update(), delay);
      return;
    }
    const width = video.clientWidth, height = video.clientHeight;
    if (!width || !height) {
      this.resetPaths();
      return;
    }
    const left = video.offsetLeft + video.clientLeft, top = video.offsetTop + video.clientTop;
    const layout = `${left},${top},${width},${height}`;
    if (this.layout !== layout) {
      this.layout = layout;
      const style = getComputedStyle(video);
      this.fit = style.objectFit || 'contain';
      Object.assign(this.svg.style, {
        left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
        borderRadius: style.borderRadius, transform: style.transform, transformOrigin: style.transformOrigin,
      });
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const a = frame?.imageAspectRatio ?? video.videoWidth / video.videoHeight;
    const aspect = a > 0 && Number.isFinite(a) ? a : 4 / 3;
    const project = (point: Point2) => previewPoint(point, width, height, aspect, this.fit);
    const firstPaths = skeletonPaths(hand, project), secondPaths = skeletonPaths(second, project);
    this.paths.body.setAttribute('d', skeletonPaths(body, project).lines);
    this.paths.hand.setAttribute('d', firstPaths.lines);
    this.paths.fingers.setAttribute('d', firstPaths.dots);
    this.paths.second.setAttribute('d', secondPaths.lines);
    this.paths.secondFingers.setAttribute('d', secondPaths.dots);

    const blade = wand && clipBlade(wand);
    let line = '', rings = '';
    if (wand && blade) {
      const wandPoint = (p: Point2) => {
        const point = previewPoint(p, width, height, wand.imageAspectRatio, this.fit);
        return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      };
      line = `M${wandPoint(blade.base)}L${wandPoint(blade.tip)}`;
      rings = (wand.rings ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map(p => `M${wandPoint(p)}h.01`).join('');
    }
    this.paths.wand.setAttribute('d', line);
    this.paths.rings.setAttribute('d', rings);
    this.paths.wand.setAttribute('stroke-dasharray', wand?.inferredEndpoints ? '5 4' : '');
    this.svg.style.display = 'block';
    this.lastDraw = now;
    this.timer = setTimeout(() => this.update(true), Math.max(1, expires - now));
  }

  private resetPaths(): void {
    for (const path of Object.values(this.paths)) path.setAttribute('d', '');
    this.svg.style.display = 'none';
    this.lastDraw = -Infinity;
  }

  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.observation = this.wand = undefined;
    this.resetPaths();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
    this.svg.remove();
  }
}

export function createTrackingOverlay(video: HTMLVideoElement): TrackingOverlay | undefined {
  return video.parentElement ? new TrackingOverlay(video) : undefined;
}
