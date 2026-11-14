// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HandNavigation } from './HandNavigation';
import { sharedCamera } from '../../core/tracking/SharedCamera';
import type { PoseFrame } from '../../core/tracking/types';
const { trackers }=vi.hoisted(()=>({trackers:[] as {callbacks:{onFrame:(frame:PoseFrame)=>void};start:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[]}));
vi.mock('../../core/tracking/CameraPoseTracker',()=>({CameraPoseTracker:class {
  start=vi.fn(async()=>{});dispose=vi.fn();setInputWidth=vi.fn();
  constructor(_video:HTMLVideoElement,public callbacks:{onFrame:(frame:PoseFrame)=>void}){trackers.push(this);}
}}));
vi.mock('../../core/tracking/hand.worker',()=>({createHandWorker:vi.fn()}));
let navigation:HandNavigation,hit:Element|null,release:(()=>void)|undefined;
beforeEach(()=>{document.body.innerHTML='';sessionStorage.clear();trackers.length=0;hit=null;vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('PointerEvent',MouseEvent);vi.spyOn(document,'hidden','get').mockReturnValue(false);Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>hit});navigation=new HandNavigation();});
afterEach(()=>{navigation.dispose();release?.();release=undefined;vi.unstubAllGlobals();vi.restoreAllMocks();});
const settle=async()=>{await vi.dynamicImportSettled();for(let i=0;i<10;i++)await Promise.resolve();};
const toggle=()=>document.querySelector<HTMLButtonElement>('.hand-navigation button')!;
it('does not start a model or camera until opt-in; stops immediately and clears session opt-in',async()=>{
  await settle();expect(trackers).toHaveLength(0);toggle().click();await settle();expect(trackers).toHaveLength(1);expect(trackers[0].start).toHaveBeenCalledOnce();expect(toggle().getAttribute('aria-pressed')).toBe('true');
  toggle().click();expect(trackers[0].dispose).toHaveBeenCalledOnce();expect(sessionStorage.getItem('catspirits.hand-navigation.session.v1')).toBeNull();
});
it('reuses robot hand frames, then restarts cursor inference when the robot releases its camera',async()=>{
  toggle().click();await settle();const stream={getTracks:()=>[]} as unknown as MediaStream;
  const robot=sharedCamera.claim(async()=>stream,'game-hand');release=robot.release;await robot.ready;
  expect(trackers[0].dispose).toHaveBeenCalledOnce();expect(trackers).toHaveLength(1);
  robot.release();await settle();expect(trackers).toHaveLength(2);expect(trackers[1].start).toHaveBeenCalledOnce();
});
it('cannot resurrect on pagehide from a late game release; resumes on pageshow',async()=>{
  toggle().click();await settle();window.dispatchEvent(new Event('pagehide'));expect(trackers[0].dispose).toHaveBeenCalledOnce();
  const lease=sharedCamera.claim(async()=>({getTracks:()=>[]}) as unknown as MediaStream,'game');await lease.ready;lease.release();await settle();expect(trackers).toHaveLength(1);
  window.dispatchEvent(new Event('pageshow'));await settle();expect(trackers).toHaveLength(2);
});
it('cancels a late lazy import if disabled before initialization',async()=>{
  toggle().click();toggle().click();await settle();expect(trackers).toHaveLength(0);
});

it('sleeps the cursor render loop while no hand is visible, then wakes on a fresh hand',async()=>{
  toggle().click();await settle();expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  vi.mocked(requestAnimationFrame).mock.calls[0][0](performance.now()+500);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  const landmarks=Array.from({length:21},()=>({x:.5,y:.5,z:0}));landmarks[5].x=.43;landmarks[17].x=.57;landmarks[4].x=.38;
  trackers[0].callbacks.onFrame({timestampMs:performance.now(),landmarks,worldLandmarks:[],inferenceMs:1});
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});
