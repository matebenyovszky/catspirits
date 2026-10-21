import {describe,it,expect} from 'vitest';
import {ringScaleCue} from './RingScaleCue';
const bands=(slope:number)=>[0,8.5/30,20.5/30,1].map((t,i)=>({x:t*180+40,y:100,area:100*[6,3,3,6][i]*Math.exp(2*slope*t),
  moments:{xx:100*[6,3,3,6][i],xy:0,yy:(100*Math.exp(2*slope*t)-1)/12}}));
describe('conservative foil perspective size cue',()=>{
  it('normalizes differing physical band widths, signs the nearer end, and bounds the visual ratio',()=>{
    expect(ringScaleCue(bands(0))!.tipToBase).toBe(1);
    expect(ringScaleCue(bands(.18))!.tipToBase).toBeCloseTo(Math.exp(.18));
    expect(ringScaleCue(bands(-.18))!.tipToBase).toBeCloseTo(Math.exp(-.18));
    expect(ringScaleCue(bands(.3))!.tipToBase).toBe(1.25);
  });
  it('abstains on missing rings, tiny fragments, hue bias, occlusion and extreme perspective',()=>{
    expect(ringScaleCue([null,...bands(0).slice(1)])).toBeUndefined();
    for(const i of [0,1,2,3]){const b=bands(0);b[i].moments.yy*=.4;expect(ringScaleCue(b)).toBeUndefined();}
    const biased=bands(0);biased[2].moments.yy*=.6;biased[3].moments.yy*=.6;expect(ringScaleCue(biased)).toBeUndefined();
    const tiny=bands(0);tiny[1].area=10;expect(ringScaleCue(tiny)).toBeUndefined();
    expect(ringScaleCue(bands(.8))).toBeUndefined();
  });
});
