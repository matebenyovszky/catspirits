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

const space={width:390,height:844,allowDrag:false};
function moved(time:number,ratio:number,x:number,y=.5):PoseFrame{
  const f=frame(time);f.landmarks[4].x=.5+ratio*.14;f.landmarks[9]={x,y,z:0};return f;
}
function arm(gesture:HandGesture){for(let t=0;t<=200;t+=50)gesture.update(moved(t,.9,.5),t,space);}
it('anchors to the pre-pinch cursor before both closing and release move the palm',()=>{
  const g=new HandGesture();arm(g);const anchor=g.update(moved(230,.9,.5),230,space)!;
  expect(g.update(moved(260,.5,.54),260,space)).toMatchObject({x:anchor.x,y:anchor.y,edge:null});
  g.update(moved(300,.1,.57),300,space);expect(g.update(moved(370,.1,.59),370,space)).toMatchObject({x:anchor.x,y:anchor.y,edge:'down'});
  // Buttons must remain stable even with a long pinch and substantial drift.
  expect(g.update(moved(650,.1,.7),650,space)).toMatchObject({x:anchor.x,y:anchor.y,held:true});
  g.update(moved(700,.9,.63),700,space);expect(g.update(moved(770,.9,.6),770,space)).toMatchObject({x:anchor.x,y:anchor.y,edge:'up'});
  expect(g.update(moved(820,.9,.6),820,space)?.x).toBe(anchor.x);
  expect(g.update(moved(930,.9,.6),930,space)?.x).toBeLessThan(anchor.x);
});
it('permits deliberate canvas/range dragging after hold and movement hysteresis without an initial jump',()=>{
  const g=new HandGesture();arm(g);const drag={...space,allowDrag:true};const anchor=g.update(moved(230,.9,.5),230,drag)!;
  g.update(moved(260,.1,.53),260,drag);g.update(moved(330,.1,.55),330,drag);
  expect(g.update(moved(450,.1,.57),450,drag)?.x).toBe(anchor.x);
  g.update(moved(550,.1,.62),550,drag);expect(g.update(moved(650,.1,.62),650,drag)?.x).toBeCloseTo(anchor.x);
  const moving=g.update(moved(720,.1,.67),720,drag)!;expect(moving.x).toBeLessThan(anchor.x);
  g.update(moved(770,.9,.7),770,drag);expect(g.update(moved(840,.9,.72),840,drag)).toMatchObject({x:moving.x,edge:'up'});
  // A second pinch during release settling starts at the current drag endpoint.
  g.update(moved(880,.1,.72),880,drag);expect(g.update(moved(950,.1,.72),950,drag)?.edge).toBe('down');
  expect(g.update(moved(1170,.1,.72),1170,drag)?.x).toBeCloseTo(moving.x);
});
it('releases a half-pinch without clicking and drops its anchor after tracking loss',()=>{
  const g=new HandGesture();arm(g);g.update(moved(260,.5,.54),260,space);
  const reopened=g.update(moved(350,.9,.6),350,space)!;expect(reopened.edge).toBeNull();expect(reopened.x).toBeLessThan(.5);
  g.update({...moved(400,.1,.6),landmarks:[]},400,space);
  const reacquired=g.update(moved(450,.1,.3),450,space)!;expect(reacquired.held).toBe(false);expect(reacquired.edge).toBeNull();expect(reacquired.x).toBeGreaterThan(.5);
});
