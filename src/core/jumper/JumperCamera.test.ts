import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PoseFrame } from '../tracking/types';
import type { SwordFrame } from '../tracking/sword/types';

const tracker = vi.hoisted(() => ({
  callbacks: {} as { onFrame?: (frame: PoseFrame) => void; onStatus?: (status: { state: string; message: string }) => void },
  detach: vi.fn(), start: vi.fn<() => Promise<boolean>>(), claim: vi.fn(), release: vi.fn(),
}));
vi.mock('../tracking/CameraFeed', () => ({
  cameraFeed: {
    video: {}, whenReady: tracker.start,
    onBody(receive: (frame: PoseFrame) => void) { tracker.callbacks.onFrame = receive; return tracker.detach; },
    onStatus(receive: (status: { state: string; message: string }) => void) {
      tracker.callbacks.onStatus = receive;
      receive({ state: 'tracking', message: 'ready' });
      return () => { tracker.callbacks.onStatus = undefined; };
    },
    claimInput: tracker.claim, publishSword: vi.fn(),
  },
}));
const sword = vi.hoisted(()=>({ frames: [] as ((frame: SwordFrame | null)=>void)[], start:vi.fn(), stop:vi.fn(), fail:false }));
vi.mock('../tracking/sword/CameraSwordTracker',()=>({CameraSwordTracker:class{
  running=false;
  constructor(_video:HTMLVideoElement,onFrame:(frame:SwordFrame|null)=>void){sword.frames.push(onFrame);}
  start(){sword.start();if(sword.fail)throw new Error('sword unavailable');this.running=true;}
  stop(){sword.stop();this.running=false;}
}}));
import { JumperCamera } from './JumperCamera';

function standing(timestampMs:number,rise=0):PoseFrame{
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5-rise,z:0,visibility:.99}));
  for(const [index,x,y] of [[0,.5,.1],[11,.4,.24],[12,.6,.24],[23,.44,.5],[24,.56,.5],[25,.44,.68],[26,.56,.68],[27,.44,.86],[28,.56,.86]])
    landmarks[index]={x,y:y-rise,z:0,visibility:.99};
  return {timestampMs,landmarks,worldLandmarks:[],inferenceMs:5};
}
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();tracker.callbacks={};sword.frames=[];sword.fail=false;});

beforeEach(() => { tracker.start.mockResolvedValue(true); tracker.claim.mockReturnValue(tracker.release); });
describe('Jumper camera adapter',()=>{
  it('hands input ownership back to the menu without reopening its camera', async () => {
    const camera = new JumperCamera( vi.fn(), vi.fn());
    expect(await camera.start()).toBe(true);
    camera.setGameplayActive(true);
    camera.setGameplayActive(false);
    expect(tracker.claim).toHaveBeenCalledOnce();
    expect(tracker.release).toHaveBeenCalledOnce();
    expect(tracker.start).toHaveBeenCalledOnce();
    expect(tracker.detach).not.toHaveBeenCalled();
    camera.stop();
  });
  it('keeps sword tracking opt-in, shares the video and drops stale or canceled results',async()=>{
    let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const camera=new JumperCamera(vi.fn(),vi.fn());
    expect(await camera.setSwordEnabled(true)).toBe(false);
    await camera.start();expect(sword.start).not.toHaveBeenCalled();
    expect(await camera.setSwordEnabled(true)).toBe(true);
    const callback=sword.frames[0];
    const frame:SwordFrame={timestampMs:100,base:{x:.3,y:.5},tip:{x:.7,y:.5},confidence:.9,imageAspectRatio:4/3,source:'color-bands-2d'};
    callback(frame);expect(camera.swordInput()).toEqual(frame);
    now=221;expect(camera.swordInput()).toBe(null);
    await camera.setSwordEnabled(false);callback({...frame,timestampMs:221});
    expect(camera.swordInput()).toBe(null);expect(sword.stop).toHaveBeenCalled();
    const pending=camera.setSwordEnabled(true);camera.stop();
    expect(await pending).toBe(false);
    expect(sword.start).toHaveBeenCalledTimes(1);
  });
  it('isolates sword failure from body tracking and stops sword tracking on camera errors',async()=>{
    const camera=new JumperCamera(vi.fn(),vi.fn());await camera.start();
    sword.fail=true;expect(await camera.setSwordEnabled(true)).toBe(false);
    tracker.callbacks.onFrame!(standing(0));expect(camera.input(true).tracked).toBe(true);
    sword.fail=false;expect(await camera.setSwordEnabled(true)).toBe(true);
    tracker.callbacks.onStatus!({state:'error',message:'camera ended'});
    expect(camera.swordInput()).toBe(null);expect(sword.stop).toHaveBeenCalledTimes(2);
    camera.stop();
  });
  it('calibrates locally, bridges each measured jump once and optionally auto-runs',async()=>{
    const jump=vi.fn(),status=vi.fn(),camera=new JumperCamera(jump,status);
    expect(await camera.start()).toBe(true);
    for(let time=0;time<=1500;time+=50)tracker.callbacks.onFrame!(standing(time));
    expect(camera.input(true)).toMatchObject({tracked:true,calibrated:true,runSpeed:1,jump:false});
    expect(camera.input(false).runSpeed).toBe(0);
    tracker.callbacks.onFrame!(standing(1550,.08));tracker.callbacks.onFrame!(standing(1600,.08));
    expect(jump).toHaveBeenCalledTimes(1);expect(camera.input(true).jump).toBe(false);
    camera.stop();expect(tracker.detach).toHaveBeenCalled();expect(camera.input(true).tracked).toBe(false);
  });
  it('drops stale data and stops after an error instead of allowing ghost inputs',async()=>{
    let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const camera=new JumperCamera(vi.fn(),vi.fn());await camera.start();
    tracker.callbacks.onFrame!(standing(0));expect(camera.input(true).tracked).toBe(true);
    now+=501;expect(camera.input(true).tracked).toBe(false);
    tracker.callbacks.onFrame!(standing(50));tracker.callbacks.onStatus!({state:'error',message:'camera ended'});
    expect(camera.input(true).tracked).toBe(false);camera.stop();
  });
  it('does not resume its body subscription after cancellation',async()=>{
    const camera=new JumperCamera(vi.fn(),vi.fn());
    const pending=camera.start();camera.stop();expect(await pending).toBe(false);expect(tracker.detach).toHaveBeenCalledOnce();
  });
  it('offers a steadier profile and safely recalibrates on a response change',async()=>{
    const jump=vi.fn(),camera=new JumperCamera(jump,vi.fn());
    camera.setResponse('steady');await camera.start();
    for(let time=0;time<=1500;time+=50)tracker.callbacks.onFrame!(standing(time));
    expect(camera.input(true).calibrated).toBe(true);
    camera.setResponse('quick');
    expect(camera.input(true).tracked).toBe(false);
    tracker.callbacks.onFrame!(standing(1550,.08));
    expect(camera.input(true).calibrated).toBe(false);expect(jump).not.toHaveBeenCalled();
    camera.stop();
  });
  it('passes a torso-only duck into gameplay without firing a jump',async()=>{
    const jump=vi.fn(),camera=new JumperCamera(jump,vi.fn());await camera.start();
    for(let time=0;time<=1500;time+=50)tracker.callbacks.onFrame!(standing(time));
    const bent=standing(1550);
    for(const i of [25,26,27,28])bent.landmarks[i].visibility=0;
    for(const i of [11,12])bent.landmarks[i].y=.38;
    for(const i of [23,24])bent.landmarks[i].y=.51;
    tracker.callbacks.onFrame!(bent);
    expect(camera.input(true)).toMatchObject({crouch:true,tracked:true,calibrated:true,runSpeed:1});
    expect(jump).not.toHaveBeenCalled();camera.stop();
  });
});
