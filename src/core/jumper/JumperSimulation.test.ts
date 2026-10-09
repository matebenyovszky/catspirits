import { describe, expect, it } from 'vitest';
import { JumperSimulation, validateSave, freshSave, WORLDS, DUCK_GATE_HALF_DEPTH } from './JumperSimulation';
import type { MotionInput } from '../tracking/types';

const input: MotionInput = { tracked: true, calibrated: true, calibrationProgress: 1, runSpeed: 1, jump: false, crouch: false, lane: 0 };
function tick(game:JumperSimulation,seconds:number,controller?:(game:JumperSimulation)=>void,camera?:MotionInput){
  for(let i=0;i<seconds*120 && game.phase==='running';i++){controller?.(game);game.update(1/120,camera);}
}
function perfect(game:JumperSimulation){
  const gem=game.pickups.find(p=>p.kind==='crystal' && !p.resolved && p.distance>.3);
  if(gem)game.setLane(gem.lane);
  game.setDucking(game.obstacleKind==='duck' && game.runner.state.obstacleDistance<game.speed*.65);
  if(game.obstacleKind==='jump' && game.runner.state.height===0 && game.runner.state.obstacleDistance<game.speed*.4)game.jump();
}
function firstDuck():JumperSimulation{
  const game=new JumperSimulation();game.start(2);
  for(let i=0;i<2000 && game.phase==='running' && game.obstacleKind!=='duck';i++){perfect(game);game.update(1/120);}
  expect(game.obstacleKind).toBe('duck');expect(game.runner.state.cleared).toBe(2);return game;
}

describe('Cyber Jumper campaign',()=>{
  it.each(WORLDS.map((world,level)=>({name:world.name,level})))('$name is reachable and earns three stars with the advertised controls',({level})=>{
    const game=new JumperSimulation();game.start(level);tick(game,40,perfect);
    expect(game.phase).toBe(level===4?'victory':'level-complete');
    expect(game.runner.state).toMatchObject({cleared:8,missed:0});
    expect(game.crystals).toBeGreaterThanOrEqual(15);expect(game.stars).toBe(3);expect(game.hearts).toBe(3);
    expect(game.drainEvents().some(e=>e.type==='clear')).toBe(true);
  });
  it('plays all five worlds consecutively and accumulates the score',()=>{
    const game=new JumperSimulation();game.start();let score=0;
    for(let level=0;level<5;level++){
      expect(game.level).toBe(level);tick(game,40,perfect);expect(game.score).toBeGreaterThan(score);score=game.score;
      if(level<4)game.next();
    }
    expect(game.phase).toBe('victory');expect(game.progress).toBe(1);
  });
  it('counts collisions once and allows a retry of the current world',()=>{
    const game=new JumperSimulation();game.start(2);tick(game,40);
    expect(game.phase).toBe('game-over');expect(game.hearts).toBe(0);
    expect(game.drainEvents().filter(event=>event.type==='hit')).toHaveLength(3);
    game.retry();expect(game.phase).toBe('running');expect(game.level).toBe(2);expect(game.hearts).toBe(3);
    expect(game.runner.state.missed).toBe(0);expect(game.score).toBe(0);
  });
  it('uses a collected shield for one collision and consumes it',()=>{
    const game=new JumperSimulation();game.start();
    tick(game,40,g=>{
      const shield=g.pickups.find(p=>p.kind==='shield'&&!p.resolved);
      if(shield)g.setLane(shield.lane);
      if(g.runner.state.cleared<2 && g.runner.state.height===0 && g.runner.state.obstacleDistance<g.speed*.4)g.jump();
      if(g.runner.state.missed>=1)g.pause();
    });
    expect(game.runner.state.missed).toBe(1);expect(game.hearts).toBe(3);expect(game.shield).toBe(false);
    expect(game.drainEvents().some(e=>e.type==='shield' && e.value===-1)).toBe(true);
  });
  it('freezes physics, score and pickups while paused or camera tracking is missing',()=>{
    const game=new JumperSimulation();game.start();tick(game,.5);game.pause();
    const before=JSON.stringify({state:game.runner.state,pickups:game.pickups,elapsed:game.elapsed,score:game.score});
    game.jump();game.update(.05);expect(JSON.stringify({state:game.runner.state,pickups:game.pickups,elapsed:game.elapsed,score:game.score})).toBe(before);
    game.resume();game.jump();game.update(.05,{...input,tracked:false});
    expect(JSON.stringify({state:game.runner.state,pickups:game.pickups,elapsed:game.elapsed,score:game.score})).toBe(before);
    game.update(.05,input);expect(game.runner.state.height).toBe(0);
  });
  it('retries from the score checkpoint without farming the failed world',()=>{
    const game=new JumperSimulation();game.start();tick(game,40,perfect);const checkpoint=game.score;game.next();
    tick(game,40);expect(game.phase).toBe('game-over');expect(game.score).toBeGreaterThan(checkpoint);
    game.retry();expect(game.score).toBe(checkpoint);expect(game.level).toBe(1);
  });
  it('chill mode provides five lives and a slower but completable course',()=>{
    const game=new JumperSimulation();game.start(4,'chill');expect(game.hearts).toBe(5);expect(game.speed).toBeCloseTo(WORLDS[4].speed*.8);
    tick(game,40,perfect);expect(game.phase).toBe('victory');expect(game.stars).toBe(3);
  });
  it('bounds lane changes and rejects invalid deltas',()=>{
    const game=new JumperSimulation();game.start();game.move(-1);game.move(-1);expect(game.lane).toBe(-1);
    game.setLane(999);expect(game.lane).toBe(1);game.setLane(NaN);expect(game.lane).toBe(1);
    const distance=game.runner.state.distance;for(const dt of [NaN,Infinity,-1,0])game.update(dt);expect(game.runner.state.distance).toBe(distance);
    game.update(100);expect(game.runner.state.distance-distance).toBeLessThanOrEqual(game.speed*.05+.001);
  });
  it('a camera with calibrated torso control can clear the same course',()=>{
    const game=new JumperSimulation();game.start();tick(game,40,g=>{
      perfect(g);
    },input);expect(game.phase).toBe('level-complete');expect(game.stars).toBe(3);
  });
  it('previews four real sections, including future lane changes and a shield, without affecting scoring',()=>{
    const game=new JumperSimulation();game.start();
    const before=JSON.stringify({pickups:game.pickups,score:game.score,state:game.runner.state});
    const preview=game.lookAhead;
    expect(preview.map(section=>section.distance)).toEqual([8,17.5,27,36.5]);
    expect(preview.map(section=>section.lane)).toEqual([0,-1,1,0]);
    expect(preview[2].pickups.find(p=>p.kind==='shield')).toMatchObject({lane:0,distance:24.2});
    for(let i=0;i<10;i++)game.lookAhead;
    expect(JSON.stringify({pickups:game.pickups,score:game.score,state:game.runner.state})).toBe(before);
    tick(game,.5);expect(game.lookAhead[1].distance).toBeCloseTo(17.5-game.runner.state.distance);
  });
  it('keeps preview pickups in place when the next section becomes playable',()=>{
    const game=new JumperSimulation();game.start();
    while(game.runner.state.obstacleDistance-game.speed/120>=-1.5)game.update(1/120);
    const before=game.lookAhead[1];game.update(1/120);
    const after=game.lookAhead[0];
    expect(after.index).toBe(before.index);expect(after.lane).toBe(before.lane);
    expect(Math.abs(after.distance-before.distance)).toBeLessThan(game.speed/120+.001);
    expect(after.pickups.map(p=>[p.slot,p.kind,p.lane,p.height])).toEqual(before.pickups.map(p=>[p.slot,p.kind,p.lane,p.height]));
    after.pickups.forEach((pickup,index)=>expect(Math.abs(pickup.distance-before.pickups[index].distance)).toBeLessThan(game.speed/120+.001));
  });
  it('shows only remaining gates at the finish and freezes the preview while paused',()=>{
    const game=new JumperSimulation();game.start();
    while(game.phase==='running' && game.runner.state.cleared<7){perfect(game);game.update(1/120);}
    tick(game,.6,perfect);
    expect(game.lookAhead).toHaveLength(1);expect(game.lookAhead[0].index).toBe(7);
    game.pause();const before=game.lookAhead;game.update(.05);expect(game.lookAhead).toEqual(before);
    game.resume();tick(game,5,perfect);expect(game.phase).toBe('level-complete');expect(game.lookAhead).toEqual([]);
  });
});

describe('later-world duck gates',()=>{
  it('introduces two duck gates in world three and increases variety in later worlds',()=>{
    for(let level=0;level<5;level++){
      const game=new JumperSimulation();game.start(level);
      expect(game.lookAhead[0].kind).toBe('jump');
      if(level<2)expect(game.lookAhead.every(section=>section.kind==='jump')).toBe(true);
      else expect(game.lookAhead.some(section=>section.kind==='duck')).toBe(true);
    }
    const game=firstDuck();
    expect(game.lookAhead[0]).toMatchObject({index:2,kind:'duck',lane:1});
    expect(game.pickups.filter(p=>p.kind==='crystal').every(p=>p.height===.25)).toBe(true);
  });
  it('rewards one sustained duck only after the entire beam is passed',()=>{
    const game=firstDuck();game.setDucking(true);game.setLane(1);
    while(game.runner.state.obstacleDistance>0)game.update(1/120);
    expect(game.runner.state.cleared).toBe(2);
    while(game.runner.state.obstacleDistance>-DUCK_GATE_HALF_DEPTH)game.update(1/120);
    expect(game.runner.state).toMatchObject({cleared:3,missed:0});
    expect(game.hearts).toBe(3);expect(game.crystals).toBeGreaterThanOrEqual(5);
    expect(game.drainEvents().filter(event=>event.type==='duck')).toHaveLength(1);
  });
  it('rejects standing up halfway through the beam',()=>{
    const game=firstDuck();game.setDucking(true);game.setLane(1);
    while(game.runner.state.obstacleDistance>-.1)game.update(1/120);
    game.setDucking(false);
    while(game.runner.state.obstacleDistance>-DUCK_GATE_HALF_DEPTH)game.update(1/120);
    expect(game.runner.state).toMatchObject({cleared:2,missed:1});expect(game.hearts).toBe(2);
  });
  it.each(['stand','jump'] as const)('requires ducking instead of %s at an overhead gate',action=>{
    const game=firstDuck();
    while(game.runner.state.cleared+game.runner.state.missed===2){
      if(action==='jump' && game.runner.state.height===0 && game.runner.state.obstacleDistance<game.speed*.4)game.jump();
      game.update(1/120);
    }
    expect(game.runner.state).toMatchObject({cleared:2,missed:1});
  });
  it('keeps a manual camera approach moving while bent legs cannot provide running contacts',()=>{
    const game=firstDuck();game.update(1/120,input);const before=game.runner.state.distance;
    tick(game,2.2,undefined,{...input,crouch:true,runSpeed:0});
    expect(game.runner.state.distance).toBeGreaterThan(before+9);
    expect(game.runner.state).toMatchObject({cleared:3,missed:0});expect(game.ducking).toBe(true);
    const distance=game.runner.state.distance;game.update(.05,{...input,tracked:false});
    expect(game.ducking).toBe(false);game.update(.05,{...input,crouch:true,runSpeed:0});
    expect(game.runner.state.distance).toBe(distance);
  });
  it('supports click-only activation, suppresses jumps while held, and releases controls on pause/retry',()=>{
    const game=firstDuck();
    while(game.runner.state.obstacleDistance>game.speed*.4)game.update(1/120);
    game.duck();game.jump();tick(game,.7);
    expect(game.runner.state).toMatchObject({height:0,cleared:3,missed:0});
    game.setDucking(true);game.update(1/120);expect(game.ducking).toBe(true);
    game.pause();game.resume();game.update(1/120);expect(game.ducking).toBe(false);
    game.setDucking(true);game.update(1/120);game.retry();game.update(1/120);expect(game.ducking).toBe(false);
  });
});

describe('local progress storage',()=>{
  it('uses safe defaults for absent or damaged data',()=>{for(const raw of [null,'bad',[],{version:8}])expect(validateSave(raw)).toEqual(freshSave());});
  it('clamps imported values and prevents locked suit selection',()=>{
    expect(validateSave({version:1,best:-10,stars:[5,-2,NaN,2.8],suit:3,music:10,effects:-3,difficulty:'anything'})).toEqual({
      version:1,best:0,stars:[3,0,0,2,0],suit:0,music:1,effects:0,difficulty:'normal',
    });
  });
  it('retains legitimate progress, sound levels, difficulty and unlocked colors',()=>{
    const saved={version:1,best:12560,stars:[3,3,2,0,0],suit:2,music:.2,effects:.8,difficulty:'chill'};
    expect(validateSave(saved)).toEqual(saved);
  });
});
