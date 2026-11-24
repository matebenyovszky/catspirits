import { expect, it } from 'vitest';
import { FestivalControls, horizontalAngle } from './controls';
import { handFixture } from '../robot/handFixture';
import { type SwordFrame, SWORD_MAX_AGE_MS } from '../tracking/sword/types';

const wand = (t:number,x=.5,y=.45,dx=.18,dy=0,media=t):SwordFrame => ({
  base:{x:1-x+dx,y:y-dy}, tip:{x:1-x,y}, timestampMs:t, mediaTimeMs:media,
  source:'four-ring-2d', visibleRings:4, confidence:.95, imageAspectRatio:16/9,
});

it('uses the mirrored measured tip and latches a slash for exactly one game tick',()=>{
  const controls=new FestivalControls();
  controls.sword(wand(100,.35),100,false);
  controls.sword(wand(145,.45),150,false);
  controls.sword(wand(165,.46),170,false);
  const hit=controls.read(170,true)!;
  expect(hit).toMatchObject({action:true,angle:0});
  expect(hit.x).toBeCloseTo(.46);
  expect(controls.read(185,true)?.action).toBe(false);
  controls.sword(wand(200,.62),205,false);
  expect(controls.read(210,true)?.action).toBe(false);
});

it('does not renew a stale wand from duplicates, late messages, or a repeated media frame',()=>{
  const controls=new FestivalControls();
  controls.sword(wand(200,.5,.4,.15,0,20),202,false);
  controls.sword(wand(190,.38,.4,.15,0,10),210,false);
  controls.sword(wand(255,.34,.4,.15,0,20),258,false);
  expect(controls.read(265,true)).toMatchObject({x:.5,action:false});
  expect(controls.read(201+SWORD_MAX_AGE_MS,true)).toBeNull();
  controls.sword(wand(330,.34,.4,.15,0,20),333,false);
  expect(controls.read(335,true)).toBeNull();
  controls.sword(wand(340,.33),345,false);
  expect(controls.read(345,true)?.action).toBe(false);
});

it('starts a new motion baseline after explicit loss, media rewind, and invalid geometry',()=>{
  const controls=new FestivalControls();
  controls.sword(wand(100),101,false);controls.sword(null,115,false);
  controls.sword(wand(98,.7),120,false);expect(controls.read(120,true)).toBeNull();
  controls.sword(wand(130,.8),135,false);
  controls.sword(wand(145,.4,.45,.15,0,10),150,false);
  expect(controls.read(150,true)?.action).toBe(false);
  controls.sword(wand(160,.4,.4,0,0),165,false);expect(controls.read(165,true)).toBeNull();
  controls.sword(wand(170,.56),171,false);expect(controls.read(171,true)?.action).toBe(false);
});

it('allows one hold-to-place per stop and rearms after deliberately moving the wand',()=>{
  const controls=new FestivalControls();
  const sample=(t:number,x:number)=>{controls.sword(wand(t,x),t,true);return controls.read(t,true)?.action;};
  const actions=[];
  for(let i=0;i<25;i++)if(sample(i*50,i<15?.55:.72))actions.push(i);
  expect(actions).toEqual([10]);
  expect(sample(1250,.72)).toBe(true);expect(sample(1300,.72)).toBe(false);
});

it('measures physical slope in camera aspect units and holds the tilt sign across vertical jitter',()=>{
  const controls=new FestivalControls();
  controls.sword(wand(10,.5,.65,.1,.1),12,false);
  expect(controls.read(12,true)?.angle).toBeCloseTo(Math.atan(9/16));
  controls.sword(wand(60,.5,.65,.003,.27),62,false);
  const nearVertical=controls.read(62,true)!.angle;
  controls.sword(wand(100,.5,.65,-.002,.27),102,false);
  expect(controls.read(102,true)!.angle).toBeCloseTo(nearVertical,1);
  expect(horizontalAngle(.1,.4)).toBe(horizontalAngle(-.1,-.4));
  expect(horizontalAngle(0,-1)).toBe(horizontalAngle(0,1));
});

it('requires an open hand before a pinch, preserves a pending edge across duplicate or late frames and does not repeat it',()=>{
  const controls=new FestivalControls();
  for(const t of [0,60,120,180])controls.hand(handFixture(t,true),t);
  expect(controls.read(180,true)?.action).toBe(false);
  for(const t of [200,260,320,380])controls.hand(handFixture(t,false),t);
  controls.hand(handFixture(400,true),400);controls.hand(handFixture(465,true),465);
  controls.hand(handFixture(465,false),470);controls.hand(handFixture(430,false),475);
  expect(controls.read(480,true)?.action).toBe(true);
  controls.hand(handFixture(520,true),520);expect(controls.read(525,true)?.action).toBe(false);
});

it('cannot fire a pending pinch after switching hands, dropping tracking, or receiving invalid time',()=>{
  const c=new FestivalControls();
  for(const t of [0,80,165])c.hand(handFixture(t),t);
  c.hand(handFixture(185,true),185);c.hand(handFixture(245,true),245);
  c.hand({...handFixture(265,true),handedness:'left'},265);
  expect(c.read(270,true)?.action).toBe(false);
  expect(c.read(530,true)).toBeNull();
  c.hand(handFixture(535,true),535);c.hand(handFixture(610,true),610);
  expect(c.read(615,true)?.action).toBe(false);
  c.hand(handFixture(NaN),635);expect(c.read(640,true)).toBeNull();
});
