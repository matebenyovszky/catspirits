import { expect, it } from 'vitest';
import { createMission } from './missions';
import { createWorkshop } from './workshop';
import { demoInput } from './demo';
import type { FestivalId } from './types';

const ids:FestivalId[]=['jungle','ferry','herd','build','paint','rover'];
it.each([15,30,60])('demonstrates the real objective of each cabinet in twelve seconds at %i Hz',hz=>{
  for(const id of ids) {
    const game=id==='jungle'||id==='ferry'||id==='herd'?createMission(id):createWorkshop(id);
    const events:string[]=[];
    let actions=0;
    for(let i=1;i<=12*hz;i++){
      const sample=demoInput(id,i/hz,(i-1)/hz);
      const result=game.update(1/hz,sample);
      if(result) events.push(result);
      if(sample.action) actions++;
    }
    expect(game.score,id).toBeGreaterThan(0);
    expect(game.lost,id).toBe(false);
    expect(events,id).toContain('correct');
    expect(events,id).not.toContain('wrong');
    expect(actions).toBeLessThanOrEqual(3);
  }
});
