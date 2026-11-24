// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { previewPoint,skeletonPaths,createTrackingOverlay,TrackingOverlay } from './TrackingOverlay';
import { setTrackingLinesEnabled } from './overlayPreference';
import type { PoseFrame } from './types';
let overlay:TrackingOverlay|undefined,video:HTMLVideoElement;
beforeEach(()=>{setTrackingLinesEnabled(true);vi.useFakeTimers();document.body.innerHTML='<div><video></video><canvas id="game"></canvas><button>Pause</button></div>';video=document.querySelector('video')!;
  Object.defineProperties(video,{clientWidth:{value:160},clientHeight:{value:120},videoWidth:{value:640},videoHeight:{value:480},offsetLeft:{value:5},offsetTop:{value:9}});
  video.style.transform='scaleX(-1)';video.style.objectFit='contain';video.getClientRects=()=>[{}] as unknown as DOMRectList;
  vi.spyOn(document,'hidden','get').mockReturnValue(false);overlay=createTrackingOverlay(video);
});
afterEach(()=>{overlay?.dispose();vi.useRealTimers();vi.restoreAllMocks();});
const hand=():PoseFrame=>({timestampMs:performance.now(),landmarks:Array.from({length:21},(_,i)=>({x:.2+i*.02,y:.5,z:0})),worldLandmarks:[],inferenceMs:1,imageAspectRatio:4/3});
it('projects both letterboxing and cropped previews without distorting skeletons',()=>{
  expect(previewPoint({x:0,y:0},100,100,2,'contain')).toEqual({x:0,y:25});
  expect(previewPoint({x:0,y:0},100,100,2,'cover')).toEqual({x:-50,y:0});
  expect(previewPoint({x:1,y:1},100,100,2,'contain')).toEqual({x:100,y:75});
});
it('does not invent fingers from body points and omits uncertain or invalid points',()=>{
  const body=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));const baseline=skeletonPaths(body,p=>p);
  body[13].visibility=.1;body[15].x=NaN;expect(skeletonPaths(body,p=>p).lines.length).toBeLessThan(baseline.lines.length);
  expect(skeletonPaths(body,p=>p).lines).not.toContain('NaN');expect(skeletonPaths([],p=>p)).toEqual({lines:'',dots:''});
});
it('layers between video and game, mirrors like the video, and stays pointer-transparent',()=>{
  overlay!.pose(hand());const svg=document.querySelector<SVGSVGElement>('.tracking-overlay')!;
  expect(video.nextElementSibling).toBe(svg);expect(svg.nextElementSibling?.id).toBe('game');expect(document.querySelector('canvas')?.id).toBe('game');
  expect(svg.style.pointerEvents).toBe('none');expect(svg.style.transform).toBe('scaleX(-1)');expect(svg.style.left).toBe('5px');expect(svg.style.top).toBe('9px');
  expect(svg.querySelectorAll('path')[1].getAttribute('d')).toContain('M');
});
it('caps redraws, clears lost/hidden/stale data and releases its only timer',()=>{
  const svg=document.querySelector<SVGSVGElement>('.tracking-overlay')!,path=svg.querySelectorAll('path')[1];overlay!.pose(hand());const first=path.getAttribute('d');
  const moved=hand();moved.landmarks[0].x=.8;overlay!.pose(moved);expect(path.getAttribute('d')).toBe(first);
  vi.advanceTimersByTime(60);moved.timestampMs=performance.now();overlay!.pose(moved);expect(path.getAttribute('d')).not.toBe(first);
  vi.advanceTimersByTime(401);expect(svg.style.display).toBe('none');expect(vi.getTimerCount()).toBe(0);
  overlay!.pose(hand());video.hidden=true;overlay!.pose(hand());expect(svg.style.display).toBe('none');
  video.hidden=false;overlay!.pose(hand());overlay!.pose({...hand(),landmarks:[]});expect(svg.style.display).toBe('none');
  overlay!.dispose();expect(document.querySelector('.tracking-overlay')).toBeNull();expect(vi.getTimerCount()).toBe(0);
});
it('shows only fresh robot arm observations alongside the measured hand',()=>{
  const frame={...hand(),armTimestampMs:performance.now(),armLandmarks:Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}))};overlay!.pose(frame);
  const arm=document.querySelector('.tracking-overlay path')!;expect(arm.getAttribute('d')).toContain('M');
  vi.advanceTimersByTime(260);frame.timestampMs=performance.now();overlay!.pose(frame);expect(arm.getAttribute('d')).toBe('');
});
it('draws measured sword rings and clears the line immediately on lost tracking',()=>{
  overlay!.sword({timestampMs:performance.now(),base:{x:.1,y:.2},tip:{x:.8,y:.9},confidence:1,imageAspectRatio:4/3,source:'four-ring-2d',rings:[{x:.1,y:.2,id:0},{x:.8,y:.9,id:3}]});
  const svg=document.querySelector<SVGSVGElement>('.tracking-overlay')!;expect(svg.querySelectorAll('path')[1].getAttribute('stroke')).toBe('#ffa1e9');expect(svg.querySelectorAll('path')[2].getAttribute('d')?.match(/M/g)).toHaveLength(2);
  overlay!.sword(null);expect(svg.style.display).toBe('none');expect(vi.getTimerCount()).toBe(0);
});

it('hides every preview immediately and does no drawing or timer work while disabled',()=>{
  const otherVideo=video.cloneNode() as HTMLVideoElement; video.parentElement!.append(otherVideo);
  const other=createTrackingOverlay(otherVideo)!;
  try {
    overlay!.pose(hand());const svg=document.querySelector<SVGSVGElement>('.tracking-overlay')!;
    expect(svg.style.display).toBe('block');expect(vi.getTimerCount()).toBe(1);
    setTrackingLinesEnabled(false);
    expect(svg.style.display).toBe('none');expect(vi.getTimerCount()).toBe(0);
    const draw=vi.spyOn(svg.querySelectorAll('path')[1],'setAttribute');
    overlay!.pose(hand());other.pose(hand());
    overlay!.sword({timestampMs:performance.now(),base:{x:.1,y:.2},tip:{x:.8,y:.9},confidence:1,imageAspectRatio:4/3,source:'four-ring-2d'});
    expect(draw).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    setTrackingLinesEnabled(true);
    expect(svg.style.display).toBe('none'); // Wait for a fresh measured frame.
    overlay!.pose(hand());expect(svg.style.display).toBe('block');
  } finally { other.dispose();setTrackingLinesEnabled(true); }
});
