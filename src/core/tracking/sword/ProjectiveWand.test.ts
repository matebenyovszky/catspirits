import { describe, expect, it } from 'vitest';
import { FourRingWandDetector, WAND_RINGS } from './FourRingWandDetector';
import type { ColorBlob, ColorComponentsBackend } from './ColorWandDetector';
import { PERSPECTIVE_HOLD_MS, projectivePosition } from './ProjectiveWand';
import { validSword } from './types';

// Only measured anonymous ring geometry from the user's regression screenshot;
// the photograph (person/home) is intentionally NOT stored in the repository.
const PHOTO: ColorBlob[] = [
  { x:355.261329305136,y:47.69184290030211,area:662 },
  { x:305.97,y:71.8925,area:400 },
  { x:225.62135922330097,y:111.65857605177993,area:618 },
  { x:149.41759002770084,y:149.97368421052633,area:1444 },
];
class Observations implements ColorComponentsBackend {
  mask = 15;
  dx = 0;
  points = PHOTO;
  prepare() {}
  components(): [ColorBlob[],ColorBlob[]] {
    const result: [ColorBlob[],ColorBlob[]] = [[],[]];
    this.points.forEach((p,i)=>{if(this.mask & 1<<i)result[i<2?0:1].push({...p,x:p.x+this.dx});});
    return result;
  }
}
function photoEndpoints(frame: ReturnType<FourRingWandDetector['detectPrepared']>['frame'], dx = 0) {
  expect(frame).not.toBeNull();
  for(const [point,ring] of [[frame!.base,PHOTO[0]],[frame!.tip,PHOTO[3]]] as const)
    expect(Math.hypot(point.x*612-ring.x-dx,point.y*464-ring.y)).toBeLessThan(2);
  expect(validSword(frame!,frame!.timestampMs)).toBe(true);
}

describe('bounded perspective and partial observation',()=>{
  it('recognizes all four measured screenshot centroids rather than rejecting two affine triplets',()=>{
    const result=new FourRingWandDetector(new Observations()).detectPrepared(612,464,0);
    photoEndpoints(result.frame);
    expect(result.frame).toMatchObject({visibleRings:4,supportMask:15});
    expect(result.frame!.perspective).toBeCloseTo(-.21,2);
  });
  it.each([14,13,11,7,3,5,9,6,10,12])('maintains screenshot geometry with occlusion mask %i and fresh motion',mask=>{
    const backend=new Observations(),detector=new FourRingWandDetector(backend);
    photoEndpoints(detector.detectPrepared(612,464,0).frame);
    backend.mask=mask;
    for(let i=1;i<=15;i++){
      backend.dx=i*.5;
      const result=detector.detectPrepared(612,464,i*33);
      photoEndpoints(result.frame,backend.dx);
      expect(result.frame!.supportMask).toBe(mask);
    }
    backend.mask=15;
    photoEndpoints(detector.detectPrepared(612,464,528).frame,backend.dx);
  });
  it('never indefinitely refreshes perspective with only a pair, and reacquires four',()=>{
    const backend=new Observations(),detector=new FourRingWandDetector(backend);
    detector.detectPrepared(612,464,0);backend.mask=12;
    for(let t=33;t<=PERSPECTIVE_HOLD_MS;t+=33)photoEndpoints(detector.detectPrepared(612,464,t).frame);
    expect(detector.detectPrepared(612,464,PERSPECTIVE_HOLD_MS+33).frame).toBeNull();
    backend.mask=15;
    photoEndpoints(detector.detectPrepared(612,464,PERSPECTIVE_HOLD_MS+66).frame);
  });
  it('keeps a perspective endpoint outside the image when three measured rings remain',()=>{
    const backend=new Observations(),detector=new FourRingWandDetector(backend);backend.dx=210;
    photoEndpoints(detector.detectPrepared(612,464,0).frame,210);
    for(let i=1;i<=6;i++){
      backend.dx=210+i*14;backend.mask=backend.dx>240?14:15;
      const result=detector.detectPrepared(612,464,i*33);photoEndpoints(result.frame,backend.dx);
      if(backend.dx>=266){expect(result.frame!.base.x).toBeGreaterThan(1);expect(result.frame!.inferredEndpoints).toBe(true);}
    }
  });
  it('rejects a large partial-pose jump instead of stretching the remembered perspective',()=>{
    const backend=new Observations(),detector=new FourRingWandDetector(backend);
    detector.detectPrepared(612,464,0);backend.mask=14;backend.dx=180;
    expect(detector.detectPrepared(612,464,33).frame).toBeNull();
  });
  it('does not carry perspective across reset, resize or a stale observation gap',()=>{
    for(const mode of ['reset','resize','gap']){
      const backend=new Observations(),detector=new FourRingWandDetector(backend);
      detector.detectPrepared(612,464,0);backend.mask=12;
      if(mode==='reset')detector.reset();
      const result=detector.detectPrepared(mode==='resize'?600:612,464,mode==='gap'?200:33);
      expect(result.frame).toBeNull();
    }
  });
  it('rejects one ring, cold pairs, malformed spacing, and two competing perspective wands',()=>{
    for(const mask of [1,2,4,8,3,5,9,6,10,12]){
      const backend=new Observations();backend.mask=mask;
      expect(new FourRingWandDetector(backend).detectPrepared(612,464,0).frame).toBeNull();
    }
    const backend=new Observations();
    backend.points=PHOTO.map((p,i)=>({...p,x:i===1?p.x-30:p.x}));
    expect(new FourRingWandDetector(backend).detectPrepared(612,464,0).frame).toBeNull();
    const competing: ColorComponentsBackend={prepare(){},components(){
      return [PHOTO.slice(0,2).flatMap(p=>[p,{...p,y:p.y+180}]),
        PHOTO.slice(2).flatMap(p=>[p,{...p,y:p.y+180}])];
    }};
    expect(new FourRingWandDetector(competing).detectPrepared(612,464,0).frame).toBeNull();
  });
  it.each([-.35,-.21,0,.3,.65])('detects perspective-rendered foil pixels at slope %s, then an occluded endpoint',k=>{
    const w=320,h=240,angle=-.28,c=Math.cos(angle),s=Math.sin(angle),span=140,ax=75,ay=135;
    const picture=(mask:number)=>{
      const pixels=new Uint8ClampedArray(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const dx=x+.5-ax,dy=y+.5-ay,q=(dx*c+dy*s)/span,t=q/(1+k-k*q);
        if(t<-.15||t>1.15||Math.abs(-dx*s+dy*c)>5/(1+k*t))continue;
        const cm=15+30*t;
        WAND_RINGS.forEach((r,i)=>{if(mask & 1<<i && cm>=r.startCm&&cm<r.endCm)
          pixels.set(r.color?[15,225,55,255]:[245,35,130,255],(y*w+x)*4);});
      }
      return pixels;
    };
    const detector=new FourRingWandDetector();
    for(const [i,mask] of [15,14,7,15].entries()){
      const result=detector.detect(picture(mask),w,h,i*33);
      expect(result.frame,result.reason).not.toBeNull();
      expect(result.frame!.supportMask).toBe(mask);
      // A finite-width projected band has a slightly biased area centroid,
      // especially at k=.65; allow 3px raster/centroid error on a 140px shaft.
      expect(Math.hypot(result.frame!.base.x*w-ax,result.frame!.base.y*h-ay)).toBeLessThan(3);
      expect(Math.hypot(result.frame!.tip.x*w-ax-span*c,result.frame!.tip.y*h-ay-span*s)).toBeLessThan(3);
    }
  });
  it('preserves ordered endpoints with positive denominators throughout the accepted range',()=>{
    for(const k of [-.45,-.21,0,.8]){
      expect(projectivePosition(0,k)).toBe(0);expect(projectivePosition(1,k)).toBe(1);
      let last=-Infinity;
      for(let i=0;i<=100;i++){const p=projectivePosition(i/100,k);expect(p).toBeGreaterThan(last);last=p;}
    }
  });
});
