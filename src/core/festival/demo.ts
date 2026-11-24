import type { FestivalId, FestivalInput } from './types';
import { bridgeSocket, brushDocks } from './workshop';

type Key = readonly [time: number, x: number, y: number, angle?: number];
type Gesture = { keys: readonly Key[]; actions?: readonly number[] };

function reach(time: number, p: {x:number;y:number}): Key {
  return [time, p.x / 800, p.y / 560];
}

function bridgeDemo(): Gesture {
  const keys: Key[] = [[0,.22,.56]];
  const route = [1,2,2,1,2,2];
  route.forEach((row,i) => {
    const p=bridgeSocket(i+1,row);
    const arrival=.55+i*1.03;
    keys.push(reach(arrival,p),reach(arrival+.51,p));
  });
  keys.push([8.7,.88,.58]);
  // The second robot has a different destination.
  [1,1,0].forEach((row,i) => {
    const p=bridgeSocket(i+1,row);
    const arrival=9.5+i;
    keys.push(reach(arrival,p),reach(arrival+.5,p));
  });
  return {keys};
}

const gallery: Record<FestivalId, Gesture> = {
  jungle:{
    keys:[[0,.5,.49],[1.7,.5,.49,-.12],[2.04,.45,.61,-.47],[2.29,.57,.38,.55],[2.75,.5,.49],
      [3.65,.79,.47],[8.58,.79,.47],[8.92,.74,.6,-.48],[9.19,.83,.38,.51],[9.65,.79,.48],[11.0,.5,.49],[12,.5,.56,-.2]],
    actions:[2.25,9.14],
  },
  ferry:{
    keys:[[0,.32,.51],[1.25,.37,.61,.08],[2.55,.37,.62,-.09],[4.95,.37,.62,0],[5.96,.37,.445,.09],
      [7.6,.37,.445,-.08],[9.76,.37,.445],[10.85,.37,.70,.06],[12,.37,.70,-.06]],
  },
  herd:{
    keys:[[0,.20,.42],[.85,.19,.4], [2.4,.28,.48], [3.8,.35,.50],[6.3,.61,.50],[8.85,.845,.44],[11,.845,.44],[12,.68,.50]],
    actions:[.55,3.3,6.1],
  },
  build:bridgeDemo(),
  paint:{
    // Pick up the mint nib, draw the ears and close the silhouette. Then
    // switch to violet and start the visor while the mint outline stays lit.
    keys:[reach(0,brushDocks[0]), reach(.45,brushDocks[0]),
      ...([[1.15,265,335],[1.9,265,218],[2.38,320,247],[2.96,375,196],[3.55,428,241],
        [4.14,488,206],[4.94,488,335],[5.66,380,363],[6.35,265,335]] as const).map(([t,x,y])=>reach(t,{x,y})),
      reach(7.5,brushDocks[1]),reach(8,brushDocks[1]),
      ...([[8.8,293,278],[9.18,310,255],[9.55,354,256],[9.91,370,272],[10.25,398,272],
        [10.56,414,255],[11.12,464,254],[11.49,451,287],[12,417,293]] as const).map(([t,x,y])=>reach(t,{x,y}))],
  },
  rover:{
    // Centered tip shows that tilting the wand alone steers. Brief height
    // changes also demonstrate throttle while saving time for the next gate.
    keys:[[0,.5,.38],[1.25,.5,.35,-.36],[3.3,.5,.35,-.36],
      [4.65,.5,.30,.414],[6.35,.5,.32,.414],[7.5,.5,.35,.117],
      [9.45,.5,.32,.117],[10.9,.5,.33,-.53],[12,.5,.33,-.53]],
  },
};

/** A short recorded-style performance, driven by the same control contract as
 * a real player. Events are emitted on crossing their timestamp even at 15 Hz. */
export function demoInput(id:FestivalId, elapsed:number, previousElapsed=elapsed-1/60): FestivalInput {
  const sequence=gallery[id];
  const t=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const keys=sequence.keys;
  let i=1;
  while(i<keys.length-1 && keys[i][0]<t) i++;
  const [a,b]=[keys[i-1],keys[i]];
  const f=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  const smooth=f*f*(3-2*f);
  return {
    x:a[1]+(b[1]-a[1])*smooth,
    y:a[2]+(b[2]-a[2])*smooth,
    angle:(a[3]??0)+((b[3]??0)-(a[3]??0))*smooth,
    action:sequence.actions?.some(event=>previousElapsed<event && t>=event)??false,
  };
}
