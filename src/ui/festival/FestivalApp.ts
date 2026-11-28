import { getLanguage, localizedHtml, t } from '../../i18n';
import { ChipAudio } from '../../core/audio/ChipAudio';
import { BladeCamera } from '../../core/blade/BladeCamera';
import { RobotCamera } from '../../core/robot/RobotCamera';
import { cameraAccessError } from '../../core/tracking/SharedCamera';
import { FestivalControls } from '../../core/festival/controls';
import type { FestivalGame, FestivalId } from '../../core/festival/types';
import { createMission } from '../../core/festival/missions';
import { createWorkshop, type QuarryRover } from '../../core/festival/workshop';
import { RoverDisplay } from './RoverDisplay';
import { bindSoundToggle } from '../audio/soundToggle';
import { gameHeader } from '../shell/GameHeader';
import { accents, description, festivalId, ids, instructions, say, titles } from './catalog';
import { DemoReel, demoMarkup } from './DemoReel';
import './festival.css';

type Mode = 'wand' | 'hand' | 'touch';
type Phase = 'ready' | 'loading' | 'playing' | 'paused' | 'over';
const WIDTH = 800, HEIGHT = 560, ROUND = 75;
const create = (id:FestivalId):FestivalGame => id === 'jungle' || id === 'ferry' || id === 'herd' ? createMission(id) : createWorkshop(id);
const link = (id?:FestivalId) => `?game=arcade&lang=${getLanguage()}${id ? '&mission='+id : ''}`;
const modeName = (mode:Mode) => mode === 'wand' ? say('Jelölőbot','Marker wand','Markierstab') : mode === 'hand' ? say('Szabad kéz','Bare hand','Freie Hand') : say('Kézkurzor','Hand cursor','Handcursor');
const bestKey = (id:FestivalId,mode:Mode) => `catspirits.arcade.${id}.${mode}.v1`;
function readBest(id:FestivalId,mode:Mode): number {
  try { return Math.max(0,Number(localStorage.getItem(bestKey(id,mode))) || 0); } catch { return 0; }
}
function controlHelp(id:FestivalId,mode:Mode):string {
  if (mode==='wand') return say('Mutasd a kamerának a puha jelölőbotot. A markolattól a hegye felé két rózsaszín, majd két zöld gyűrű látszódjon.','Show the camera your soft marker wand. From grip to tip the rings are pink, pink, green, green.','Zeige der Kamera den weichen Stab. Vom Griff zur Spitze sind die Ringe rosa, rosa, grün und grün.');
  if (mode==='hand') return say('Nyisd ki a kezed. A tenyereddel célzol, csippentéssel aktiválsz, kézdöntéssel billentesz.','Open your hand. Aim with your palm, pinch to act and tilt your hand to balance.','Öffne die Hand. Ziele mit der Handfläche, löse mit einer Pinch-Geste aus und neige die Hand zum Balancieren.');
  if(id==='ferry') return say('Fel-le mozgással emelsz, balra-jobbra mozgással billentesz. Középen vízszintes.','Move up or down to lift, left or right to tilt. The centre is level.','Hoch und runter hebt, links und rechts kippt. In der Mitte ist das Brett waagerecht.');
  return say('Mozgasd a kézkurzort, és csippents az akcióhoz. Billentyűvel a nyilak és a szóköz irányítanak.','Move the hand cursor and pinch to act. The arrows and Space also work.','Bewege den Handcursor und kneife zwei Finger zusammen. Pfeiltasten und Leertaste funktionieren ebenfalls.');
}
export class FestivalApp {
  private readonly abort = new AbortController();
  private readonly id = festivalId(new URLSearchParams(location.search).get('mission'));
  private readonly audio = new ChipAudio(this.id ?? 'jungle');
  private readonly controls = new FestivalControls();
  private readonly keys = new Set<string>();
  private game?:FestivalGame;
  private reel?: DemoReel;
  private rover?: RoverDisplay;
  private board?:HTMLCanvasElement;
  private ctx?:CanvasRenderingContext2D;
  private camera?:BladeCamera|RobotCamera;
  private phase:Phase='ready';
  private mode:Mode='wand';
  private remaining=ROUND;
  private countdown=2;
  private raf=0;
  private generation=0;
  private previous=0;
  private x=.5;
  private y=.5;
  private pausedButton=false;
  private lastHud='';
  private readonly elements = new Map<string,HTMLElement>();
  private aim?: { x: number; y: number };
  private pointerOnBoard=false;
  private wasTracked=false;
  private missingSince?:number;

  constructor(private root:HTMLElement) {
    root.classList.add('festival-root');
    document.title = (this.id ? titles[this.id]+' · ' : '') + 'Catspirits Arcade';
    root.innerHTML = localizedHtml(gameHeader('arcade')) + (this.id ? this.room(this.id) : this.gallery());
    bindSoundToggle(root,this.audio,this.abort.signal);

    if (!this.id) {
      root.querySelectorAll<HTMLCanvasElement>('[data-preview]').forEach(canvas=>{
        const id=festivalId(canvas.dataset.preview ?? null), ctx=canvas.getContext('2d');
        if (id && ctx) { ctx.scale(.5,.5); create(id).draw(ctx,WIDTH,HEIGHT); }
      });
      this.reel = new DemoReel(root, this.audio, create, link, this.abort.signal);
      return;
    }
    this.board=this.el('[data-board]');
    this.ctx=this.board.getContext('2d') ?? undefined;
    this.game=create(this.id);
    if (this.id === 'rover') {
      this.rover = new RoverDisplay(root, () => this.draw(), this.abort.signal);
      if (new URLSearchParams(location.search).get('view') === '3d') void this.rover.enable();
    }
    this.draw(); this.bind(); this.hud();
    if(!this.ctx) this.message(say('A böngészőben nem érhető el a rajzfelület.','Canvas is unavailable in this browser.','Diese Ansicht benötigt Canvas.'));
  }
  private el<T extends HTMLElement>(selector:string):T {
    let node=this.elements.get(selector);
    if(!node){ node=this.root.querySelector<HTMLElement>(selector)!;this.elements.set(selector,node); }
    return node as T;
  }
  private gallery():string {
    return `<section class="arc-gallery"><div class="arc-intro"><div><h1>Motion <em>Arcade</em></h1></div><div class="arc-invite"><p>${say('Egy bot, hat küldetés. Válassz játékot egy 75 másodperces futamhoz.','One wand, six missions. Choose a game for a 75-second run.','Ein Stab, sechs Missionen. Wähle ein Spiel für eine 75-Sekunden-Runde.')}</p><button type="button" class="arc-demo-open" data-demo-open>▶ ${say('Standi bemutató','Booth demo','Stand-Demo')}</button></div></div>
      <div class="arc-grid">${ids.map(id=>`<a class="arc-card" style="--accent:${accents[id]}" data-route href="${link(id)}">
      <div class="arc-thumb"><canvas aria-hidden="true" data-preview="${id}" width="400" height="280"></canvas></div>
      <div class="arc-caption"><h2>${titles[id]}</h2><span aria-hidden="true">↗</span><p>${description(id)}</p></div></a>`).join('')}</div>${demoMarkup()}</section>`;
  }
  private room(id:FestivalId):string {
    return `<section class="arc-room" data-game-frame style="--accent:${accents[id]}"><div class="arc-top"><a data-route href="${link()}">← Arcade</a><h1>${titles[id]}</h1><button type="button" data-pause hidden>${t('Szünet')}</button></div>
      <div class="arc-layout"><section class="arc-arena"><div class="arc-stats"><span>${t('PONT')} <b data-score>0</b></span><span>${say('Idő','Time','Zeit')} <b data-time>75</b></span><span>${say('Rekord','Best','Rekord')} <b data-best>0</b></span></div>
      <div class="arc-screen"><canvas data-board width="${WIDTH}" height="${HEIGHT}" tabindex="0" aria-label="${titles[id]}"></canvas>${id==='rover' ? `<canvas data-rover-canvas width="800" height="560" aria-hidden="true" hidden></canvas><div class="arc-rover-hud" data-rover-hud hidden></div>` : ''}<div class="arc-screen-note" data-note role="status" hidden></div></div></section>
      <aside class="arc-controls"><p class="arc-objective">${description(id)}</p><p>${instructions(id)}</p>
      ${id==='rover' ? `<button data-rover-view aria-pressed="false">3D · ${say('Követőkamera','Chase camera','Verfolgerkamera')}</button><p data-rover-message role="status" hidden></p>` : ''}
      <fieldset><legend>${say('Irányítás','Controls','Steuerung')}</legend>${(['wand','hand','touch'] as const).map(mode=>`<label><input type="radio" name="arc-mode" value="${mode}" ${mode==='wand'?'checked':''}>${modeName(mode)}</label>`).join('')}</fieldset>
      <p data-help>${controlHelp(id,'wand')}</p><button class="arc-start" data-start>${say('Játék indítása','Start game','Spiel starten')} ▸</button>
      <p data-result role="status"></p>${id==='build' || id==='rover' ? `<a data-route class="arc-robot-link" data-robot-link hidden href="?game=robot&level=2&lang=${getLanguage()}">${say('Most irányíts egy robotkart','Pilot a robot arm next','Jetzt einen Roboterarm steuern')} →</a>` : ''}<a data-route class="arc-more" href="${link()}">${say('Másik küldetés','Choose another mission','Andere Mission wählen')} →</a></aside></div></section>`;
  }
  private bind():void {
    const signal=this.abort.signal, board=this.board!;
    this.el('[data-start]').addEventListener('click',()=>void this.start(),{signal});
    this.el('[data-pause]').addEventListener('click',()=>this.pause(),{signal});
    this.root.querySelectorAll<HTMLInputElement>('[name=arc-mode]').forEach(radio=>radio.addEventListener('change',()=>{
      if(!radio.checked)return;
      this.pause();
      this.mode=radio.value as Mode;
      // A change of input starts a separate leaderboard attempt.
      this.phase='ready'; this.game=create(this.id!); this.remaining=ROUND; this.countdown=2;
      this.el('[data-result]').textContent=''; this.message(''); this.draw();
      this.el('[data-help]').textContent=controlHelp(this.id!,this.mode); this.hud();
    },{signal}));
    const position = (event:PointerEvent,action:boolean) => {
      if(this.mode!=='touch' || this.phase!=='playing') return;
      const rect=board.getBoundingClientRect();
      if(!rect.width || !rect.height)return;
      this.x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
      this.y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
      this.pointerOnBoard=true;
      this.pointer(action);
    };
    board.addEventListener('pointerdown',e=>{if(e.button===0){position(e,true);board.focus({preventScroll:true});}},{signal});
    board.addEventListener('pointermove',e=>position(e,false),{signal});
    for(const event of ['pointerout','pointercancel']) {
      board.addEventListener(event,()=>{this.pointerOnBoard=false;},{signal});
    }
    board.addEventListener('keydown',e=>{
      if(e.key==='Escape'){this.pause();return;}
      if(this.phase!=='playing' || this.mode!=='touch')return;
      if(e.key.startsWith('Arrow') || e.code==='Space'){
        e.preventDefault();this.pointerOnBoard=true;this.keys.add(e.key); if(e.code==='Space' && !e.repeat)this.pointer(true);
      }
    },{signal});
    window.addEventListener('keyup',e=>this.keys.delete(e.key),{signal});
    board.addEventListener('blur',()=>this.keys.clear(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},{signal});
    window.addEventListener('pagehide',()=>this.pause(),{signal});
    window.addEventListener('catspirits-camera-lost', () => this.pause(), { signal });
  }
  private pointer(action:boolean):void {
    this.controls.pointer(this.x,this.y,this.id==='ferry' ? (this.x-.5)*1.5 : 0,action);
  }
  private async start():Promise<void> {
    if (!this.id || !this.ctx || document.hidden || this.phase==='playing' || this.phase==='loading')return;
    const resume=this.phase==='paused', generation=++this.generation;
    if(!resume) { this.audio.stop(); this.game=create(this.id); this.remaining=ROUND; }
    this.phase='loading';this.el('[data-result]').textContent='';this.countdown=2;this.previous=0;this.wasTracked=false;this.missingSince=undefined;
    this.controls.reset(); this.pointerOnBoard=false; this.x=this.y=.5; this.pointer(false); this.hud();
    void this.audio.unlock();
    try {
      if(this.mode!=='touch') {
        this.message(t('Mozgáskövetés előkészítése…'));
        const camera=this.mode==='wand' ? new BladeCamera(frame=>{
          if(generation===this.generation)this.controls.sword(frame,performance.now(),false);
        }) : new RobotCamera(frame=>{
          if(generation===this.generation)this.controls.hand(frame,performance.now());
        });
        this.camera=camera;
        const ready=await camera.start();
        if(generation!==this.generation)return;
        if(!ready)throw new Error(camera instanceof RobotCamera ? camera.lastError : 'camera-unavailable');
      }
      if(generation!==this.generation)return;
      this.phase='playing';this.hud();this.board!.focus({preventScroll:true});
      this.board!.scrollIntoView?.({block:'nearest'});
      this.raf=requestAnimationFrame(now=>this.frame(now));
    } catch(error) {
      if(generation!==this.generation)return;
      this.pause();
      this.el('[data-result]').textContent=t(cameraAccessError(error) ?? 'A követés nem indult el. Próbáld újra.');
    }
  }
  private halt():void {
    ++this.generation;cancelAnimationFrame(this.raf);this.raf=0;this.previous=0;
    this.camera?.stop();this.camera=undefined;this.controls.reset();this.keys.clear();
    this.audio.stop();
    this.aim=undefined; this.draw();
    this.board?.removeAttribute('data-hand-game-cursor');
  }
  private pause():void {
    if(this.phase==='over'){this.audio.sleep();return;}
    if(this.phase!=='playing' && this.phase!=='loading')return;
    this.halt();this.audio.sleep();this.phase='paused';this.message(t('Szünet'));this.hud();
  }
  private message(text:string):void {
    const note=this.el('[data-note]');
    if(note.textContent!==text)note.textContent=text;
    if(note.hidden!==!text)note.hidden=!text;
  }
  private frame(now:number):void {
    if(this.phase!=='playing')return;
    if(document.hidden){this.pause();return;}
    if(this.camera && !this.camera.running){this.pause();this.el('[data-result]').textContent=t('A kamera leállt. A folytatáshoz indítsd újra.');return;}
    if(this.previous && now-this.previous<1000/62){this.raf=requestAnimationFrame(time=>this.frame(time));return;}
    const clockStep=this.previous ? Math.max(0,(now-this.previous)/1000) : 0;
    // Keep booth rounds on wall time while bounding physics work after a long display stall.
    const dt=Math.min(.2,clockStep);
    this.previous=now;
    if(this.keys.size && this.mode==='touch'){
      this.x=Math.min(1,Math.max(0,this.x+dt*.9*(+this.keys.has('ArrowRight')-+this.keys.has('ArrowLeft'))));
      this.y=Math.min(1,Math.max(0,this.y+dt*.9*(+this.keys.has('ArrowDown')-+this.keys.has('ArrowUp'))));
      this.pointer(false);
    }
    const input=this.controls.read(now,this.mode!=='touch');
    if(!input){
      if(this.aim){this.aim=undefined;this.draw();}
      this.missingSince ??= now;
      if (!this.wasTracked || now-this.missingSince>=220) {
        this.message(this.mode==='wand'?say('Mutasd a jelölőbot négy gyűrűjét','Show all four wand rings','Zeige alle vier Ringe'):say('Mutasd a nyitott kezed','Show your open hand','Zeige die offene Hand'));
        if(this.wasTracked)this.audio.stop();
        this.wasTracked=false;
      }
    } else {
      const elapsed=this.missingSince===undefined ? clockStep : 0;
      this.missingSince=undefined;
      this.wasTracked=true;
      this.aim=this.mode!=='touch' || this.pointerOnBoard ? input : undefined;
      const playTime=Math.max(0,elapsed-this.countdown);
      this.countdown=Math.max(0,this.countdown-elapsed);
      if(this.countdown>0){this.message(String(Math.ceil(this.countdown)));this.draw();}
      else {
        this.message('');this.remaining=Math.max(0,this.remaining-playTime);this.audio.play();
        if(this.id==='paint')input.beatPhase=this.audio.beatPhase();
        let stepBudget=Math.min(dt,playTime);
        let stepInput=input;
        while (stepBudget>0 && !this.game!.won && !this.game!.lost) {
          const step=Math.min(.06,stepBudget);
          const cue=this.game!.update(step,stepInput);
          if(cue)this.audio.cue(cue);
          stepBudget-=step;
          if(stepBudget>0 && stepInput.action)stepInput={...input,action:false};
        }
        this.draw();this.hud();
        if(this.game!.won || this.game!.lost || this.remaining<=0){this.finish();return;}
      }
    }
    this.raf=requestAnimationFrame(time=>this.frame(time));
  }
  private draw():void {
    if(!this.ctx || !this.game || !this.id)return;
    if(this.rover?.draw(this.game as QuarryRover))return;
    this.ctx.save();this.game.draw(this.ctx,WIDTH,HEIGHT,!!this.aim);this.ctx.restore();
    if(this.aim && !this.game.showsOwnAim){
      const ctx=this.ctx,x=this.aim.x*WIDTH,y=this.aim.y*HEIGHT;
      ctx.save();ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);
      ctx.lineWidth=4;ctx.strokeStyle='#12263c';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='white';ctx.stroke();ctx.restore();
    }
  }
  private finish():void {
    this.halt();this.phase='over';this.audio.cue(this.game!.won ? 'finish' : this.game!.lost ? 'miss' : 'clear');
    const score=this.game!.score;
    try {localStorage.setItem(bestKey(this.id!,this.mode),String(Math.max(readBest(this.id!,this.mode),score)));}catch{/* Optional score. */}
    const title=this.game!.won ? say('Küldetés teljesítve!','Mission complete!','Mission geschafft!') : this.game!.lost ? say('Küldetés vége','Mission over','Mission beendet') : say('Lejárt az idő','Time’s up','Zeit abgelaufen');
    this.message(title);this.el('[data-result]').textContent=`${t('PONT')} · ${score}`;this.hud();
  }
  private hud():void {
    if(!this.id)return;
    const key=[this.phase,this.game?.score,Math.ceil(this.remaining),this.mode].join('.');
    if(key===this.lastHud)return;this.lastHud=key;
    this.board?.toggleAttribute('data-hand-game-cursor',this.phase==='playing' && this.mode==='touch');
    this.el('[data-score]').textContent=String(this.game?.score??0);this.el('[data-time]').textContent=String(Math.ceil(this.remaining));
    const active=this.phase==='playing' || this.phase==='loading';
    if(this.pausedButton!==active || !active) {
      this.el('[data-pause]').hidden=!active;this.el('[data-start]').hidden=active;this.pausedButton=active;
    }
    if (this.id==='build' || this.id==='rover') this.el('[data-robot-link]').hidden=this.phase!=='over';
    if(!active) {
      this.el('[data-best]').textContent=String(readBest(this.id,this.mode));
      this.el('[data-start]').textContent=this.phase==='paused' ? t('Folytatás') : this.phase==='over' ? say('Új futam','Play again','Neue Runde') : say('Játék indítása','Start game','Spiel starten');
    }
  }
  dispose():void { this.abort.abort();this.reel?.stop(false);this.rover?.dispose();if(this.board)this.halt();this.audio.dispose(); }
}
