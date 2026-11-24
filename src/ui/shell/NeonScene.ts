import './neonScene.css';

type Game = 'blade' | 'pop' | 'robot';
const ink = '#39486b', mint = '#60f4ce', lavender = '#ae8dff', gold = '#ffbf66';

// Six real planes per solid, lit per face. All motion is composited CSS.
function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string): string {
  return `<i class="neon-solid" style="--x:${x}px;--y:${y}px;--z:${z}px;--w:${w}px;--h:${h}px;--d:${d}px;--c:${color}"><b></b><b></b><b></b><b></b><b></b><b></b></i>`;
}

function spirit(color: string): string {
  return box(0,0,0,50,44,42,color) + box(-13,-3,22,6,9,3,ink) + box(13,-3,22,6,9,3,ink)
    + box(-16,-26,0,11,13,14,color) + box(16,-26,0,11,13,14,color);
}

function prop(game: Game): string {
  if (game === 'blade') {
    const weapon = box(0,-51,0,24,102,12,mint) + box(0,-42,7,6,108,3,'#dffff8')
      + box(0,5,0,68,12,19,lavender) + box(0,30,0,14,42,14,ink) + box(0,54,0,21,10,20,gold);
    return `<div class="neon-swing">${weapon}</div><div class="neon-quarry">${spirit(lavender)}</div>`;
  }
  if (game === 'pop') return [mint,lavender,gold].map((color,index) =>
    `<div class="neon-target target-${index}"><div class="neon-hop" style="animation-delay:-${index * .8}s">${spirit(color)}</div></div>`).join('');
  const links = box(0,-23,0,25,69,25,'#9bbac6') + box(0,-58,0,36,32,34,lavender)
    + box(43,-58,0,64,17,20,'#cee4ed') + box(80,-51,0,22,27,23,ink)
    + box(80,-30,0,34,8,16,mint) + box(66,-20,0,7,18,15,mint) + box(94,-20,0,7,18,15,mint);
  return box(-40,27,0,51,28,52,ink) + `<div class="neon-boom">${links}</div>` + box(50,27,22,24,25,24,gold);
}

export function neonScene(game: Game): string {
  const skyline = [-105,-55,0,55,105].map((x,index) => {
    const height = [35,70,45,82,28][index];
    return box(x,42-height/2,-78,30,height,27,ink) + box(x,40-height,-78,32,4,29,index%2 ? lavender : mint);
  }).join('');
  return `<div class="shell-scene neon-diorama diorama-${game}" aria-hidden="true"><div class="neon-horizon"></div><div class="neon-stage"><div class="neon-orbit">
    ${box(0,62,0,218,25,145,'#263655')}${box(0,48,0,250,5,170,game==='pop'?lavender:mint)}${box(0,44,0,254,6,174,'#344367')}
    ${skyline}${prop(game)}</div></div></div>`;
}
