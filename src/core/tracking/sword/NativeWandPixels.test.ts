import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { WasmColorComponents } from './WasmColorComponents';
import { PinkGreenComponents } from './PinkGreenComponents';
import { FourRingWandDetector, WAND_RINGS } from './FourRingWandDetector';
const binary = readFileSync(new URL('./color-components.wasm', import.meta.url));
const w = 320, h = 240;
const colorSpace = {matrix:'bt709',primaries:'bt709',transfer:'bt709',fullRange:false};
function nativeFrame(bytes: Uint8Array, fullRange = false) {
  return {format:'NV12',visibleRect:{x:0,y:0,width:w,height:h},displayWidth:w,displayHeight:h,
    colorSpace:{...colorSpace,fullRange},allocationSize:vi.fn(()=>bytes.length),
    copyTo:vi.fn(async (target:Uint8Array) => { target.set(bytes); return []; })} as unknown as VideoFrame;
}
function picture(mask = 15, shift = 0) {
  const bytes = new Uint8Array(w*h*1.5); bytes.fill(60,0,w*h); bytes.fill(128,w*h);
  WAND_RINGS.forEach((ring,id) => {
    if (!(mask & 1<<id)) return;
    const [yy,u,v] = ring.color === 0 ? [90,147,224] : [160,80,45];
    for(let y=116;y<128;y++)for(let x=Math.max(0,ring.startCm*5+shift);x<Math.min(w,ring.endCm*5+shift);x++) {
      bytes[y*w+x]=yy; const p=w*h+(y>>1)*w+(x&~1);bytes[p]=u;bytes[p+1]=v;
    }
  }); return bytes;
}
function rgbaOracle(bytes: Uint8Array, full = false) {
  const rgba = new Uint8ClampedArray(w*h*4), byte=(x:number)=>Math.min(255,Math.max(0,Math.floor(x+.5)));
  const scale=full?1:255/224;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=y*w+x, yy=full?bytes[p]:(bytes[p]-16)*255/219;
    const fx=x/2-.25,fy=y/2-.25,x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
    const chroma=(c:number)=>{
      const at=(xx:number,yy:number)=>bytes[w*h+Math.min(h/2-1,Math.max(0,yy))*w+Math.min(w/2-1,Math.max(0,xx))*2+c];
      return (at(x0,y0)*(1-tx)+at(x0+1,y0)*tx)*(1-ty)+(at(x0,y0+1)*(1-tx)+at(x0+1,y0+1)*tx)*ty;
    };
    const cb=chroma(0)-128,cr=chroma(1)-128;
    rgba.set([byte(yy+1.5748*scale*cr),byte(yy-.1873242729306488*scale*cb-.4681242729306488*scale*cr),byte(yy+1.8556*scale*cb),255],p*4);
  } return rgba;
}
describe('native camera planes into WASM', () => {
  it('keeps JS/native geometry identical while the pink end exits the image and returns', async () => {
    const backend = await WasmColorComponents.create(binary, true);
    const native = new FourRingWandDetector(backend), js = new FourRingWandDetector();
    for (const [i, shift] of [-50,-65,-80,-95,-110,-125,-140,-125,-110,-95,-80,-65,-50].entries()) {
      const bytes = picture(15, shift);
      await backend.readVideoFrame(nativeFrame(bytes));
      const actual = native.detectPrepared(w,h,i*33);
      expect(actual).toEqual(js.detect(rgbaOracle(bytes),w,h,i*33));
      expect(actual.frame, `shift ${shift}: ${actual.reason}`).not.toBeNull();
    }
  });
  it('preserves all 16,777,216 YUV values in the exact two-bit cache, for both ranges', async () => {
    const {instance}=await WebAssembly.instantiate(binary,{});
    const e=instance.exports as {memory:WebAssembly.Memory;imagePointer():number;setPinkGreen(n:number):void;setInputFormat(n:number):void;classifyYuvTriples(n:number):number};
    e.setPinkGreen(1);const input=new Uint8Array(e.memory.buffer,e.imagePointer(),65536*4);
    const byte=(v:number)=>Math.min(255,Math.max(0,Math.floor(v+.5)));
    for(const full of [false,true]) {
      e.setInputFormat(full?3:2);let errors=0;
      for(let yy=0;yy<256;yy++) {
        for(let u=0;u<256;u++)for(let v=0;v<256;v++)input.set([yy,u,v,255],(u*256+v)*4);
        const mask=new Uint8Array(e.memory.buffer,e.classifyYuvTriples(65536),65536);
        const y=full?yy:(yy-16)*(255/219),scale=full?1:255/224;
        for(let u=0;u<256;u++)for(let v=0;v<256;v++) {
          const cb=u-128,cr=v-128,r=byte(y+1.5748*scale*cr),g=byte(y-.1873242729306488*scale*cb-.4681242729306488*scale*cr),b=byte(y+1.8556*scale*cb);
          const c=r>65&&b>35&&r>g*1.4+15&&b>g*1.05+5&&r>b*.7?1:g>60&&g>r*1.35+15&&g>b*1.2+10?2:0;
          if(mask[u*256+v]!==c)errors++;
        }
      }
      expect(errors).toBe(0);
    }
  }, 60000); // 33M exhaustive comparisons; not a wall-time performance assertion.
  it.each([false,true])('preserves foil geometry and all occlusion masks (full range %s)', async full => {
    const backend=await WasmColorComponents.create(binary,true), native=new FourRingWandDetector(backend), js=new FourRingWandDetector();
    for(let mask=0;mask<16;mask++) {
      native.reset();js.reset();
      for(const [index,m] of [15,mask,mask,15].entries()) {
        const bytes=picture(m), input=nativeFrame(bytes,full), expected=rgbaOracle(bytes,full);
        expect(await backend.readVideoFrame(input)).toBe('nv12');
        expect(native.detectPrepared(w,h,index*33)).toEqual(js.detect(expected,w,h,index*33));
        if(m===15)expect(native.detectPrepared(w,h,index*33+1).frame?.visibleRings).toBe(4);
      }
    }
  });
  it('matches an independent RGB oracle on random YUV blocks, clipped components and ROI', async () => {
    const backend=await WasmColorComponents.create(binary,true), js=new PinkGreenComponents();
    let seed=13; const rand=()=> (seed=(Math.imul(seed,1664525)+1013904223)>>>0)%256;
    const bytes=picture(0);
    for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8) {
      const yy=rand(),u=rand(),v=rand();
      for(let py=y;py<y+8;py++)for(let px=x;px<x+8;px++) {bytes[py*w+px]=yy;const p=w*h+(py>>1)*w+(px&~1);bytes[p]=u;bytes[p+1]=v;}
    }
    for(const full of [false,true]) {
      await backend.readVideoFrame(nativeFrame(bytes,full));js.prepare(rgbaOracle(bytes,full),w,h);
      for(const r of [{x0:0,y0:0,x1:w,y1:h},{x0:11,y0:19,x1:90,y1:120}])expect(backend.components(r)).toEqual(js.components(r));
    }
  });
  it('reuses direct linear memory, and rejects unknown colour/geometry before choosing native NV12', async () => {
    const backend=await WasmColorComponents.create(binary,true), frame=nativeFrame(picture());
    await backend.readVideoFrame(frame); await backend.readVideoFrame(frame);
    expect(vi.mocked(frame.copyTo).mock.calls[0][0]).toBe(vi.mocked(frame.copyTo).mock.calls[1][0]);
    expect(vi.mocked(frame.copyTo).mock.calls[0][1]).toMatchObject({layout:[{offset:0,stride:w},{offset:w*h,stride:w}]});
    for(const patch of [{colorSpace:{...colorSpace,matrix:'bt2020-ncl'}},{colorSpace:{...colorSpace,fullRange:null}},
      {colorSpace:{...colorSpace,transfer:'pq'}},{format:'I420'}]) {
      const f={...frame,...patch,allocationSize:vi.fn(()=>w*h*4)} as unknown as VideoFrame;
      expect(await backend.readVideoFrame(f)).toBe('rgba');
      expect(vi.mocked(f.copyTo).mock.lastCall?.[1]).toMatchObject({format:'RGBA'});
    }
    for(const patch of [{rotation:180},{flip:true},{displayWidth:480},{displayWidth:2000,visibleRect:{x:0,y:0,width:2000,height:h}}])
      await expect(backend.readVideoFrame({...frame,...patch} as VideoFrame)).rejects.toThrow();
  });
  it('switches native/RGBA/BGRA sources without carrying a stale colour profile', async () => {
    const backend=await WasmColorComponents.create(binary,true), bytes=picture(), rgba=rgbaOracle(bytes);
    await backend.readVideoFrame(nativeFrame(bytes));
    const roi={x0:0,y0:0,x1:w,y1:h}, expected=backend.components(roi);
    backend.prepare(rgba,w,h);expect(backend.components(roi)).toEqual(expected);
    const bgra=Uint8Array.from(rgba);for(let i=0;i<bgra.length;i+=4){const r=bgra[i];bgra[i]=bgra[i+2];bgra[i+2]=r;}
    const frame={...nativeFrame(bgra),format:'BGRA',colorSpace:{matrix:'rgb',primaries:'bt709',transfer:'iec61966-2-1',fullRange:true}} as unknown as VideoFrame;
    expect(await backend.readVideoFrame(frame)).toBe('bgra');expect(backend.components(roi)).toEqual(expected);
    backend.prepare(rgba,w,h);expect(backend.components(roi)).toEqual(expected);
  });
});
