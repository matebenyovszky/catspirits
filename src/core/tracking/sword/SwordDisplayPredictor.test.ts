import {describe,it,expect} from 'vitest';
import {SwordDisplayPredictor} from './SwordDisplayPredictor';
import type {SwordFrame} from './types';
const frame=(time:number,x=.3):SwordFrame=>({timestampMs:time,base:{x,y:.5},tip:{x:x+.3,y:.5},imageAspectRatio:4/3,confidence:.9,source:'four-ring-2d',supportMask:15});
describe('render-only sword continuation',()=>{
  it('continues at render cadence without mutating measurements, then caps the horizon',()=>{
    const p=new SwordDisplayPredictor(),a=frame(0),b=frame(33,.32),original=structuredClone(b);
    p.sample(a,0,true);p.sample(b,33,true);
    const middle=p.sample(b,49,true)!,end=p.sample(b,58,true)!;
    expect(middle.base.x).toBeGreaterThan(b.base.x);expect(end.base.x).toBeGreaterThan(middle.base.x);
    const tail=p.sample(b,100,true)!;
    expect(tail.base.x).toBeGreaterThan(end.base.x);
    expect(tail.base.x-b.base.x).toBeLessThanOrEqual((b.base.x-a.base.x)*50/33);
    expect(b).toEqual(original);
    expect(middle).not.toHaveProperty('timestampMs');expect(middle.tip.x-middle.base.x).toBeCloseTo(.3);
  });
  it('never continues across occlusion/support changes, loss, stale data or disabled prediction',()=>{
    const p=new SwordDisplayPredictor(),a=frame(0),b={...frame(33,.32),supportMask:14};
    p.sample(a,0,true);
    // Support change disables extrapolation. A bounded display-only correction
    // may finish over one camera interval, then lands exactly on the new measurement.
    expect(p.sample(b,49,true)!.base.x).toBeLessThanOrEqual(b.base.x);
    expect(p.sample(b,81,true)).toBe(b);
    expect(p.sample(b,49,false)).toBe(b);expect(p.sample(null,50,true)).toBeNull();
    expect(p.sample(b,55,true)).toBe(b);expect(p.sample(b,200,true)).toBeNull();
  });
  it('bounds fast motion in image-height units and preserves rigid length under rotation',()=>{
    const p=new SwordDisplayPredictor(),a=frame(0),b=frame(33,.5);
    b.tip={x:.5+Math.cos(.3)*.3,y:.5+Math.sin(.3)*.3*4/3};
    p.sample(a,0,true);p.sample(b,33,true);const result=p.sample(b,58,true)!;
    for(const key of ['base','tip'] as const)expect(Math.hypot((result[key].x-b[key].x)*4/3,result[key].y-b[key].y)).toBeLessThanOrEqual(.040001);
    expect(Math.hypot((result.tip.x-result.base.x)*4/3,result.tip.y-result.base.y)).toBeCloseTo(.4);
  });
});
