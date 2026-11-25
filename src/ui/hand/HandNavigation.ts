import { t } from '../../i18n';
import type { CameraPoseTracker } from '../../core/tracking/CameraPoseTracker';
import { createTrackingOverlay, type TrackingOverlay } from '../../core/tracking/TrackingOverlay';
import { bindTrackingToggle, trackingToggle } from '../shell/trackingToggle';
import type { PoseFrame } from '../../core/tracking/types';
import { cameraAccessError, sharedCamera, type CameraLease } from '../../core/tracking/SharedCamera';
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
  private preview=document.createElement('div');
  private readonly linesButton: HTMLButtonElement;
  private readonly refreshLines: () => void;
  private stream?: MediaStream;
  private sharedOverlay?: TrackingOverlay;
  private status=document.createElement('span');
  private cursor=document.createElement('div');
  private gesture=new HandGesture();
  private pointer=new HandPointer();
  private tracker?: CameraPoseTracker;
  private lease?: CameraLease;
  private trackEvents?: AbortController;
  private startingTracker = false;
  private resumeGeneration = 0;
  private enabled=false;
  private disposed=false;
  private readonly label = document.createElement('span');
  private readonly hint = document.createElement('span');
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
    this.toggle.type='button';this.toggle.innerHTML=HAND;this.toggle.append(this.label);
    this.video.autoplay=true;this.video.muted=true;this.video.playsInline=true;this.video.setAttribute('aria-hidden','true');
    this.status.className='hand-status';this.status.setAttribute('role','status');
    this.hint.className='hand-instructions';
    const actions=document.createElement('div');
    actions.className='hand-actions';
    actions.innerHTML=trackingToggle;
    this.linesButton=actions.querySelector('button')!;
    actions.prepend(this.toggle);
    this.preview.className='hand-preview';
    this.preview.append(this.video);
    this.panel.append(actions,this.preview,this.status,this.hint);this.cursor.className='hand-cursor';this.cursor.hidden=true;this.cursor.setAttribute('aria-hidden','true');
    document.body.append(this.panel,this.cursor);
    this.refreshLines=bindTrackingToggle(this.panel,this.abort.signal);
    const signal=this.abort.signal;
    this.toggle.addEventListener('click',()=>this.setEnabled(!this.enabled || !this.lease),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.suspend();else void this.resume();},{signal});
    window.addEventListener('pagehide',()=>this.suspend(),{signal});
    window.addEventListener('pageshow',()=>void this.resume(),{signal});
    document.addEventListener('fullscreenchange',()=>{this.cancel();this.pointer.closePopup();(document.fullscreenElement ?? document.body).append(this.panel,this.cursor);},{signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){this.cancel();this.pointer.closePopup();}},{signal});
    // Frame/model sharing with Bit Rescue: never run a second hand detector.
    this.unsubscribe.push(
      // A tracker releases its lease synchronously during disposal. Switch video owners after cleanup.
      sharedCamera.subscribe(() => { if (this.lease) queueMicrotask(() => void this.sync()); }),
      sharedCamera.onHand(frame => {
        if (!this.lease || !this.pageActive || document.hidden || !sharedCamera.hasGameHands) return;
        this.sharedOverlay?.pose(frame);
        this.frame(frame);
      })
    );
    try { this.enabled = sessionStorage.getItem(KEY) === 'on'; } catch { /* Optional session preference. */ }
    this.refreshLanguage();
    void this.resume();
  }
  beforeRouteChange(): void {
    this.cancel();
    this.pointer.closePopup();
    document.body.append(this.panel, this.cursor);
  }

  refreshLanguage(): void {
    (document.fullscreenElement ?? document.body).append(this.panel, this.cursor);
    this.panel.setAttribute('aria-label',t('Kézkurzor'));
    this.label.textContent=t('Kézkurzor');
    this.refreshLines();
    this.hint.textContent=t('Mozgasd a kezed. Csippents a kattintáshoz, tartsd össze húzáshoz. A képernyő felső és alsó szélén görgethetsz.');
    this.status.textContent = this.enabled && !this.lease ? t('A folytatáshoz indítsd el a kézkurzort.') : '';
    this.cancel();
    this.pointer.closePopup();
    this.render();
  }
  private render(): void {
    this.linesButton.hidden=!this.lease;
    this.preview.hidden=!this.lease;
    this.panel.classList.toggle('enabled',this.enabled);this.toggle.setAttribute('aria-pressed',String(!!this.lease));
    this.toggle.title=t(this.lease?'Kézkurzor kikapcsolása':'Kézkurzor bekapcsolása');this.toggle.setAttribute('aria-label',this.toggle.title);
  }
  private setEnabled(enabled:boolean):void {
    this.enabled=enabled;try{if(enabled)sessionStorage.setItem(KEY,'on');else sessionStorage.removeItem(KEY);}catch{/* Optional. */}
    ++this.resumeGeneration;
    if (enabled) {
      window.dispatchEvent(new Event('catspirits-hand-enable'));
      this.startCapture();
    } else this.suspend();
    this.render();
  }
  private async resume(): Promise<void> {
    this.pageActive = !document.hidden;
    if (!this.enabled || !this.pageActive || this.lease) return;
    const generation = ++this.resumeGeneration;
    const permitted = await sharedCamera.canResume();
    if (generation !== this.resumeGeneration || !this.pageActive || document.hidden || this.disposed) return;
    if (permitted) this.startCapture();
    else this.status.textContent = t('A folytatáshoz indítsd el a kézkurzort.');
  }

  private startCapture(): void {
    if (this.lease || document.hidden) return;
    this.pageActive = true;
    this.status.textContent = t('Kézkurzor indítása…');
    // Keep a capture lease even when the robot provides the hand landmarks.
    // Replacing the detector or the current game must not close the camera.
    const lease = sharedCamera.claim('navigation');
    this.lease = lease;
    this.render();
    void lease.ready.then(stream => {
      if (this.lease !== lease) return;
      this.stream = stream;
      const events = this.trackEvents = new AbortController();
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (this.lease !== lease) return;
        this.suspend();
        this.status.textContent = t('A folytatáshoz indítsd el a kézkurzort.');
      }, { signal: events.signal });
      void this.sync();
    }, error => {
      if (this.lease !== lease) return;
      this.suspend();
      this.status.textContent = t(cameraAccessError(error) ?? 'A kézkövető nem töltődött be. Kapcsold ki, majd próbáld újra.');
    });
  }

  private async sync():Promise<void> {
    if(this.disposed || !this.enabled || !this.pageActive || document.hidden || !this.stream || !sharedCamera.hasCapture)return;
    if(sharedCamera.hasGameHands){
      // The game's detector supplies landmarks for both previews on the same stream.
      if(this.tracker){const tracker=this.tracker;this.tracker=undefined;++this.generation;tracker.dispose();this.cancel();}
      this.video.hidden=false;
      if (!this.sharedOverlay) {
        this.video.srcObject=this.stream;
        this.sharedOverlay=createTrackingOverlay(this.video);
        // Autoplay restrictions on a secondary preview must leave cursor input available.
        void this.video.play().catch(() => {});
      }
      this.tick();return;
    }
    this.closeSharedPreview();
    if(this.tracker || this.startingTracker)return;
    this.startingTracker = true;
    // Mark pending before imports and before claiming a shared camera (which
    // synchronously notifies subscribers). A generation invalidates late starts.
    const generation=++this.generation;this.status.textContent=t('Kézkurzor indítása…');
    let modules: [typeof import('../../core/tracking/CameraPoseTracker'), typeof import('../../core/tracking/hand.worker')];
    try { modules=await Promise.all([import('../../core/tracking/CameraPoseTracker'),import('../../core/tracking/hand.worker')]); }
    catch {
      if (generation === this.generation) {
        this.suspend();
        this.status.textContent = t('A kézkövető nem töltődött be. Kapcsold ki, majd próbáld újra.');
      }
      return;
    }
    if (generation === this.generation) this.startingTracker = false;
    const [{CameraPoseTracker},{createHandWorker}]=modules;
    if(generation!==this.generation || !this.enabled || this.disposed || !this.pageActive || document.hidden || sharedCamera.hasGameHands)return;
    this.video.hidden=false;
    const tracker=new CameraPoseTracker(this.video,{
      onFrame:frame=>{if(generation===this.generation)this.frame(frame);},
      onStatus:status=>{if(generation!==this.generation)return;if(status.state==='error'){this.suspend();this.status.textContent=t(status.message);}else if(status.state==='loading')this.status.textContent=t('Kézkurzor indítása…');}
    },createHandWorker,{role:'navigation'});
    this.tracker=tracker;tracker.setInputWidth(320);this.tick();await tracker.start();
  }
  private frame(frame:PoseFrame):void {
    const point=this.gesture.update(frame,performance.now(),{width:innerWidth,height:innerHeight,allowDrag:this.pointer.canDrag});
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
  private closeSharedPreview():void {
    if (!this.sharedOverlay) return;
    this.sharedOverlay.dispose();
    this.sharedOverlay=undefined;
    this.video.pause();
    this.video.srcObject=null;
  }
  private suspend():void {
    this.pageActive=false;++this.generation;++this.resumeGeneration;this.startingTracker=false;
    const tracker=this.tracker;this.tracker=undefined;
    const lease=this.lease;this.lease=undefined;
    this.stream=undefined;this.closeSharedPreview();
    // Release after disabling recursion: visibility or enabled flag guards sync.
    this.trackEvents?.abort();this.trackEvents=undefined;tracker?.dispose();lease?.release();this.video.hidden=true;this.render();cancelAnimationFrame(this.raf);this.raf=0;this.cancel();this.pointer.closePopup();
  }
  dispose():void {this.disposed=true;this.enabled=false;this.abort.abort();this.unsubscribe.forEach(fn=>fn());this.suspend();this.pointer.dispose();this.panel.remove();this.cursor.remove();}
}
