import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoseFrame } from '../tracking/types';

const tracker = vi.hoisted(()=>({ callbacks:null as null|{onFrame:(frame:PoseFrame)=>void;onStatus:(status:{state:string;message:string})=>void},
  dispose:vi.fn(),start:vi.fn(async()=>{}),width:vi.fn(),instances:0 }));
vi.mock('../tracking/CameraPoseTracker',()=>({CameraPoseTracker:class{
  constructor(_video:HTMLVideoElement,callbacks:typeof tracker.callbacks){tracker.callbacks=callbacks;tracker.instances++;}
  dispose=tracker.dispose;start=tracker.start;setInputWidth=tracker.width;
}}));
import { JumperCamera } from './JumperCamera';

function standing(timestampMs:number,rise=0):PoseFrame{
  const landmarks=Array.from({length:33},()=>({x:.5,y:.5-rise,z:0,visibility:.99}));
  for(const [index,x,y] of [[0,.5,.1],[11,.4,.24],[12,.6,.24],[23,.44,.5],[24,.56,.5],[25,.44,.68],[26,.56,.68],[27,.44,.86],[28,.56,.86]])
    landmarks[index]={x,y:y-rise,z:0,visibility:.99};
  return {timestampMs,landmarks,worldLandmarks:[],inferenceMs:5};
}
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();tracker.callbacks=null;tracker.instances=0;});

describe('Jumper camera adapter',()=>{
  it('calibrates locally, bridges each measured jump once and optionally auto-runs',async()=>{
    const jump=vi.fn(),status=vi.fn(),camera=new JumperCamera({} as HTMLVideoElement,jump,status);
    expect(await camera.start()).toBe(true);expect(tracker.width).toHaveBeenCalledWith(320);
    for(let time=0;time<=1500;time+=50)tracker.callbacks!.onFrame(standing(time));
    expect(camera.input(true)).toMatchObject({tracked:true,calibrated:true,runSpeed:1,jump:false});
    expect(camera.input(false).runSpeed).toBe(0);
    tracker.callbacks!.onFrame(standing(1550,.08));tracker.callbacks!.onFrame(standing(1600,.08));
    expect(jump).toHaveBeenCalledTimes(1);expect(camera.input(true).jump).toBe(false);
    camera.stop();expect(tracker.dispose).toHaveBeenCalled();expect(camera.input(true).tracked).toBe(false);
  });
  it('drops stale data and stops after an error instead of allowing ghost inputs',async()=>{
    let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const camera=new JumperCamera({} as HTMLVideoElement,vi.fn(),vi.fn());await camera.start();
    tracker.callbacks!.onFrame(standing(0));expect(camera.input(true).tracked).toBe(true);
    now+=501;expect(camera.input(true).tracked).toBe(false);
    tracker.callbacks!.onFrame(standing(50));tracker.callbacks!.onStatus({state:'error',message:'camera ended'});
    expect(camera.input(true).tracked).toBe(false);camera.stop();
  });
  it('does not acquire a camera when canceled during the lazy import',async()=>{
    const camera=new JumperCamera({} as HTMLVideoElement,vi.fn(),vi.fn());
    const pending=camera.start();camera.stop();expect(await pending).toBe(false);expect(tracker.instances).toBe(0);
  });
  it('offers a steadier profile and safely recalibrates on a response change',async()=>{
    const jump=vi.fn(),camera=new JumperCamera({} as HTMLVideoElement,jump,vi.fn());
    camera.setResponse('steady');await camera.start();expect(tracker.width).toHaveBeenLastCalledWith(480);
    for(let time=0;time<=1500;time+=50)tracker.callbacks!.onFrame(standing(time));
    expect(camera.input(true).calibrated).toBe(true);
    camera.setResponse('quick');expect(tracker.width).toHaveBeenLastCalledWith(320);
    expect(camera.input(true).tracked).toBe(false);
    tracker.callbacks!.onFrame(standing(1550,.08));
    expect(camera.input(true).calibrated).toBe(false);expect(jump).not.toHaveBeenCalled();
    camera.stop();
  });
  it('passes a torso-only duck into gameplay without firing a jump',async()=>{
    const jump=vi.fn(),camera=new JumperCamera({} as HTMLVideoElement,jump,vi.fn());await camera.start();
    for(let time=0;time<=1500;time+=50)tracker.callbacks!.onFrame(standing(time));
    const bent=standing(1550);
    for(const i of [25,26,27,28])bent.landmarks[i].visibility=0;
    for(const i of [11,12])bent.landmarks[i].y=.38;
    for(const i of [23,24])bent.landmarks[i].y=.51;
    tracker.callbacks!.onFrame(bent);
    expect(camera.input(true)).toMatchObject({crouch:true,tracked:true,calibrated:true,runSpeed:1});
    expect(jump).not.toHaveBeenCalled();camera.stop();
  });
});
