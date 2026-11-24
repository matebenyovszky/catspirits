import { FESTIVAL_SCORES } from '../audio/festivalScores';
import type { FestivalGame, FestivalInput } from './types';

type Cue = ReturnType<FestivalGame['update']>;
type Point = { x: number; y: number };
type Context = CanvasRenderingContext2D;
type Ink = readonly [string, string, string];

const mint: Ink = ['#a7fff0', '#38b5b5', '#28718c'];
const lilac: Ink = ['#e4baff', '#ae67e3', '#6048a6'];
const amber: Ink = ['#ffeaaa', '#eca456', '#a05e58'];
const metal: Ink = ['#758bb4', '#3c527d', '#263b64'];
const inkColors = [mint, lilac, amber];
const W = 800;
const H = 560;
const point = (x: number, y: number): Point => ({ x, y });
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function polygon(c: Context, vertices: Point[], color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) c.lineTo(vertices[i].x, vertices[i].y);
  c.closePath();
  c.fill();
}

function line(c: Context, a: Point, b: Point, color: string, width = 2) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
}

function circle(c: Context, p: Point, radius: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(p.x, p.y, radius, 0, Math.PI * 2);
  c.fill();
}

function face(c: Context, color: string, ax: number, ay: number, bx: number, by: number,
              cx: number, cy: number, dx: number, dy: number) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
  c.lineTo(cx, cy);
  c.lineTo(dx, dy);
  c.closePath();
  c.fill();
}

/** Each solid is three quads; draw faces directly without allocating vertex
 * arrays for every tile, wheel or distant tower on every frame. */
function block(c: Context, x: number, y: number, w: number, depth: number, h: number, ink: Ink) {
  const left = x - w, right = x + w, front = y + depth;
  face(c, ink[0], left, y, x, front, right, y, x, y-depth);
  face(c, ink[1], left, y, x, front, x, front+h, left, y+h);
  face(c, ink[2], x, front, right, y, right, y+h, x, front+h);
}

function sky(c: Context, horizon: number, upper: string, lower: string) {
  const gradient = c.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, upper);
  gradient.addColorStop(.65, lower);
  gradient.addColorStop(1, '#101529');
  c.fillStyle = gradient;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#c0d2e8';
  for (let i = 0; i < 32; i++) c.fillRect((i * 153 + 23) % W, (i * 79 + 17) % horizon, 2, 2);
}

function ring(c: Context, p: Point, radius: number, progress: number, color: string, width = 4) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.arc(p.x, p.y, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * clamp(progress, 0, 1));
  c.stroke();
}

function number(c: Context, p: Point, value: string, color: string, size: number) {
  c.font = `bold ${size}px system-ui,sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = color;
  c.fillText(value, p.x, p.y);
}

/** World time advances only while the festival shell receives fresh input. */
abstract class WorkshopGame implements FestivalGame {
  score = 0;
  won = false;
  lost = false;
  protected time = 0;
  protected cursor = point(W / 2, H / 2);
  protected feedback = 0;
  update(dt: number, input: FestivalInput): Cue {
    if (this.won || this.lost || ![dt,input.x,input.y,input.angle].every(Number.isFinite) || dt <= 0) return null;
    const step = Math.min(dt, .1);
    this.time += step;
    this.feedback = Math.max(0, this.feedback - step);
    this.cursor = point(clamp(input.x,0,1) * W, clamp(input.y,0,1) * H);
    return this.tick(step, input);
  }
  protected abstract tick(dt: number, input: FestivalInput): Cue;
  protected abstract scene(c: Context): void;
  draw(c: Context, width: number, height: number) {
    c.save();
    c.scale(width / W, height / H);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    this.scene(c);
    c.restore();
  }
}

const BRIDGE_COLUMNS = 7;
const BRIDGE_ROWS = 3;
const sockets = Array.from({ length: BRIDGE_COLUMNS }, (_, column) =>
  Array.from({ length: BRIDGE_ROWS }, (_, row) => point(157 + column*75 + row*34, 350 - column*14 + row*48)));
export function bridgeSocket(column: number, row: number): Point {
  return sockets[column][row];
}

/** A convoy follows the player's confirmed bridge, one tile at a time. */
export class Convoy extends WorkshopGame {
  readonly trail: number[] = [1];
  convoy = 0;
  crossing = 0;
  private hover = -1;
  private charge = 0;
  private delivered = 0;
  private reserve = 1;

  private blocked(column: number, row: number) {
    if (column === BRIDGE_COLUMNS - 1) return row !== this.dock();
    // One hazard per column leaves at least one reachable neighbour.
    // The penultimate tile always has a route to the dock.
    if (column === BRIDGE_COLUMNS - 2) return Math.abs(this.dock() - row) > 1;
    return (column + this.delivered) % 3 === 1 && row === (column * 2 + this.delivered) % BRIDGE_ROWS;
  }
  private dock() { return [2,0,1][this.delivered % 3]; }
  private allowed(column: number, row: number) {
    return Math.abs(this.trail[this.trail.length - 1] - row) <= 1 && !this.blocked(column,row);
  }
  protected tick(dt: number, input: FestivalInput): Cue {
    let cue: Cue = null;
    const column = this.trail.length;
    if (column < BRIDGE_COLUMNS) {
      let nearest = -1;
      for (let row = 0; row < BRIDGE_ROWS; row++) {
        const p = bridgeSocket(column,row);
        if (Math.abs(this.cursor.x - p.x) / 49 + Math.abs(this.cursor.y - p.y) / 34 < 1.2) nearest = row;
      }
      if (nearest !== this.hover) this.charge = 0;
      this.hover = nearest;
      if (nearest >= 0) {
        if (this.allowed(column, nearest)) {
          this.charge += dt;
          if (input.action || this.charge >= .34) {
            this.trail.push(nearest);
            this.score += this.trail.length - 1 > this.convoy + 1 ? 18 : 12;
            this.charge = 0;
            this.hover = -1;
            cue = 'grab';
          }
        } else if (input.action) {
          this.feedback = .35;
          this.score = Math.max(0,this.score - 4);
          cue = 'wrong';
        }
      }
    }
    // The battery drains only while the conveyor is waiting for a missing tile.
    if (this.convoy === this.trail.length - 1) {
      this.reserve = Math.max(0, this.reserve - dt / (15-this.delivered*2));
      if (this.reserve === 0) { this.lost = true; return 'wrong'; }
    }
    if (this.convoy < this.trail.length - 1) {
      this.crossing += dt * (.83 + this.delivered * .16);
      if (this.crossing >= 1) {
        this.crossing -= 1;
        this.convoy++;
        if (this.convoy === BRIDGE_COLUMNS - 1) {
          this.delivered++;
          this.score += 75 + Math.round(35 * this.reserve);
          this.reserve = 1;
          if (this.delivered >= 3) this.won = true;
          else {
            this.convoy = 0;
            this.crossing = 0;
            this.trail.splice(0,this.trail.length,1);
            this.hover = -1;
            this.charge = 0;
          }
          cue = 'correct';
        } else if (this.convoy === this.trail.length - 1) this.crossing = 0;
      }
    }
    return cue;
  }
  protected scene(c: Context) {
    sky(c,220,'#090f26','#21405c');
    circle(c,point(635,95),42,'#c089ab');
    for (let i=0;i<12;i++) {
      const h=35+(i*41)%80;
      block(c,i*75,230-h,42,12,h,['#374563','#24324c','#20283e']);
    }
    const column = this.trail.length;
    const chain = this.trail.map((row,index)=>bridgeSocket(index,row));
    for (let row = 0; row < BRIDGE_ROWS; row++) {
      for (let x = BRIDGE_COLUMNS - 1; x >= 0; x--) {
        const p=bridgeSocket(x,row);
        if (this.trail[x] === row) {
          block(c,p.x,p.y,35,17,12,mint);
        } else if (x === BRIDGE_COLUMNS - 1 && row === this.dock()) {
          block(c,p.x,p.y,37,18,32,amber);
          line(c,point(p.x+10,p.y),point(p.x+10,p.y-44),'#ffdfa3',3);
          polygon(c,[point(p.x+10,p.y-44),point(p.x+31,p.y-38),point(p.x+10,p.y-31)],'#fff0ad');
        } else if (this.blocked(x,row) && x>0 && x<BRIDGE_COLUMNS-1) {
          block(c,p.x,p.y,21,12,27,metal);
          block(c,p.x,p.y-15,12,7,15,lilac);
        } else {
          const active=x===column && this.allowed(x,row);
          polygon(c,[point(p.x-34,p.y),point(p.x,p.y-16),point(p.x+34,p.y),point(p.x,p.y+16)],active?'#388d92':'#293958');
          if (active) {
            line(c,point(p.x-7,p.y),point(p.x+7,p.y),'#baffd8',3);
            line(c,point(p.x,p.y-5),point(p.x,p.y+5),'#baffd8',3);
          }
        }
      }
    }
    for(let i=1;i<chain.length;i++) {
      line(c,chain[i-1],chain[i],'#26384e',8);
      line(c,chain[i-1],chain[i],'#a5f6d5',2);
    }
    const a=chain[this.convoy], b=chain[Math.min(this.convoy+1,chain.length-1)];
    const s=this.crossing;
    const cx=a.x+(b.x-a.x)*s, cy=a.y+(b.y-a.y)*s;
    block(c,cx,cy-10,25,13,10,metal);
    block(c,cx,cy-25,19,10,15,this.delivered%2?amber:lilac);
    c.fillStyle='#d8fffe'; c.fillRect(cx+4,cy-12,5,5); c.fillRect(cx+12,cy-16,5,5);
    if(this.hover>=0 && column<BRIDGE_COLUMNS) ring(c,bridgeSocket(column,this.hover),21,this.charge/.34,'#ffdf85');
    for(let i=0;i<3;i++) block(c,57+i*33,60,11,6,9,i<this.delivered?mint:metal);
    c.strokeStyle='#afc9d1';c.lineWidth=2;
    c.strokeRect(644,49,98,17);
    c.fillStyle='#afc9d1';c.fillRect(742,54,5,7);
    c.fillStyle=this.reserve>.35?'#89f9cb':'#ff987e';c.fillRect(648,53,90*this.reserve,9);
    ring(c,this.cursor,12,1,this.feedback>0?'#ff826e':'#ffffd9',2);
  }
}

type Motif = { color: number; dots: Point[] };
const motifs: Motif[] = [
  { color:0, dots:[[265,335],[265,218],[320,247],[375,196],[428,241],[488,206],[488,335],[380,363],[265,335]].map(([x,y])=>point(x,y)) },
  { color:1, dots:[[293,278],[310,255],[354,256],[370,272],[398,272],[414,255],[464,254],[451,287],[417,293],[399,276],[369,278],[343,297],[306,294],[293,278]].map(([x,y])=>point(x,y)) },
  { color:2, dots:[[326,311],[358,311],[376,327],[392,307],[412,319],[444,306]].map(([x,y])=>point(x,y)) }
];
export const brushDocks = [point(206,460),point(400,460),point(594,460)];
/** A measured stroke advances one ordered waypoint at a time. Painting the
 * outline with the matching nib and catching the beat on closure add points. */
export class PulsePainter extends WorkshopGame {
  brush = -1;
  stroke = 0;
  motif = 0;
  private feedbackAt: Point = point(0,0);
  private bonus = 0;
  private beatPhase = 0;
  private paletteHover = -1;
  private paletteTime = 0;
  private cooldown = 0;
  private last: Point | null = null;
  private readonly paint: {a: Point; b: Point; color: number}[] = [];
  private paintIndex = 0;
  private readonly marks: { from: Point; to: Point; color: number }[] = [];

  protected tick(dt: number,input: FestivalInput): Cue {
    const phase = input.beatPhase;
    this.beatPhase = phase !== undefined && Number.isFinite(phase) && phase >= 0 && phase < 1
      ? phase : (this.time * FESTIVAL_SCORES.paint.bpm / 60) % 1;
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.cooldown>0) { this.last=null; return null; }
    let dock=-1;
    for(let i=0;i<brushDocks.length;i++) if(dist(this.cursor,brushDocks[i])<38) dock=i;
    if(dock!==this.paletteHover) this.paletteTime=0;
    this.paletteHover=dock;
    if(dock>=0) {
      this.last=null; this.paletteTime+=dt;
      if(dock!==this.brush && (input.action || this.paletteTime>=.15)) {this.brush=dock; return 'grab';}
      return null;
    }
    const pattern=motifs[this.motif];
    const previous=this.last;
    if (previous && this.brush >= 0) {
      const travel = dist(previous, this.cursor);
      const onEasel = (p: Point) => p.x >= 221 && p.x <= 554 &&
        p.y > 158 - (p.x-221)*.14 && p.y < 377 - (p.x-221)*.14;
      if (travel >= 2 && travel < 82 && onEasel(previous) && onEasel(this.cursor)) {
        this.paint[this.paintIndex] = { a: previous, b: this.cursor, color: this.brush };
        this.paintIndex = (this.paintIndex+1) % 220;
      }
    }
    this.last=this.cursor;
    const p=pattern.dots[this.stroke];
    // Permit sparse camera samples along a short stroke, but never interpolate jumps across the easel.
    let distance=dist(this.cursor,p);
    if(previous && dist(previous,this.cursor)<82) {
      const dx=this.cursor.x-previous.x, dy=this.cursor.y-previous.y;
      const t=clamp(((p.x-previous.x)*dx+(p.y-previous.y)*dy)/(dx*dx+dy*dy || 1),0,1);
      distance=Math.min(distance,dist(p,point(previous.x+t*dx,previous.y+t*dy)));
    }
    if(distance>25) return null;
    if(this.brush!==pattern.color) {
      if(!input.action) return null;
      this.feedback=.4; this.feedbackAt={...this.cursor}; this.bonus=0; return 'wrong';
    }
    if(this.stroke>0) this.marks.push({from:pattern.dots[this.stroke-1],to:p,color:this.brush});
    this.stroke++; this.score+=8;
    if(this.stroke<pattern.dots.length) return 'grab';
    const beat=Math.abs(Math.sin(Math.PI*this.beatPhase));
    this.bonus=beat<.48?75:40;
    this.score+=this.bonus; this.feedback=.8;this.feedbackAt={...p};this.cooldown=.9;
    if(this.motif===motifs.length-1) {this.won=true;return 'correct';}
    this.motif++; this.stroke=0; this.brush=-1; this.last=null;
    return 'correct';
  }
  protected scene(c: Context) {
    sky(c,140,'#211538','#473054');
    const beat=.5+.5*Math.cos(this.beatPhase*2*Math.PI);
    for(let i=0;i<23;i++) {
      const h=(12+24*(.5+.5*Math.sin(i*1.8+this.time*8)))*(1+beat);
      c.fillStyle=i%3===0?'#723d75':'#49365c'; c.fillRect(i*36,418-h,19,h);
    }
    block(c,405,420,280,58,20,metal);
    for(const x of [205,530]) line(c,point(x+12,332),point(x,434),'#435375',14);
    polygon(c,[point(174,164),point(560,107),point(614,347),point(200,403)],'#1d142e');
    polygon(c,[point(181,153),point(562,98),point(604,337),point(206,390)],'#514463');
    polygon(c,[point(190,157),point(554,105),point(594,332),point(213,382)],'#26253d');
    for (let i=0;i<this.paint.length;i++) {
      const stroke=this.paint[(this.paintIndex+i)%this.paint.length];
      const color=inkColors[stroke.color][0];
      if(stroke.color===2) circle(c,stroke.b,3,color+'b5');
      else line(c,stroke.a,stroke.b,color+'75',stroke.color===0?5:9);
    }
    for(const mark of this.marks) line(c,mark.from,mark.to,inkColors[mark.color][1]+'8a',8);
    const pattern=motifs[this.motif];
    const color=inkColors[pattern.color][0];
    c.save();
    c.setLineDash([5,8]);
    for(let i=1;i<pattern.dots.length;i++) line(c,pattern.dots[i-1],pattern.dots[i],color+'65',2);
    c.restore();
    for(let i=0;i<this.stroke;i++) {
      if(i) line(c,pattern.dots[i-1],pattern.dots[i],color,8);
      circle(c,pattern.dots[i],5,color);
    }
    if(!this.won) {
      const next=pattern.dots[this.stroke];
      ring(c,next,14+beat*8,1,color,3); circle(c,next,4,'#fff8eb');
      if(this.stroke+1<pattern.dots.length) circle(c,pattern.dots[this.stroke+1],5,color);
    }
    for(let i=0;i<3;i++) {
      const p=brushDocks[i], ink=inkColors[i];
      block(c,p.x,p.y,36,16,15,ink);
      const tip=point(p.x+7,p.y-24);
      line(c,point(p.x-6,p.y),tip,'#cfd1e4',6);
      circle(c,tip,7,ink[0]);
      number(c,point(p.x,p.y+26),String(i+1),ink[0],15);
      if(i===pattern.color && this.brush!==i) ring(c,p,36+beat*3,1,ink[0],2);
    }
    line(c,point(this.cursor.x+14,this.cursor.y+23),this.cursor,'#e2dbe6',5);
    circle(c,this.cursor,7,this.brush>=0?inkColors[this.brush][0]:'#eee2f3');
    if(this.feedback>0)number(c,point(this.feedbackAt.x,this.feedbackAt.y-24),this.bonus?'+'+this.bonus:'×',this.bonus?'#ffe6a5':'#ff888d',21);
  }
}

export const roverCourse = {
  centers: [-.46,.53,.15,-.68,-.18,.65,.27,-.54,.58,0],
  spacing: 4, passRadius: .36, perfectRadius: .13,
} as const;
const gateCenters = roverCourse.centers;
function roadProjection(lateral: number, depth: number): Point {
  const k = 1 / (1 + depth * .88);
  return point(W * .5 + lateral * 286 * k, 154 + 292 * k);
}

/** Pilot a survey rover through offset gates. The tip controls steering and
 * throttle continuously; a level wand steadies fine aiming through the center. */
export class QuarryRover extends WorkshopGame {
  lane = 0;
  distance = 0;
  hull = 3;
  gates = 0;
  private speed = .7;
  private velocity = 0;
  private perfect = false;
  private shake = 0;
  private clipped = false;
  protected tick(dt: number, input: FestivalInput): Cue {
    const target = clamp((input.x-.5)*2.45 + clamp(input.angle / .78,-1,1),-1,1);
    const desiredSpeed = .55 + 1.16*(1-clamp(input.y,0,1));
    this.speed += (desiredSpeed-this.speed) * (1-Math.exp(-2.5*dt));
    // A damped steering servo remains controllable at camera and touch frame rates.
    this.velocity += ((target-this.lane)*24-this.velocity*8)*dt;
    this.lane=clamp(this.lane+this.velocity*dt,-1,1);
    this.distance+=this.speed*dt;
    this.shake=Math.max(0,this.shake-dt);
    if(this.distance < (this.gates+1)*roverCourse.spacing) return null;
    const error=Math.abs(this.lane-gateCenters[this.gates]);
    this.gates++; this.feedback=.75; this.perfect=error<roverCourse.perfectRadius;
    this.clipped = error > roverCourse.passRadius;
    if(this.clipped) {
      this.hull--; this.shake=.4;
      if(!this.hull) this.lost=true;
    } else this.score+=this.perfect?90:45;
    if(!this.lost && this.gates===gateCenters.length) this.won=true;
    return this.clipped?'wrong':'correct';
  }
  protected scene(c: Context) {
    sky(c,138,'#0c1738','#49385f');
    circle(c,point(596,95),37,'#fbb389');
    for(let i=0;i<8;i++){
      const x=i*121-30;
      polygon(c,[point(x-65,164),point(x,95+(i*29)%40),point(x+73,166)],i%2?'#494163':'#353757');
    }
    polygon(c,[point(368,158),point(432,158),point(790,H),point(10,H)],'#26334f');
    for(const side of [-1,1]) {
      line(c,roadProjection(side*1.07,24),roadProjection(side*1.07,-.25),'#9e9abb',4);
      for(let i=10;i>=0;i--){
        const z=i*1.28+1.28-(this.distance%1.28);
        const p=roadProjection(side*1.35,z), k=1/(1+z*.88);
        block(c,p.x,p.y-22*k,18*k,9*k,24*k,i%2?lilac:metal);
      }
    }
    for(let i=12;i>=0;i--){
      const z=i*.9+.9-(this.distance%.9);
      line(c,roadProjection(-1.04,z),roadProjection(1.04,z),'#53708a',1.2);
    }
    for(let i=Math.min(this.gates+2,gateCenters.length-1);i>=this.gates;i--){
      const z=(i+1)*roverCourse.spacing-this.distance;
      const p=roadProjection(gateCenters[i],z), scale=1/(1+.88*z);
      const gateWidth=286*roverCourse.passRadius*scale, height=123*scale, radius=12*scale;
      const ink=i===this.gates?mint:metal;
      for(const side of [-1,1]) {
        const x=p.x+side*gateWidth;
        block(c,x,p.y-height,radius,6*scale,height,ink);
        block(c,x,p.y-height*.48,radius*1.12,7*scale,10*scale,amber);
      }
      line(c,point(p.x-gateWidth,p.y-height),point(p.x+gateWidth,p.y-height),ink[0],Math.max(1,8*scale));
      if(i===this.gates) {
        const h=22*scale;
        polygon(c,[point(p.x,p.y-height*.52-h),point(p.x+h*.7,p.y-height*.52),point(p.x,p.y-height*.52+h),point(p.x-h*.7,p.y-height*.52)],amber[0]);
      }
    }
    const p=roadProjection(this.lane,0);
    c.save();c.translate(p.x+(this.shake?Math.sin(this.time*65)*5:0),p.y);c.rotate(this.velocity*.037);
    for(const x of [-27,27]) {
      block(c,x,-2,15,9,16,metal);
      block(c,x,-22,12,7,13,metal);
      c.fillStyle=mint[0];c.fillRect(x-8,7,15,4);
    }
    block(c,0,-22,40,19,15,lilac);
    block(c,0,-46,24,12,22,metal);
    c.fillStyle=mint[0];c.fillRect(-10,-26,8,5);c.fillRect(5,-26,8,5);
    line(c,point(12,-46),point(17,-68),'#d9bff8',3);
    circle(c,point(18,-68),5,this.shake?'#ff765f':amber[0]);
    c.restore();
    // Direction pointer makes the distant gate readable on a small phone.
    if(this.gates<gateCenters.length){
      const target=roadProjection(gateCenters[this.gates],0);
      polygon(c,[point(target.x,491),point(target.x-9,505),point(target.x+9,505)],mint[0]);
    }
    for(let i=0;i<3;i++) block(c,46+i*31,55,11,6,8,i<this.hull?amber:metal);
    number(c,point(719,53),this.gates+' / '+gateCenters.length,'#d9e8ef',18);
    if(this.feedback>0) number(c,point(p.x,p.y-94),this.clipped?'×':this.perfect?'◆':'✓','#ffe4ae',30);
  }
}

export function createWorkshop(id: 'build'|'paint'|'rover'): FestivalGame {
  switch (id) {
    case 'build': return new Convoy();
    case 'paint': return new PulsePainter();
    case 'rover': return new QuarryRover();
  }
}
