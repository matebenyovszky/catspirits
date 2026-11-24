import { expect, it } from 'vitest';
import { createMission } from './missions';
import { FestivalControls } from './controls';
import type { FestivalGame, FestivalInput } from './types';

const open:FestivalInput = {x:.5, y:.5, angle:0, action:false};
const frame = 1/60;
function run(game:FestivalGame, seconds:number, position:(t:number)=>Partial<FestivalInput>) {
  const events: string[]=[];
  for(let i=0;i<Math.round(seconds/frame);i++) {
    const cue=game.update(frame,{...open,...position(i*frame)});
    if(cue)events.push(cue);
  }
  return events;
}

it('requires a real action in the jungle vine window; idle and blind early slashes lose',()=>{
  const idle=createMission('jungle');
  const events=run(idle,70,t=>({action:t<.2}));
  expect(idle.lost).toBe(true);
  expect(events.filter(e=>e==='wrong')).toHaveLength(3);
  const score=idle.score;
  run(idle,5,()=>({action:true}));
  expect(idle.score).toBe(score);
});
it('allows a perfect run of dodges and precisely timed cuts with one wand',()=>{
  const game=createMission('jungle');
  const lanes=[1,0,2,1,0,1,2,0,2,1,0,2];
  const events:string[]=[];
  let gate=0,distance=3.8;
  while(gate<lanes.length){
    const barrier=gate%3===1;
    const speed=1.25+gate*.034;
    const action=distance>1 && distance-speed*frame<=1;
    const cue=game.update(frame,{...open,x:.5+((barrier?(lanes[gate]+1)%3:lanes[gate])-1)*.29,action});
    if(cue)events.push(cue);
    distance-=speed*frame;
    if(distance<=-.2){gate++;distance+=4.5;}
  }
  expect(game.won).toBe(true);
  expect(events).toEqual(Array(12).fill('correct'));
});
it('tests ferry clearance and cargo balance independently',()=>{
  const safe=createMission('ferry'), tilted=createMission('ferry'), missed=createMission('ferry');
  const centers=[.58,.40,.66,.49,.34,.63,.44,.55];
  let gate=0;
  for(let i=0;i<4200&&!safe.won;i++)if(safe.update(frame,{...open,x:.31,y:centers[gate]+.04})==='correct')gate++;
  expect(safe.won).toBe(true);expect(gate).toBe(8);
  run(tilted,10,()=>({x:.31,y:.62,angle:1}));expect(tilted.lost).toBe(true);
  run(missed,32,()=>({x:.31,y:.87}));expect(missed.lost).toBe(true);
});
it('rewards patient leading around the ponds and cannot gather distant strays from the pen',()=>{
  const herd=createMission('herd');
  run(herd,4,()=>({x:.842,y:.44,action:true}));expect(herd.score).toBe(0);
  let seconds=4;
  for(const [x,y] of [[.19,.38],[.23,.65],[.12,.45]]){
    const waypoints=[[x,y],[.32,.50],[.62,.50],[.842,.44]];
    let from=waypoints[0];
    for(const point of waypoints) {
      run(herd,3.7,t=>{
        const f=Math.min(1,t/2.65);
        return {x:from[0]+(point[0]-from[0])*f,y:from[1]+(point[1]-from[1])*f,action:t<frame};
      });
      seconds+=3.7;from=point;
    }
  }
  expect(herd.won).toBe(true);expect(seconds).toBeLessThan(75);expect(herd.score).toBeGreaterThan(5*120);
});


/** Feed mirrored camera observations at 15 Hz into a 60 Hz game, with small
 * position and angle noise and a short tracking gap during the round. */
function wandReplay(game:FestivalGame) {
  const controls=new FestivalControls();
  let tick=0, missedFrames=0;
  return {
    step(x:number,y:number,angle=0) {
      const now=tick*1000/60;
      if(tick%4===0 && !(tick>=360 && tick<=384)){
        const tipX=x+.002*Math.sin(tick);
        const tipY=y+.002*Math.cos(tick*.71);
        const tilt=angle+.04+.025*Math.sin(tick*.38);
        const wandDx=tipX < .2 ? -.15 : .15;
        const aspect=16/9;
        controls.sword({
          base:{x:1-tipX+wandDx, y:tipY-wandDx*aspect*Math.tan(tilt)},
          tip:{x:1-tipX,y:tipY}, imageAspectRatio:aspect,
          source:'four-ring-2d',confidence:.96,timestampMs:now,visibleRings:4,
        }, now, false);
      }
      tick++;
      const input=controls.read(now,true);
      if(!input){missedFrames++;return null;}
      return game.update(frame,input);
    },
    get time() {return tick*frame;},
    get missed() {return missedFrames;},
  };
}

it('carries the passenger across all eight gates with noisy 15 Hz mirrored wand observations',()=>{
  const game=createMission('ferry'), replay=wandReplay(game);
  const centers=[.58,.40,.66,.49,.34,.63,.44,.55];
  let gate=0, y=.55;
  while(!game.won&&!game.lost&&replay.time<75){
    const target=centers[gate]+.04;
    y+=Math.sign(target-y)*Math.min(.006,Math.abs(target-y));
    if(replay.step(.43,y,.04*Math.sin(replay.time))==='correct')gate++;
  }
  expect(replay.missed).toBeGreaterThan(0);
  expect(gate).toBe(8);expect(game.won).toBe(true);expect(replay.time).toBeLessThan(50);
});

it('leads the flock home through the actual mirrored wand controls inside the round',()=>{
  const game=createMission('herd'), replay=wandReplay(game);
  for(const [x,y] of [[.19,.38],[.23,.65],[.12,.45]]){
    const path=[[x,y],[.32,.50],[.62,.50],[.842,.44]];
    let from=path[0];
    for(const to of path){
      for(let i=0;i<230&&!game.won;i++){
        const progress=Math.min(1,i/160);
        replay.step(from[0]+(to[0]-from[0])*progress,from[1]+(to[1]-from[1])*progress);
      }
      from=to;
    }
  }
  expect(replay.missed).toBeGreaterThan(0);
  expect(game.won).toBe(true);expect(replay.time).toBeLessThan(75);
});
