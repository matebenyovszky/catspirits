import type { ColorBlob } from './ColorWandDetector';
import type { SwordFrame } from './types';

/** Weak perspective size cue, NOT metric 3D/roll. Second moments projected
 * perpendicular to the fitted shaft estimate the local cylinder width, without
 * confusing the physically longer outer bands with a closer end.
 * Both same-colour pairs must independently agree; partial
 * support, tiny bands, glare/asymmetric occlusion and extreme ratios abstain. */
export function ringScaleCue(matches: (ColorBlob|null)[],dx=1,dy=0): SwordFrame['scaleCue'] {
  if(matches.length!==4 || matches.some(b=>!b || b.area<40 || !Number.isFinite(b.area)))return undefined;
  const span=Math.hypot(dx,dy);if(!Number.isFinite(span)||span===0)return undefined;
  const nx=-dy/span,ny=dx/span,t=[0,8.5/30,20.5/30,1];
  const widths=matches.map(b=>{
    const m=b!.moments;if(!m)return NaN;
    // Pixel centres omit each pixel's own 1/12 second moment: +1 restores
    // the width of an axis-aligned, uniformly filled N-pixel rectangle.
    return Math.sqrt(12*(nx*nx*m.xx+2*nx*ny*m.xy+ny*ny*m.yy)+1);
  });
  if(widths.some(w=>!Number.isFinite(w)||w<3))return undefined;
  const scales=widths.map(w=>Math.log(w));
  const pink=(scales[1]-scales[0])/(t[1]-t[0]),green=(scales[3]-scales[2])/(t[3]-t[2]);
  if(Math.abs(pink-green)>.22 || pink*green<-.0025)return undefined;
  const slope=(pink+green)/2;
  if(Math.abs(slope)>.4)return undefined;
  // Reject a hue/shape-dependent width discontinuity masquerading as perspective.
  const intercept=scales.map((s,i)=>s-slope*t[i]);
  if(Math.max(...intercept)-Math.min(...intercept)>.08)return undefined;
  // One-pixel quantization of a ~20px band can shift a short-pair slope by
  // ~0.15. Do not silently apply the same disagreement rejection twice.
  const confidence=Math.max(0,1-Math.abs(pink-green)/.44);
  if(confidence<.5)return undefined;
  return {tipToBase:Math.max(.8,Math.min(1.25,Math.exp(Math.abs(slope)<.035?0:slope))),confidence};
}
