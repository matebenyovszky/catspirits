import type { FestivalGame, FestivalInput } from './types';

type Cue = ReturnType<FestivalGame['update']>;
type Ctx = CanvasRenderingContext2D;
type Paint = readonly [top:string, front:string, side:string];
const W = 800, H = 560;
const mint: Paint = ['#b7ffe5','#50cdae','#278d86'];
const teal: Paint = ['#489d9c','#276467','#234759'];
const violet: Paint = ['#e1c9ff','#a88cf0','#6956a1'];
const gold: Paint = ['#ffe69a','#f4ba63','#b46b48'];
const rust: Paint = ['#ffbca4','#de786b','#8e4c65'];
const slate: Paint = ['#7a8ca0','#435969','#2b394d'];
const frost: Paint = ['#f4fbff','#b9d9df','#779cae'];
const clamp = (n:number, lo:number, hi:number) => Math.max(lo, Math.min(hi,n));
const approach = (from:number, to:number, speed:number, dt:number) => from + clamp(to-from,-speed*dt,speed*dt);

function polygon(c:Ctx, color:string, coords:number[]):void {
  c.fillStyle=color; c.beginPath(); c.moveTo(coords[0],coords[1]);
  for (let i=2;i<coords.length;i+=2) c.lineTo(coords[i],coords[i+1]);
  c.closePath(); c.fill();
}
function line(c:Ctx, color:string, width:number, x:number, y:number, dx:number, dy:number):void {
  c.strokeStyle=color; c.lineWidth=width; c.beginPath(); c.moveTo(x,y); c.lineTo(dx,dy); c.stroke();
}
function rect(c:Ctx, color:string, x:number, y:number, w:number, h:number):void {
  c.fillStyle=color; c.fillRect(x,y,w,h);
}
/** A small axonometric solid, positioned by the center of its front bottom edge. */
function block(c:Ctx,x:number,y:number,w:number,h:number,d:number,p:Paint):void {
  const left=x-w/2, right=x+w/2, top=y-h;
  rect(c,p[1],left,top,w,h);
  polygon(c,p[0],[left,top,left+d,top-d*.56,right+d,top-d*.56,right,top]);
  polygon(c,p[2],[right,top,right+d,top-d*.56,right+d,y-d*.56,right,y]);
}
function pet(c:Ctx,x:number,y:number,size:number,p:Paint, phase:number):void {
  const bob=Math.sin(phase)*size*.035; y+=bob;
  block(c,x-size*.24,y,size*.19,size*.20,size*.15,p);
  block(c,x+size*.24,y,size*.19,size*.20,size*.15,p);
  block(c,x,y-size*.14,size*.83,size*.66,size*.29,p);
  for(const s of [-1,1]) {
    block(c,x+s*size*.31,y-size*.8,size*.19,size*.25,size*.13,p);
    rect(c,'#142331',x+s*size*.19-size*.055,y-size*.59,size*.10,size*.13);
  }
  rect(c,'#ffe1cf',x-size*.055,y-size*.41,size*.11,size*.07);
}
function number(c:Ctx,value:number,x:number,y:number,size:number,color:string):void {
  c.font=`800 ${Math.max(10,size)}px ui-monospace, monospace`; c.textAlign='center'; c.fillStyle=color; c.fillText(String(value),x,y);
}
function ring(c:Ctx,x:number,y:number,r:number,color:string,width=2):void {
  c.beginPath(); c.arc(x,y,r,0,2*Math.PI); c.strokeStyle=color; c.lineWidth=width; c.stroke();
}
function landscape(c:Ctx,night:string,dawn:string,accent:string,t:number):void {
  const sky=c.createLinearGradient(0,0,0,H); sky.addColorStop(0,night); sky.addColorStop(.72,dawn); sky.addColorStop(1,night);
  c.fillStyle=sky; c.fillRect(0,0,W,H);
  for(let i=0;i<31;i++) rect(c,'#bbe3ef',((i*127+23)%827)-10,16+((i*53)%137),i%4===0?3:1.4,2);
  c.fillStyle=accent; c.beginPath(); c.arc(630,110,51,0,2*Math.PI); c.fill();
  for(let i=0;i<5;i++) rect(c,dawn,577,108+i*8,106,1+i*.7);
  for(let layer=0;layer<2;layer++){
    const base=207+layer*28, scroll=t*(2+layer);
    const coords=[-90,base+26];
    for(let i=-1;i<15;i++){
      const step=i+Math.floor(scroll/70), top=base-18-((step*step*29+layer*39)%60), left=i*70-scroll%70;
      coords.push(left,top,left+45,top,left+45,top+13,left+70,top+13);
    }
    coords.push(W+90,H,-90,H);
    polygon(c,layer?'#183a46':'#29495e',coords);
  }
}
function progress(c:Ctx,total:number,done:number,lives:number):void {
  const width=16, gap=5;
  for(let i=0;i<total;i++) rect(c,i<done?'#76efd4':'#698394',24+i*(width+gap),24,width,5);
  for(let i=0;i<3;i++){
    const x=W-30-23*i;
    polygon(c,i<lives?'#ffc987':'#4c5264',[x,18,x+7,25,x,32,x-7,25]);
  }
}
abstract class Mission implements FestivalGame {
  score=0; won=false; lost=false;
  protected elapsed=0;
  protected flash=0;
  protected good=true;
  protected hearts=3;
  private burstX=0;
  private burstY=0;
  private burstRemaining=0;
  private burstColor='#aaffdc';

  protected burst(x:number,y:number,color:string):void {
    this.burstX=x; this.burstY=y; this.burstColor=color; this.burstRemaining=.46;
  }
  abstract update(dt:number,input:FestivalInput):Cue;
  protected abstract paint(c:Ctx):void;
  draw(c:Ctx,width:number,height:number):void {
    c.save(); c.scale(width/W,height/H); this.paint(c);
    if(this.burstRemaining>0) {
      const age=.46-this.burstRemaining;
      for(let i=0;i<12;i++) {
        const angle=i*Math.PI/6, travel=(i%2?115:170)*age;
        const x=this.burstX+Math.cos(angle)*travel;
        const y=this.burstY+Math.sin(angle)*travel+105*age*age;
        const size=2+7*this.burstRemaining;
        rect(c,this.burstColor,x,y,size,size);
      }
    }
    if(this.flash>0){
      c.strokeStyle=this.good?'#89ffe0':'#ffa49d'; c.lineWidth=7; c.globalAlpha=this.flash*1.3; c.strokeRect(4,4,W-8,H-8);
    }
    c.restore();
  }
  protected advance(dt:number):number {
    if(!Number.isFinite(dt)||dt<=0||this.won||this.lost) return 0;
    dt=Math.min(dt,.08); this.burstRemaining=Math.max(0,this.burstRemaining-dt); this.elapsed+=dt; this.flash=Math.max(0,this.flash-dt); return dt;
  }
  protected reward(points:number):Cue { this.score+=points; this.flash=.43; this.good=true; return 'correct'; }
  protected hurt():Cue { this.hearts--; this.lost=this.hearts<=0; this.flash=.55; this.good=false; return 'wrong'; }
}

const trail = [1,0,2,1,0,1,2,0,2,1,0,2];
const laneX = (lane:number) => .5 + (lane-1)*.29;
function pathAt(z:number):{xScale:number;y:number;size:number} {
  const f=1/(1+Math.max(-.4,z)*.46);
  return {xScale:235*f,y:158+319*f,size:f};
}

/** Alternating rune gates and barricades on an automatic jungle run. */
class Jungle extends Mission {
  private runner=.5;
  private gateIndex=0;
  private distance=3.8;
  private swing=0;
  private cut=false;
  private streak=0;
  private get barrier():boolean { return this.gateIndex%3===1; }
  update(dt:number,input:FestivalInput):Cue {
    dt=this.advance(dt); if(!dt) return null;
    this.runner=approach(this.runner,clamp(input.x,.15,.85),1.35,dt);
    this.distance-=dt*(1.25+this.gateIndex*.034);
    this.swing=Math.max(0,this.swing-dt);
    const onLane=Math.abs(this.runner-laneX(trail[this.gateIndex]))<.14;
    if(input.action) {
      this.swing=.25;
      if(!this.barrier&&!this.cut&&this.distance<=1.32&&this.distance>=-.18&&onLane){
        this.cut=true;
        const gate=pathAt(this.distance);
        this.burst(400+(trail[this.gateIndex]-1)*gate.xScale,gate.y-60*gate.size,'#c1ffe4');
        return this.reward(100+Math.min(6,++this.streak)*12);
      }
    }
    if(this.distance>-.2) return null;
    const cleared=this.barrier?!onLane:this.cut;
    const cue=cleared?(this.barrier?this.reward(80):null):this.hurt();
    if(!cleared) this.streak=0;
    this.gateIndex++; this.distance+=4.5; this.cut=false;
    this.won=this.gateIndex===trail.length&&!this.lost;
    return cue;
  }
  protected paint(c:Ctx):void {
    landscape(c,'#132e46','#4e8a87','#ffddad',this.elapsed);
    polygon(c,'#314d49',[361,163,439,163,800,560,0,560]);
    for(let lane=0;lane<4;lane++) {
      const delta=(lane-1.5)*234;
      line(c,lane===0||lane===3?'#5acba8':'#759a87',lane===0||lane===3?4:1,400+delta*.04,165,400+delta*1.35,560);
    }
    // Regularly spaced ties make forward motion visible even on an empty lane.
    for(let i=0;i<19;i++){
      const z=i*.88+this.distance% .88;
      const p=pathAt(z);
      line(c,'#476359',Math.max(1,4*p.size),400-1.52*p.xScale,p.y,400+1.52*p.xScale,p.y);
    }
    for(let i=11;i>=0;i--){
      const p=pathAt(i*1.3+this.distance%1.3), scale=p.size;
      for(const side of [-1,1]){
        const x=400+side*(1.8+(i%3)*.21)*p.xScale, height=(86+(i%4)*22)*scale;
        block(c,x,p.y,23*scale,height,13*scale,slate);
        block(c,x,p.y-height+12*scale,90*scale,32*scale,33*scale,teal);
        block(c,x+8*scale,p.y-height-16*scale,55*scale,29*scale,22*scale,mint);
      }
    }
    const near=pathAt(1.32);
    line(c,'#95e7b5',2,400-near.xScale*1.5,near.y,400+near.xScale*1.5,near.y);
    for(let ahead=2;ahead>=0;ahead--){
      const i=this.gateIndex+ahead;
      if(i>=trail.length||ahead===0&&this.cut) continue;
      const z=this.distance+4.5*ahead,p=pathAt(z),x=400+(trail[i]-1)*p.xScale,s=p.size;
      if(i%3===1){
        block(c,x,p.y,129*s,65*s,18*s,rust);
        for(const side of [-1,1]) line(c,'#ffe0b6',6*s,x+side*22*s,p.y-49*s,x-side*22*s,p.y-15*s);
      }else{
        const bright=z<=1.32;
        block(c,x-45*s,p.y,13*s,116*s,10*s,teal); block(c,x+45*s,p.y,13*s,116*s,10*s,teal);
        for(let j=0;j<3;j++) line(c,bright?'#a8ffdb':'#66ba95',7*s,x-39*s,p.y-(29+j*27)*s,x+40*s,p.y-(48+j*27)*s);
        const cy=p.y-72*s;
        polygon(c,bright?'#fff2ac':'#b7fbe2',[x,cy-21*s,x+18*s,cy,x,cy+21*s,x-18*s,cy]);
        line(c,'#21665e',3*s,x-6*s,cy+7*s,x+6*s,cy-7*s);
      }
    }
    const x=400+(this.runner-.5)*800;
    block(c,x,508,42,48,13,frost); pet(c,x,466,51,mint,this.elapsed*11);
    const a=this.swing>0?-1.6+(1-this.swing/.25)*2.25:-.85;
    line(c,'#337b86',11,x+25,477,x+25+Math.cos(a)*77,477+Math.sin(a)*77);
    line(c,'#b1ffee',5,x+25,477,x+25+Math.cos(a)*77,477+Math.sin(a)*77);
    progress(c,trail.length,this.gateIndex,this.hearts);
  }
}

const openings=[.58,.40,.66,.49,.34,.63,.44,.55];
/** Side-scrolling ferry. The cargo has inertia and gravity along a tiltable deck. */
class Ferry extends Mission {
  private x=.31; private y=.53; private tilt=0; private roll=0; private velocity=0;
  private gate=0;
  private gateX=.96;
  private recovery=0;
  private gateTouched=false;
  private clearance=1;
  private fall:{x:number;y:number;vx:number;age:number}|null=null;
  private get gap():number { return .35-this.gate*.009; }
  update(dt:number,input:FestivalInput):Cue {
    dt=this.advance(dt); if(!dt) return null;
    if(this.fall) {
      this.fall.age+=dt;
      if(this.fall.age>.56) this.fall=null;
    }
    const oldX=this.x;
    this.x=approach(this.x,clamp(input.x,.19,.49),.42,dt);
    this.y=approach(this.y,clamp(input.y,.22,.86),.62,dt);
    this.tilt=approach(this.tilt,clamp(input.angle,-1.05,1.05),3.8,dt);
    // A felt-lined deck absorbs tiny tracking tremors when held nearly level.
    const slope = Math.sign(this.tilt) * Math.max(0, Math.abs(this.tilt) - .055);
    const centering = Math.abs(this.tilt) < .15 ? -this.roll * 1.15 : 0;
    const acceleration = Math.sin(slope) * 1.65 + centering;
    this.velocity = (this.velocity + acceleration * dt - (this.x - oldX) * .52) * Math.exp(-2.25 * dt);
    this.roll+=this.velocity*dt;
    this.gateX-=dt*(.16+this.gate*.005);
    this.recovery=Math.max(0,this.recovery-dt);
    if(Math.abs(this.roll)>.115){
      if(!this.recovery){
        const x=(this.x+this.roll*Math.cos(this.tilt))*W, y=this.y*H+this.roll*W*Math.sin(this.tilt);
        this.fall={x,y,vx:this.velocity*W,age:0};
        this.burst(x,y,'#ff9f89');
        this.roll=this.velocity=0; this.recovery=1.4;
        return this.hurt();
      }
      this.roll=this.velocity=0;
    }
    // Check the actual tilted deck and the passenger across the entire gate.
    // Contact is latched so one scrape costs at most one heart per opening.
    const deckRadius = .125 * Math.cos(this.tilt);
    const station = this.gateX - this.x;
    const gateHalfWidth = .03;
    if (station > deckRadius + gateHalfWidth) return null;
    if (station >= -deckRadius - gateHalfWidth) {
      const low = openings[this.gate] - this.gap / 2;
      const high = openings[this.gate] + this.gap / 2;
      const deckLeft = clamp(station - gateHalfWidth, -deckRadius, deckRadius);
      const deckRight = clamp(station + gateHalfWidth, -deckRadius, deckRadius);
      const y1 = this.y + deckLeft * Math.tan(this.tilt) * W / H;
      const y2 = this.y + deckRight * Math.tan(this.tilt) * W / H;
      let margin = Math.min(Math.min(y1,y2) - .014 - low, high - Math.max(y1,y2) - .014);
      const petX = this.roll * Math.cos(this.tilt);
      const petBase = this.y + this.roll * Math.sin(this.tilt) * W / H - .01;
      if (Math.abs(station-petX) <= gateHalfWidth + .027) {
        margin = Math.min(margin, petBase - .08 - low, high - petBase);
      }
      this.clearance = Math.min(this.clearance, margin);
      if (margin < 0 && !this.gateTouched) {
        this.gateTouched = true;
        this.burst(this.gateX*W, clamp(this.y,low,high)*H, '#ff9f89');
        return this.hurt();
      }
      return null;
    }
    const points = Math.round(90 + (this.clearance + .115 - Math.abs(this.roll)) * 200);
    let cue:Cue = null;
    if (!this.gateTouched) {
      this.burst(this.x*W,this.y*H-20,'#ffe49b');
      cue = this.reward(points);
    }
    this.gate++;
    this.gateX += .79;
    this.clearance = 1;
    this.gateTouched = false;
    this.won = this.gate === openings.length && !this.lost;
    return cue;
  }
  protected paint(c:Ctx):void {
    landscape(c,'#282d53','#87668a','#ffcca3',this.elapsed);
    for(let i=0;i<11;i++){
      const x=((i*89-this.elapsed*22)%980+980)%980-80,y=430+i%4*32;
      block(c,x,y,66,14,19,slate); block(c,x,y-12,69,6,22,teal);
    }
    for(let i=this.gate>0?-1:0;i<2&&this.gate+i<openings.length;i++){
      const x=(this.gateX+i*.79)*W,center=openings[this.gate+i]*H;
      const top=center-this.gap*H/2,bottom=center+this.gap*H/2;
      if (x < -50 || x > W+50) continue;
      const scraped = i===0 && this.gateTouched;
      block(c,x,top,33,top,12,slate); block(c,x,top,48,10,15,scraped?rust:violet);
      block(c,x,H+10,33,H-bottom+10,14,slate); block(c,x,bottom+12,48,12,15,scraped?rust:mint);
      for(let y=top+17;y<bottom-10;y+=18)rect(c,'#dcdb9b',x-1,y,2,5);
      ring(c,x,center,16,'#ffe397',2); rect(c,'#ffe397',x-3,center-3,6,6);
    }
    const x=this.x*W,y=this.y*H;
    c.save(); c.translate(x,y); c.rotate(this.tilt);
    block(c,0,7,198,11,7,teal); rect(c,'#adffe0',-100,-6,202,4);
    for(const end of [-1,1]) block(c,end*96,4,8,12,6,gold);
    c.restore();
    const offset=this.roll*W;
    const arrival=Math.max(0,1-this.elapsed/.58,(this.recovery-.82)/.58);
    pet(c,x+offset*Math.cos(this.tilt),y-6+offset*Math.sin(this.tilt)-arrival*arrival*140,40,this.recovery>0?violet:frost,this.elapsed*4);
    if(this.fall) {
      const {x:fx,y:fy,vx,age}=this.fall;
      c.save(); c.translate(fx+vx*age,fy+410*age*age); c.rotate(Math.sign(vx)*age*4);
      pet(c,0,0,40,frost,0); c.restore();
    }
    // A separate inclinometer remains legible behind the player's hand.
    ring(c,70,H-49,29,'#8397ac'); line(c,'#8fabb9',1,43,H-49,97,H-49);
    line(c,Math.abs(this.tilt)>.38?'#ffc687':'#74e5c6',5,70-23*Math.cos(this.tilt),H-49-23*Math.sin(this.tilt),70+23*Math.cos(this.tilt),H-49+23*Math.sin(this.tilt));
    progress(c,openings.length,this.gate,this.hearts);
  }
}

type Stray = { x:number; y:number; vx:number; vy:number; saved:boolean; coat:Paint };
const penspot={x:.842,y:.44};
const ponds=[{x:.47,y:.29,rx:.092,ry:.16},{x:.53,y:.706,rx:.091,ry:.14}];
const herdSpawns=[[.17,.32],[.26,.41],[.18,.58],[.29,.69],[.09,.45]];
/** The wand attracts nearby strays. Separating neighbours and deflecting the
 * velocity at the pond edge keeps the flock steerable without pathfinding. */
class Herd extends Mission {
  private herd:Stray[]=herdSpawns.map(([x,y],i)=>({x,y,vx:0,vy:0,saved:false,coat:[frost,mint,gold,violet,frost][i]}));
  private pointer={x:.25,y:.48};
  private pulse=0;
  private cooldown=0;
  private delivered=0;
  private active=0;
  update(dt:number,input:FestivalInput):Cue{
    dt=this.advance(dt); if(!dt) return null;
    this.pointer={x:clamp(input.x,.035,.965),y:clamp(input.y,.12,.9)};
    this.pulse=Math.max(0,this.pulse-dt); this.cooldown=Math.max(0,this.cooldown-dt);
    let cue:Cue=null;
    if(input.action&&this.cooldown===0){this.pulse=.85;this.cooldown=2.2;cue='grab';}
    this.active=0;
    for(const p of this.herd){
      if(p.saved) continue;
      const dx=this.pointer.x-p.x,dy=this.pointer.y-p.y,dist=Math.hypot(dx,dy*.7);
      const reach=this.pulse>0?.345:.225;
      let ax=0,ay=0;
      if(dist<reach){
        this.active++;
        const gain=this.pulse>0?7.8:5.8;
        ax=dx*gain; ay=dy*gain;
      }
      for(const other of this.herd){
        if(other===p||other.saved)continue;
        const sx=p.x-other.x,sy=p.y-other.y,r=Math.hypot(sx,sy*.7);
        if(r>0&&r<.048){ const push=(.048-r)*14/r; ax+=sx*push; ay+=sy*push; }
      }
      p.vx=clamp((p.vx+ax*dt)*Math.exp(-4*dt),-.29,.29);
      p.vy=clamp((p.vy+ay*dt)*Math.exp(-4*dt),-.39,.39);
      p.x=clamp(p.x+p.vx*dt,.045,.955); p.y=clamp(p.y+p.vy*dt,.14,.9);
      for(const pond of ponds){
        const rx=pond.rx+.022, ry=pond.ry+.028;
        const sx=(p.x-pond.x)/rx,sy=(p.y-pond.y)/ry,r=Math.hypot(sx,sy);
        if(r<1){
          const nx=r?sx/r:1,ny=r?sy/r:0;
          p.x=pond.x+nx*rx;p.y=pond.y+ny*ry;
          const normal=Math.hypot(nx/rx,ny/ry);
          const tx=nx/rx/normal,ty=ny/ry/normal,along=Math.min(0,p.vx*tx+p.vy*ty);
          p.vx-=along*tx;p.vy-=along*ty;
        }
      }
      if(Math.hypot(p.x-penspot.x,(p.y-penspot.y)*.74)<.10){
        this.burst(p.x*W,p.y*H-18,'#ffdf9c');
        p.saved=true; this.delivered++; cue=this.reward(120+Math.max(0,Math.round(70-this.elapsed)));
      }
    }
    this.won=this.delivered===this.herd.length; return cue;
  }
  protected paint(c:Ctx):void {
    const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#1d404c'); bg.addColorStop(1,'#336459'); c.fillStyle=bg; c.fillRect(0,0,W,H);
    for(let i=0;i<63;i++){
      const x=(i*113+13)%W,y=64+(i*79)%(H-80);
      rect(c,i%3===0?'#587c68':'#456e63',x,y,7+i%7,3);
    }
    for(const q of ponds){
      const x=q.x*W,y=q.y*H,rx=q.rx*W,ry=q.ry*H;
      c.fillStyle='#395446';c.beginPath();c.ellipse(x,y,rx+7,ry+5,0,0,Math.PI*2);c.fill();
      c.fillStyle='#183653';c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
      for(let i=0;i<4;i++)line(c,'#428398',2,x-rx*.5+i%2*14,y+(i-1.6)*ry*.35,x+rx*.28+Math.sin(this.elapsed+i)*5,y+(i-1.6)*ry*.35);
      block(c,x+rx*.81,y+ry*.51,17,12,7,teal);
    }
    const bx=penspot.x*W,by=penspot.y*H;
    c.beginPath(); c.ellipse(bx,by,78,71,0,0,Math.PI*2); c.fillStyle='#768359'; c.fill(); c.lineWidth=3; c.strokeStyle='#ffdb93';c.stroke();
    for(let i=0;i<5;i++){const a=-Math.PI*.6+i*Math.PI*.3;block(c,bx+Math.cos(a)*79,by+Math.sin(a)*68,8,30,6,gold);}
    for(let i=0;i<this.delivered;i++)pet(c,bx+(i%3-1)*25,by+Math.floor(i/3)*24,23,this.herd.filter(p=>p.saved)[i].coat,this.elapsed*2+i);
    const x=this.pointer.x*W,y=this.pointer.y*H;
    const radius=(this.pulse>0?.345:.225)*W;
    c.strokeStyle=this.pulse>0?'#ffe09b':'#84f2d99c';c.lineWidth=2;c.setLineDash([4,9]);c.beginPath();c.ellipse(x,y,radius,radius*H/(W*.7),0,0,Math.PI*2);c.stroke();c.setLineDash([]);
    const ordered=[...this.herd].sort((a,b)=>a.y-b.y);
    for(const p of ordered){
      if(p.saved)continue;
      const px=p.x*W,py=p.y*H;
      if(Math.hypot(x-px,(y-py)*W/H*.7)<radius)line(c,'#91f1cc5c',2,x,y,px,py-9);
      c.fillStyle='#163e42';c.beginPath();c.ellipse(px+4,py+1,19,6,0,0,2*Math.PI);c.fill();
      pet(c,px,py,37,p.coat,this.elapsed*(Math.abs(p.vx)+Math.abs(p.vy)>.015?9:2)+p.x*8);
    }
    line(c,'#a9c7ea',9,x-23,y+32,x,y);line(c,'#f6d59b',4,x-23,y+32,x,y);
    ring(c,x,y,this.pulse>0?17:10,this.active?'#baffe0':'#9ab9d6',3);
    number(c,this.delivered, bx,by+56,20,'#fff0b7');
    for(let i=0;i<this.herd.length;i++)block(c,32+i*28,30,15,10,5,i<this.delivered?gold:teal);
    rect(c,'#31545e',W-110,24,82,5);rect(c,'#9ff3d8',W-110,24,82*(1-this.cooldown/2.2),5);
  }
}
export function createMission(id:'jungle'|'ferry'|'herd'):FestivalGame {
  switch(id){case 'jungle':return new Jungle();case 'ferry':return new Ferry();case 'herd':return new Herd();}
}
