import { expect, it } from 'vitest';
import { HandGesture } from './HandGesture';
import type { PoseFrame } from '../../core/tracking/types';
function frame(time:number, closed=false, side:'left'|'right'='right'):PoseFrame {
  const landmarks=Array.from({length:21},()=>({x:.5,y:.5,z:0}));
  landmarks[5].x=.43;landmarks[17].x=.57;landmarks[8]={x:.5,y:.32,z:0};landmarks[4]={x:closed?.51:.38,y:.32,z:0};
  return {timestampMs:time,landmarks,worldLandmarks:[],inferenceMs:10,handedness:side};
}
it('requires an open hand before one debounced pinch, and never repeats while held',()=>{
  const gesture=new HandGesture();
  for(let time=0;time<500;time+=50)expect(gesture.update(frame(time,true),time)?.edge).toBeNull();
  for(let time=500;time<=700;time+=50)gesture.update(frame(time),time);
  expect(gesture.update(frame(750,true),750)?.edge).toBeNull();
  expect(gesture.update(frame(820,true),820)?.edge).toBe('down');
  for(let time=850;time<1200;time+=50)expect(gesture.update(frame(time,true),time)?.edge).toBeNull();
  expect(gesture.update(frame(1200),1200)?.edge).toBeNull();
  expect(gesture.update(frame(1270),1270)?.edge).toBe('up');
});
it('loss, stale frames and switching hands never produce a release click',()=>{
  for(const loss of ['empty','stale','switch'] as const){
    const gesture=new HandGesture();for(let t=0;t<=200;t+=50)gesture.update(frame(t),t);
    gesture.update(frame(250,true),250);expect(gesture.update(frame(320,true),320)?.edge).toBe('down');
    if(loss==='empty')expect(gesture.update({...frame(350),landmarks:[]},350)).toBeNull();
    if(loss==='stale')expect(gesture.update(frame(350),900)).toBeNull();
    const fresh=gesture.update(frame(1000,true,loss==='switch'?'left':'right'),1000);
    expect(fresh?.edge).toBeNull();expect(fresh?.held).toBe(false);
  }
});
it('rejects implausible geometry and maps a mirrored palm to viewport edges',()=>{
  const gesture=new HandGesture(), bad=frame(0);bad.landmarks[4].x=NaN;expect(gesture.update(bad,0)).toBeNull();
  const left=frame(50);left.landmarks[9]={x:.9,y:.05,z:0};expect(gesture.update(left,50)).toMatchObject({x:0,y:0});
  gesture.reset();const right=frame(100);right.landmarks[9]={x:.05,y:.95,z:0};expect(gesture.update(right,100)).toMatchObject({x:1,y:1});
});
