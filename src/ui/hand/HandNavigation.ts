import { t } from '../../i18n';
import type { CameraPoseTracker } from '../../core/tracking/CameraPoseTracker';
import type { PoseFrame } from '../../core/tracking/types';
import { sharedCamera } from '../../core/tracking/SharedCamera';
import { HandGesture } from './HandGesture';
import { HandPointer } from './HandPointer';
import './hand.css';
const KEY='catspirits.hand-navigation.session.v1';
const HAND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2Z"/></svg>';
/** Opt-in, page-local hand navigation. Session preference survives game links,
 * while every hidden page releases its camera and inference immediately. */
export class HandNavigation {
  private panel=document.createElement('aside');
  private toggle=document.createElement('button');
  private video=document.createElement('video');
  private status=document.createElement('span');
  private cursor=document.createElement('div');
  private gesture=new HandGesture();
  private pointer=new HandPointer();
  private tracker?: CameraPoseTracker;
  private enabled=false;
  private disposed=false;
  private pageActive=true;
  private generation=0;
  private abort=new AbortController();
  private unsubscribe: (()=>void)[]=[];
  private raf=0;
  private lastSeen=-Infinity;
  private held=false;
  private edgeSince=0;
  private edgeDirection=0;
  private lastTick=0;
  private point?: {x:number;y:number};
  constructor() {
    this.panel.className='hand-navigation';this.panel.setAttribute('aria-label',t('Kézkurzor'));
    this.toggle.type='button';this.toggle.innerHTML=HAND;const label=document.createElement('span');label.textContent=t('Kézkurzor');this.toggle.append(label);
    this.video.autoplay=true;this.video.muted=true;this.video.playsInline=true;this.video.setAttribute('aria-hidden','true');
    this.status.className='hand-status';this.status.setAttribute('role','status');
    const hint=document.createElement('span');hint.className='hand-instructions';hint.textContent=t('Mozgasd a kezed. Csippents a kattintáshoz, tartsd össze húzáshoz. A képernyő felső és alsó szélén görgethetsz.');
    this.panel.append(this.toggle,this.video,this.status,hint);this.cursor.className='hand-cursor';this.cursor.hidden=true;this.cursor.setAttribute('aria-hidden','true');
    document.body.append(this.panel,this.cursor);this.render();
    const signal=this.abort.signal;
    this.toggle.addEventListener('click',()=>this.setEnabled(!this.enabled),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.suspend();else if(this.enabled){this.pageActive=true;void this.sync();}},{signal});
    window.addEventListener('pagehide',()=>this.suspend(),{signal});
    window.addEventListener('pageshow',()=>{this.pageActive=true;if(this.enabled)void this.sync();},{signal});
    document.addEventListener('fullscreenchange',()=>{this.cancel();this.pointer.closePopup();(document.fullscreenElement ?? document.body).append(this.panel,this.cursor);},{signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){this.cancel();this.pointer.closePopup();}},{signal});
    // Frame/model sharing with Bit Rescue: never run a second hand detector.
    this.unsubscribe.push(sharedCamera.subscribe(()=>{if(this.enabled && !document.hidden)void this.sync();}),sharedCamera.onHand(frame=>{if(this.enabled && !document.hidden)this.frame(frame);}));
    try {if(sessionStorage.getItem(KEY)==='on')this.setEnabled(true);}catch{/* Optional session preference. */}
  }
  private render(): void {
    this.panel.classList.toggle('enabled',this.enabled);this.toggle.setAttribute('aria-pressed',String(this.enabled));
    this.toggle.title=t(this.enabled?'Kézkurzor kikapcsolása':'Kézkurzor bekapcsolása');this.toggle.setAttribute('aria-label',this.toggle.title);
  }
  private setEnabled(enabled:boolean):void {
    this.enabled=enabled;try{if(enabled)sessionStorage.setItem(KEY,'on');else sessionStorage.removeItem(KEY);}catch{/* Optional. */}
    this.render();
    if(enabled){this.pageActive=true;window.dispatchEvent(new Event('catspirits-hand-enable'));void this.sync();}
    else this.suspend();
  }
  private async sync():Promise<void> {
    if(this.disposed || !this.enabled || !this.pageActive || document.hidden)return;
    if(sharedCamera.hasGameHands){
      // The game owns the hand stream; keep its preview and reuse its landmarks.
      if(this.tracker){const tracker=this.tracker;this.tracker=undefined;++this.generation;tracker.dispose();this.cancel();}
      this.video.hidden=true;this.tick();return;
    }
    if(this.tracker)return;
    // Mark pending before imports and before claiming a shared camera (which
    // synchronously notifies subscribers). A generation invalidates late starts.
    const generation=++this.generation;this.status.textContent=t('Kézkurzor indítása…');
    let modules: [typeof import('../../core/tracking/CameraPoseTracker'), typeof import('../../core/tracking/hand.worker')];
    try { modules=await Promise.all([import('../../core/tracking/CameraPoseTracker'),import('../../core/tracking/hand.worker')]); }
    catch { if(generation===this.generation)this.status.textContent=t('A kézkövető nem töltődött be. Kapcsold ki, majd próbáld újra.');return; }
    const [{CameraPoseTracker},{createHandWorker}]=modules;
    if(generation!==this.generation || !this.enabled || this.disposed || !this.pageActive || document.hidden || sharedCamera.hasGameHands)return;
    this.video.hidden=false;
    const tracker=new CameraPoseTracker(this.video,{
      onFrame:frame=>{if(generation===this.generation)this.frame(frame);},
      onStatus:status=>{if(generation!==this.generation)return;if(status.state==='error'){this.status.textContent=t(status.message);this.cancel();}else if(status.state==='loading')this.status.textContent=t('Kézkurzor indítása…');}
    },createHandWorker,{role:'navigation'});
    this.tracker=tracker;tracker.setInputWidth(320);this.tick();await tracker.start();
  }
  private frame(frame:PoseFrame):void {
    const point=this.gesture.update(frame);
    if(!point){this.cancel();const text=t('Mutasd a nyitott kezed a kamerának.');if(this.status.textContent!==text)this.status.textContent=text;return;}
    this.lastSeen=performance.now();this.tick();this.point={x:point.x*innerWidth,y:point.y*innerHeight};
    this.cursor.hidden=false;this.cursor.style.transform=`translate3d(${this.point.x}px,${this.point.y}px,0)`;
    this.cursor.classList.toggle('target',this.pointer.move(this.point.x,this.point.y,!sharedCamera.hasGame));
    if(this.held && !point.held && point.edge!=='up')this.pointer.cancel();
    if(point.edge==='down')this.pointer.down();else if(point.edge==='up')this.pointer.up();
    this.held=point.held;this.cursor.classList.toggle('pressed',point.held);
    const text=t('Nyitott kéz: mozgatás · csippentés: kattintás');if(this.status.textContent!==text)this.status.textContent=text;
  }
  private tick():void {
    if(this.raf || !this.enabled || document.hidden)return;
    this.lastTick=performance.now();
    const run=(now:number)=>{
      this.raf=0;if(!this.enabled || document.hidden || this.disposed)return;
      const dt=Math.min(40,now-this.lastTick);this.lastTick=now;
      if(now-this.lastSeen>400){this.cancel();return;}
      if(this.point && !this.held){
        const direction=this.point.y<40?-1:this.point.y>innerHeight-40?1:0;
        if(direction!==this.edgeDirection){this.edgeDirection=direction;this.edgeSince=now;}
        if(direction && now-this.edgeSince>650){this.pointer.scroll(direction*dt*.45);this.pointer.move(this.point.x,this.point.y,!sharedCamera.hasGame);}
      }else{this.edgeDirection=0;this.edgeSince=now;}
      this.raf=requestAnimationFrame(run);
    };this.raf=requestAnimationFrame(run);
  }
  private cancel():void {this.pointer.cancel();this.gesture.reset();this.held=false;this.point=undefined;if(!this.cursor.hidden)this.cursor.hidden=true;this.edgeDirection=0;}
  private suspend():void {
    this.pageActive=false;++this.generation;const tracker=this.tracker;this.tracker=undefined;
    // Release after disabling recursion: visibility or enabled flag guards sync.
    tracker?.dispose();cancelAnimationFrame(this.raf);this.raf=0;this.cancel();this.pointer.closePopup();
  }
  dispose():void {this.disposed=true;this.enabled=false;this.abort.abort();this.unsubscribe.forEach(fn=>fn());this.suspend();this.pointer.dispose();this.panel.remove();this.cursor.remove();}
}
