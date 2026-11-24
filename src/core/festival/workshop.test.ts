import { expect, it, vi } from 'vitest';
import { bridgeSocket, brushDocks, Convoy, PulsePainter, QuarryRover } from './workshop';
import type { FestivalInput } from './types';

const input = (x: number,y: number,action=false,angle=0): FestivalInput =>
  ({x:x/800,y:y/560,action,angle});
const neutral = input(400,260);
const hold = (game: Convoy | PulsePainter | QuarryRover, p: FestivalInput, seconds: number) => {
  for(let i=0;i<Math.ceil(seconds*60);i++) game.update(1/60,p);
};

it('only confirms connected tiles and transports every convoy to its dock',()=>{
  const game=new Convoy();
  const initial=bridgeSocket(3,0);
  hold(game,input(initial.x,initial.y,true),1);
  expect(game.trail).toEqual([1]);
  for (const rows of [[1,2,2,1,2,2],[1,1,0,1,1,0],[1,1,1,1,1,1]]) {
    for(let i=0;i<rows.length;i++) {
      const p=bridgeSocket(i+1,rows[i]);
      hold(game,input(p.x,p.y),.52);
      expect(game.trail[i+1]).toBe(rows[i]);
    }
    hold(game,input(30,30),9);
  }
  expect(game.won).toBe(true);
  expect(game.score).toBeGreaterThan(400);
});

it('spends battery only while the convoy waits and ends if never supplied',()=>{
  const game=new Convoy();
  hold(game,input(20,20),16);
  expect(game.lost).toBe(true);
  expect(game.won).toBe(false);
});

it('requires the matching brush and an ordered outline even when tapping rapidly',()=>{
  const game=new PulsePainter();
  const dock=brushDocks[1];
  hold(game,input(dock.x,dock.y),.25);
  hold(game,input(265,335,true),.4);
  expect(game.stroke).toBe(0);
  hold(game,input(brushDocks[0].x, brushDocks[0].y),.25);
  hold(game,input(488,335,true),.2);
  expect(game.stroke).toBe(0);
  for (const [x,y] of [[265,335],[265,218],[320,247],[375,196],[428,241],[488,206],[488,335],[380,363],[265,335]]) {
    hold(game,input(x,y),.12);
  }
  expect(game.motif).toBe(1);
  expect(game.score).toBeGreaterThan(90);
  expect(game.brush).toBe(-1);
});

it('scores closure against the supplied audio beat phase',()=>{
  function finishFirst(beatPhase:number) {
    const game = new PulsePainter();
    const dock = brushDocks[0];
    hold(game,input(dock.x,dock.y),.25);
    for(const [x,y] of [[265,335],[265,218],[320,247],[375,196],[428,241],[488,206],[488,335],[380,363],[265,335]]) {
      game.update(1/24,{...input(x,y),beatPhase});
    }
    return game.score;
  }
  expect(finishFirst(0) - finishFirst(.5)).toBe(35);
});

it('paints the complete three-colour mural by continuously moving an actual tip through the displayed shape',()=>{
  const game=new PulsePainter();
  const outlines = [
    [[265,335],[265,218],[320,247],[375,196],[428,241],[488,206],[488,335],[380,363],[265,335]],
    [[293,278],[310,255],[354,256],[370,272],[398,272],[414,255],[464,254],[451,287],[417,293],[399,276],[369,278],[343,297],[306,294],[293,278]],
    [[326,311],[358,311],[376,327],[392,307],[412,319],[444,306]],
  ];
  let x=400, y=275, frames=0;
  const sweepTo=(nextX:number,nextY:number) => {
    // Simulate a 24 Hz camera moving the tip at about 230 world pixels/s.
    const fromX=x, fromY=y;
    const steps=Math.max(1,Math.ceil(Math.hypot(nextX-x,nextY-y)/9.5));
    for(let i=1;i<=steps;i++){
      x=fromX+(nextX-fromX)*i/steps;
      y=fromY+(nextY-fromY)*i/steps;
      game.update(1/24,input(x,y));
      frames++;
    }
  };
  outlines.forEach((outline,index)=>{
    const dock=brushDocks[index];
    sweepTo(dock.x,dock.y);
    hold(game,input(x,y),.25);
    expect(game.brush).toBe(index);
    for(const [nextX,nextY] of outline) sweepTo(nextX,nextY);
    if(index<2){
      expect(game.motif).toBe(index+1);
      expect(game.won).toBe(false);
      hold(game,input(x,y),1);
    }
  });
  expect(frames/24+3).toBeLessThan(75);
  expect(game.won).toBe(true);
  expect(game.score).toBeGreaterThanOrEqual(350);
  const finalScore=game.score;
  hold(game,input(300,250,true),1);
  expect(game.score).toBe(finalScore);
});

it('allows a clean run by tilting a stationary wand and ends on three collisions',()=>{
  const course=[-.46,.53,.15,-.68,-.18,.65,.27,-.54,.58,0];
  const game=new QuarryRover();
  for(let i=0;i<75*60 && !game.won && !game.lost;i++){
    game.update(1/60,{...neutral,angle:course[game.gates]*.78});
  }
  expect(game.won).toBe(true);expect(game.hull).toBe(3);expect(game.score).toBe(900);
  const idle=new QuarryRover();hold(idle,input(0,0),75);
  expect(idle.lost).toBe(true);expect(idle.won).toBe(false);
  const score=idle.score; const gates=idle.gates;
  hold(idle,neutral,10);expect(idle.score).toBe(score);expect(idle.gates).toBe(gates);
});

it('renders fresh and changing scenes without a DOM or camera',()=>{
  const noop=()=>undefined;
  const ctx=new Proxy({createLinearGradient:()=>({addColorStop:noop}),fillRect:vi.fn()},{
    get(target,key){return Reflect.get(target,key)??noop;},
  });
  for(const game of [new Convoy(),new PulsePainter(),new QuarryRover()]){
    expect(()=>game.draw(ctx as unknown as CanvasRenderingContext2D,360,252)).not.toThrow();
    hold(game,neutral,.5);
    expect(()=>game.draw(ctx as unknown as CanvasRenderingContext2D,800,560)).not.toThrow();
  }
  expect(ctx.fillRect).toHaveBeenCalled();
});
