import { getLanguage, isLanguage, LANGUAGE_KEY, localizedHtml, t } from '../../i18n';
import { JumperSimulation, WORLDS, SUITS, DUCK_GATE_HALF_DEPTH, freshSave, validateSave, type JumperSave, type JumperPhase } from '../../core/jumper/JumperSimulation';
import { JumperView } from '../../core/jumper/JumperView';
import { JumperAudio } from '../../core/jumper/JumperAudio';
import { JumperCamera } from '../../core/jumper/JumperCamera';

const icon = (name: 'play' | 'pause' | 'sound' | 'expand' | 'robot' | 'world' | 'close' | 'arrow' | 'home') => {
  const paths = { play:'M9 5l11 7-11 7V5z', pause:'M8 5v14M16 5v14', sound:'M11 5L6 9H3v6h3l5 4V5zM15 8a6 6 0 010 8M18 5a10 10 0 010 14',
    expand:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5', robot:'M8 6V3M16 6V3M5 7h14v12H5V7zM9 11v3M15 11v3M10 17h4',
    world:'M3 12a9 9 0 1018 0 9 9 0 10-18 0zM3 12h18M12 3a18 18 0 010 18 18 18 0 010-18z', close:'M6 6l12 12M18 6L6 18',
    arrow:'M4 12h16M14 6l6 6-6 6', home:'M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]}"/></svg>`;
};
const STORAGE_KEY = 'catspirits.cyber-jumper.v1';

export class JumperApp {
  private simulation = new JumperSimulation();
  private view: JumperView;
  private audio = new JumperAudio();
  private camera: JumperCamera;
  private save: JumperSave;
  private previousPhase: JumperPhase = 'ready';
  private lastTime = 0;
  private raf = 0;
  private mode: 'keys' | 'camera' = 'camera';
  private selectedLevel = 0;
  private modalName = '';
  private muted = false;
  private toastTime = 0;
  private cameraSetup = false;
  private cameraMessage = '';
  private cameraError = false;
  private starting = false;
  private destroyed = false;
  private abort = new AbortController();
  private swipeX = 0;
  private swipeY = 0;
  private contextLost = false;
  private previewSignature = '';
  private cameraResponse: 'quick' | 'steady' = 'quick';
  private duckSources = new Set<string>();
  private duckPresses = new Map<string,number>();

  constructor(private root: HTMLElement) {
    try { this.save = validateSave(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')); } catch { this.save = freshSave(); }
    root.innerHTML = localizedHtml(`
      <canvas class="jumper-scene" tabindex="0" aria-label="Cyber Jumper játékpálya. Szóköz: ugrás, le nyíl vagy S: lehajolás, bal és jobb nyíl: sávváltás, P: szünet."></canvas>
      <div class="jumper-vignette" aria-hidden="true"></div>
      <header class="jumper-header">
        <button class="jumper-brand" data-home aria-label="Cyber Jumper kezdőlap"><span class="brand-mark">${icon('robot')}</span><span>CATSPIRITS<strong>CYBER JUMPER<span>↗</span></strong></span></button>
        <nav aria-label="Játék menü">
          <button data-worlds class="nav-text">${icon('world')}<span>Pályák</span></button>
          <button data-suits class="nav-text" aria-label="Robotom">${icon('robot')}<span>Robotom</span></button>
          <button data-settings class="icon-button" aria-label="Hang és megjelenés beállításai" title="Hang és megjelenés">${icon('sound')}</button>
          <button data-fullscreen class="icon-button" aria-label="Teljes képernyő" title="Teljes képernyő">${icon('expand')}</button>
          <button data-pause class="icon-button pause-button" hidden aria-label="Játék szüneteltetése" title="Szünet (P)">${icon('pause')}</button>
        </nav>
      </header>
      <section class="jumper-hero" aria-label="Kezdőképernyő">
        <fieldset class="language-switch"><legend>Nyelv</legend><button type="button" data-language="en" lang="en" aria-pressed="${getLanguage()==='en'}">English</button><button type="button" data-language="hu" lang="hu" aria-pressed="${getLanguage()==='hu'}">Magyar</button><button type="button" data-language="de" lang="de" aria-pressed="${getLanguage()==='de'}">Deutsch</button></fieldset>
        <div class="hero-badge"><span></span> KAMERÁS MOZGÁS · 5 VILÁG</div>
        <h1>MOZDULJ A<br><span>JÖVŐBE.</span></h1>
        <p>A mozdulataid irányítják Bitet.<br class="desktop-break"> Ugorj, hajolj le, és dőlj oldalra a kamera előtt!</p>
        <div class="hero-actions"><button class="jumper-primary" data-play>${icon('play')} JÁTSSZUNK! ${icon('arrow')}</button><button class="how-button" data-help>Hogyan játszom?</button></div>
        <fieldset class="input-mode"><legend>Így játszom</legend><label><input type="radio" name="mode" value="camera" checked> Kamerás mozgás</label><label><input type="radio" name="mode" value="keys"> Billentyű / érintés</label></fieldset>
        <small class="hero-privacy">A kamera képe a gépeden marad.</small>
        <div class="hero-world"><span class="world-orbit">01</span><div><small>ITT KEZDŐDIK</small><strong data-selected-world>Neonváros</strong></div><button data-worlds-link aria-label="Másik világ választása">${icon('arrow')}</button></div>
      </section>
      <div class="robot-caption" aria-hidden="true"><span>ISMERD MEG BITET!</span><small>A te kis neon útitársad.</small></div>
      <section class="jumper-hud" hidden aria-label="Játék állapota">
        <div class="hud-world"><span data-level-number>01 / 05</span><strong data-level-name>Neonváros</strong></div>
        <div class="hud-stats"><div><small>PONT</small><strong data-score>0</strong></div><div class="crystal-stat"><span>◆</span><strong data-crystals>0</strong></div><div data-hearts class="hearts" aria-label="3 élet">♥ ♥ ♥</div><span data-shield hidden title="Védőpajzs">◈</span></div>
      </section>
      <aside class="course-lookahead" hidden aria-label="Következő pályaszakaszok"><span class="lookahead-title">JÖN A PÁLYÁN <small>↑ ugrás · ↓ hajolás · ◈ pajzs</small></span><ol data-course-preview></ol></aside>
      <div class="game-toast" role="status" aria-live="polite" hidden></div>
      <div class="tracking-notice" role="status" hidden></div>
      <div class="jump-cue" hidden><span>↑</span> UGROTTAM!</div>
      <div class="course-progress" hidden><div><span data-course-label>FÉNYFUTAM</span><span data-course-count>0 / 8</span></div><progress max="1" value="0" aria-label="Pálya haladása"></progress></div>
      <div class="touch-controls" hidden><div class="lane-controls"><button data-left aria-label="Bal sáv">←</button><button data-right aria-label="Jobb sáv">→</button></div><div class="action-controls"><button data-duck hidden aria-label="Lehajolás: tartsd lenyomva" aria-pressed="false"><span>↓</span>HAJOLJ LE</button><button data-jump aria-label="Ugrás"><span>↑</span>UGRÁS</button></div></div>
      <footer class="jumper-footer"><div class="control-hint"><kbd>SPACE</kbd><span>ugrás</span><kbd>← →</kbd><span>sávváltás</span><kbd class="duck-key-hint">↓ / S</kbd><span class="duck-key-hint">lehajolás</span><kbd>P</kbd><span>szünet</span></div><span class="best-score">REKORD <strong data-best>0</strong></span></footer>
      <aside class="camera-preview" hidden aria-label="Kamera előnézet"><video autoplay muted playsinline></video><span>TE · TÜKÖRKÉP</span><button data-camera-off aria-label="Kamerás mód kikapcsolása">${icon('close')}</button></aside>
      <div class="jumper-modal-backdrop" hidden><section class="jumper-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"></section></div>`);
    const canvas=this.el<HTMLCanvasElement>('canvas');
    this.view=new JumperView(canvas); this.view.setSuit(this.save.suit);
    this.audio.setVolumes(this.save.music,this.save.effects);
    this.camera=new JumperCamera(this.el('video'), strength=>this.simulation.jump(strength), (message,state)=>{
      this.cameraMessage=t(message);this.cameraError=state==='error';
      if(this.cameraSetup)this.updateCameraSetup();
    });
    this.el('[data-best]').textContent=t(this.save.best.toLocaleString(getLanguage()));
    this.bind(); this.updatePlayLabel(); this.updateHud(); this.raf=requestAnimationFrame(time=>this.frame(time));
    if(import.meta.env.DEV) (window as unknown as { catspirits: unknown }).catspirits={
      snapshot:()=>({phase:this.simulation.phase,level:this.simulation.level,score:this.simulation.score,hearts:this.simulation.hearts,
        crystals:this.simulation.crystals,progress:this.simulation.progress,height:this.simulation.runner.state.height,lane:this.simulation.lane,
        shield:this.simulation.shield,save:this.save,audio:this.audio.snapshot(),view:this.view.snapshot(),mode:this.mode}),
      simulation:this.simulation,
    };
    if(import.meta.env.DEV){const diagnostics=document.createElement('output');diagnostics.hidden=true;diagnostics.dataset.diagnostics='';this.root.append(diagnostics);}
  }

  private el<T extends HTMLElement>(selector:string):T {return this.root.querySelector<T>(selector)!;}
  private on(selector:string,action:()=>void):void {this.el(selector).addEventListener('click',action,{signal:this.abort.signal});}
  private updatePlayLabel():void {
    const camera=this.mode==='camera';
    this.el('[data-play]').innerHTML=`${icon('play')} ${t(camera?'KAMERA INDÍTÁSA':'JÁTSSZUNK!')} ${icon('arrow')}`;
    const hint=this.el('.control-hint');hint.classList.toggle('camera-controls',camera);
    hint.innerHTML=localizedHtml(camera?'<span>↑ ugrás · ↓ hajolás · ↔ oldalra dőlés</span>':'<kbd>SPACE</kbd><span>ugrás</span><kbd>← →</kbd><span>sávváltás</span><kbd class="duck-key-hint">↓ / S</kbd><span class="duck-key-hint">lehajolás</span><kbd>P</kbd><span>szünet</span>');
    this.el('canvas').setAttribute('aria-label',t(camera?'Cyber Jumper játékpálya. Kamerával: ugrás, lehajolás, oldalra dőlés. P: szünet.':'Cyber Jumper játékpálya. Szóköz: ugrás, le nyíl vagy S: lehajolás, bal és jobb nyíl: sávváltás, P: szünet.'));
  }
  private persist():void {try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.save));}catch{/* Private browsers can play without saving. */}}

  private bind():void {
    this.on('[data-play]',()=>void this.start());
    this.on('[data-home]',()=>this.home()); this.on('[data-pause]',()=>this.pause());
    this.on('[data-worlds]',()=>this.showWorlds()); this.on('[data-worlds-link]',()=>this.showWorlds());
    this.on('[data-suits]',()=>this.showSuits()); this.on('[data-settings]',()=>this.showSettings()); this.on('[data-help]',()=>this.showHelp());
    this.on('[data-fullscreen]',()=>{
      if(document.fullscreenElement) void document.exitFullscreen().catch(()=>{});
      else if(this.root.requestFullscreen) void this.root.requestFullscreen().catch(()=>this.toast('Teljes képernyő ezen a böngészőn nem érhető el.'));
      else this.toast('Teljes képernyő ezen a böngészőn nem érhető el.');
    });
    this.on('[data-camera-off]',()=>{this.home();this.mode='keys';this.el<HTMLInputElement>('[value="keys"]').checked=true;this.updatePlayLabel();});
    this.root.querySelectorAll<HTMLInputElement>('[name="mode"]').forEach(input=>input.addEventListener('change',()=>{
      this.mode=input.value as 'keys'|'camera';this.updatePlayLabel();
    },{signal:this.abort.signal}));
    for(const [selector,action] of [['[data-left]',()=>this.simulation.move(-1)],['[data-right]',()=>this.simulation.move(1)],['[data-jump]',()=>this.simulation.jump()]] as const){
      const button=this.el(selector);
      let pointerHandled=false;
      button.addEventListener('pointerdown',event=>{event.preventDefault();pointerHandled=true;action();},{signal:this.abort.signal});
      button.addEventListener('pointercancel',()=>{pointerHandled=false;},{signal:this.abort.signal});
      // Accessibility activation may emit only click. A pointer gesture is consumed once.
      button.addEventListener('click',event=>{if(!pointerHandled || event.detail===0)action();pointerHandled=false;},{signal:this.abort.signal});
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-language]').forEach(button=>button.addEventListener('click',()=>{
      const language=button.dataset.language;
      if(!isLanguage(language))return;
      if(language===getLanguage())return;
      this.persist();
      try { localStorage.setItem(LANGUAGE_KEY,language); } catch { /* URL also stores the choice. */ }
      const url=new URL(location.href);url.searchParams.set('lang',language);location.assign(url.href);
    },{signal:this.abort.signal}));
    this.bindDuckButton();
    const canvas=this.el('canvas');
    canvas.addEventListener('pointerdown',event=>{this.swipeX=event.clientX;this.swipeY=event.clientY;},{signal:this.abort.signal});
    canvas.addEventListener('pointerup',event=>{
      if(this.modalName || this.cameraSetup)return;
      const dx=event.clientX-this.swipeX,dy=event.clientY-this.swipeY;
      if(Math.abs(dx)>35 && Math.abs(dx)>Math.abs(dy))this.simulation.move(Math.sign(dx));
      else if(dy>35)this.simulation.duck();else this.simulation.jump();
    },{signal:this.abort.signal});
    window.addEventListener('keydown',event=>this.key(event),{signal:this.abort.signal});
    window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();if(['arrowdown','s'].includes(key))this.holdDuck(`key:${key}`,false);},{signal:this.abort.signal});
    window.addEventListener('blur',()=>{this.releaseDuckControls();this.pause();},{signal:this.abort.signal});
    window.addEventListener('resize',()=>this.view.resize(),{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){this.pause();this.audio.stop();if(this.mode==='camera'){this.camera.stop();this.cameraMessage='A kamera leállt a lapváltáskor.';}}
    },{signal:this.abort.signal});
    window.addEventListener('pagehide',event=>{
      if(event.persisted){this.pause();this.audio.stop();this.camera.stop();}
      else this.dispose();
    },{signal:this.abort.signal});
    window.addEventListener('pageshow',()=>{this.lastTime=0;},{signal:this.abort.signal});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.pause();this.toast('A 3D megjelenítés megállt. Frissítsd az oldalt a folytatáshoz.');},{signal:this.abort.signal});
    this.el('.jumper-modal-backdrop').addEventListener('click',event=>{if(event.target===event.currentTarget && ['worlds','suits','settings','help'].includes(this.modalName))this.closeModal();},{signal:this.abort.signal});
  }

  private holdDuck(source:string,held:boolean):void {
    if(held && this.simulation.phase==='running')this.duckSources.add(source);else this.duckSources.delete(source);
    this.simulation.setDucking(this.duckSources.size>0);
  }
  private releaseDuckControls():void {this.duckSources.clear();this.duckPresses.clear();this.simulation.setDucking(false);}
  private bindDuckButton():void {
    const button=this.el('[data-duck]'),signal=this.abort.signal;
    let pointerHandled=false;
    const presses=this.duckPresses;
    const start=(source:string)=>{if(!presses.has(source))presses.set(source,performance.now());this.holdDuck(source,true);};
    const release=(source:string,allowTap=false)=>{
      const time=presses.get(source);presses.delete(source);this.holdDuck(source,false);
      if(allowTap && time!==undefined && performance.now()-time<200)this.simulation.duck();
    };
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();pointerHandled=true;button.setPointerCapture(event.pointerId);start(`pointer:${event.pointerId}`);
    },{signal});
    for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)button.addEventListener(name,event=>release(`pointer:${event.pointerId}`,name==='pointerup'),{signal});
    button.addEventListener('keydown',event=>{
      if([' ','Enter'].includes(event.key)){event.preventDefault();start(`button:${event.key}`);}
    },{signal});
    button.addEventListener('keyup',event=>{
      if([' ','Enter'].includes(event.key)){event.preventDefault();release(`button:${event.key}`,true);}
    },{signal});
    button.addEventListener('blur',()=>{release('button: ');release('button:Enter');},{signal});
    button.addEventListener('click',event=>{if(!pointerHandled || event.detail===0)this.simulation.duck();pointerHandled=false;},{signal});
  }

  private key(event:KeyboardEvent):void {
    if(event.defaultPrevented)return;
    if(event.key==='Tab' && this.modalName){
      const controls=[...this.el('.jumper-modal').querySelectorAll<HTMLElement>('button:not(:disabled),input,select')].filter(e=>!e.hidden);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey && (document.activeElement===first || !controls.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !controls.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus();}
      return;
    }
    if(event.key==='Escape'){
      if(this.cameraSetup)this.home();else if(this.modalName==='pause')this.resume();else if(['worlds','suits','settings','help'].includes(this.modalName))this.closeModal();else this.pause();
      return;
    }
    if(event.key.toLowerCase()==='p' && this.modalName==='pause' && !event.repeat){event.preventDefault();this.resume();return;}
    const key=event.key.toLowerCase();
    if(!this.modalName && !this.cameraSetup && this.simulation.phase==='running' && ['arrowdown','s'].includes(key)
      && !['INPUT','SELECT','TEXTAREA'].includes((event.target as HTMLElement)?.tagName)){
      event.preventDefault();this.holdDuck(`key:${key}`,true);return;
    }
    if(this.modalName || this.cameraSetup || event.repeat || ['INPUT','SELECT','TEXTAREA'].includes((event.target as HTMLElement)?.tagName))return;
    if([' ','arrowup','w','arrowleft','arrowright','a','d','p'].includes(key))event.preventDefault();
    if(key==='p'){if(this.simulation.phase==='paused')this.resume();else this.pause();}
    if(this.simulation.phase!=='running')return;
    if([' ','arrowup','w'].includes(key))this.simulation.jump();
    if(['arrowleft','a'].includes(key))this.simulation.move(-1);
    if(['arrowright','d'].includes(key))this.simulation.move(1);
  }

  private async start():Promise<void> {
    if(this.starting)return;
    await this.audio.unlock();
    if(this.mode==='camera'){
      this.cameraSetup=true;this.starting=true;this.cameraError=false;
      this.el('.camera-preview').hidden=false;this.showCameraSetup();
      await this.camera.start();this.starting=false;
      if(this.cameraSetup)this.updateCameraSetup();
      return;
    }
    this.begin();
  }

  private begin():void {
    this.cameraSetup=false;this.starting=false;this.closeModal(false);
    this.simulation.start(this.selectedLevel,this.save.difficulty);this.syncPhase();
    this.audio.play(this.simulation.level);this.el('canvas').focus();
    this.toast(this.simulation.level>=2?'↑ Lila: ugrás · ↓ Arany: lehajolás':'Kövesd a kristályokat. A fénykapunál ugorj!',this.simulation.level>=2?4:2.1);
  }

  private home():void {
    this.camera.stop();this.starting=this.cameraSetup=false;this.el('.camera-preview').hidden=true;
    this.simulation.phase='ready';this.simulation.runner.reset();this.simulation.pickups=[];
    this.simulation.level=this.selectedLevel;this.simulation.lane=0;this.closeModal(false);this.audio.stop();this.syncPhase();
  }

  private pause():void {
    if(this.simulation.phase!=='running')return;
    this.simulation.pause();this.audio.stop();this.syncPhase();
    this.openModal('pause',`<span class="modal-eyebrow">EGY KIS PIHENŐ</span><h2 id="modal-title">Szünet.</h2><p>Bit megvár. Innen folytatjuk!</p><button class="jumper-primary wide" data-resume>${icon('play')} Folytatás</button><button class="jumper-secondary wide" data-retry>Újrakezdem a pályát</button><button class="modal-text-button" data-back>Vissza a kezdőlapra</button>`);
    this.modalOn('[data-resume]',()=>this.resume());this.modalOn('[data-retry]',()=>{this.closeModal(false);this.simulation.retry();this.syncPhase();this.audio.play(this.simulation.level);});this.modalOn('[data-back]',()=>this.home());
  }

  private resume():void {
    if(this.contextLost)return;
    if(this.mode==='camera' && !this.camera.input(true).tracked){this.cameraSetup=true;this.showCameraSetup(true);void this.camera.start();return;}
    this.closeModal(false);this.simulation.resume();this.syncPhase();void this.audio.unlock().then(()=>this.audio.play(this.simulation.level));this.el('canvas').focus();
  }

  private openModal(name:string,html:string):void {
    // Auxiliary panels leave the run paused until the panel is closed.
    if(this.simulation.phase==='running'){this.simulation.pause();this.audio.stop();this.syncPhase();}
    this.modalName=name;const backdrop=this.el('.jumper-modal-backdrop');backdrop.hidden=false;
    this.el('.jumper-modal').innerHTML=localizedHtml(html);this.el('.jumper-modal').focus();
    this.root.querySelectorAll<HTMLElement>('.jumper-header,.jumper-hero,.touch-controls,canvas,.camera-preview').forEach(element=>element.inert=true);
    this.el('.jumper-modal').querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  private modalOn(selector:string,action:()=>void):void {this.el(selector).addEventListener('click',action,{signal:this.abort.signal});}
  private closeModal(resume=true):void {
    this.modalName='';this.el('.jumper-modal-backdrop').hidden=true;
    this.root.querySelectorAll<HTMLElement>('[inert]').forEach(element=>element.inert=false);
    if(resume && this.simulation.phase==='paused'){this.simulation.resume();this.syncPhase();this.audio.play(this.simulation.level);this.el('canvas').focus();}
    else if(this.simulation.phase==='ready')this.el('[data-play]').focus();
  }
  private closeButton():string {return `<button class="modal-close" data-modal-close aria-label="Bezárás">${icon('close')}</button>`;}

  private showWorlds():void {
    this.openModal('worlds',`${this.closeButton()}<span class="modal-eyebrow">IRÁNY A KÖVETKEZŐ KALAND</span><h2 id="modal-title">Öt világ vár.</h2><p>Teljesíts egy világot, és megnyílik a következő!</p><div class="world-list">${WORLDS.map((world,index)=>{
      const unlocked=index===0 || this.save.stars[index-1]>0;
      return `<button class="world-card ${index===this.selectedLevel?'selected':''}" data-world="${index}" ${unlocked?'':'disabled'} style="--world-color:${world.color}"><span class="world-number">${String(index+1).padStart(2,'0')}</span><span><strong>${world.name}</strong><small>${unlocked?world.subtitle:'Az előző világ után nyílik meg'}</small></span><span class="world-stars" aria-label="${this.save.stars[index]} csillag">${unlocked?'★'.repeat(this.save.stars[index])+'☆'.repeat(3-this.save.stars[index]):'⌑'}</span></button>`;
    }).join('')}</div>`);
    this.modalOn('[data-modal-close]',()=>this.closeModal());
    this.root.querySelectorAll<HTMLButtonElement>('[data-world]').forEach(button=>button.addEventListener('click',()=>{
      this.selectedLevel=Number(button.dataset.world);this.simulation.level=this.selectedLevel;
      this.el('[data-selected-world]').textContent=t(WORLDS[this.selectedLevel].name);this.el('.world-orbit').textContent=t(String(this.selectedLevel+1).padStart(2,'0'));
      this.home();
    },{signal:this.abort.signal}));
  }

  private showSuits():void {
    const stars=this.save.stars.reduce((a,b)=>a+b,0);
    this.openModal('suits',`${this.closeButton()}<span class="modal-eyebrow">BIT RUHATÁRA · ${stars} / 15 ★</span><h2 id="modal-title">A te robotod.</h2><p>A csillagok új neonszíneket nyitnak meg.</p><div class="suit-grid">${SUITS.map((suit,index)=>`<button class="suit-card ${index===this.save.suit?'selected':''}" data-suit="${index}" ${stars>=suit.requiredStars?'':'disabled'} style="--suit-color:${suit.color}"><span class="suit-face">${icon('robot')}</span><strong>${suit.name}</strong><small>${index===this.save.suit?'KIVÁLASZTVA':stars>=suit.requiredStars?'VÁLASZTHATÓ':t('{count} ★ után',{count:suit.requiredStars})}</small></button>`).join('')}</div>`);
    this.modalOn('[data-modal-close]',()=>this.closeModal());
    this.root.querySelectorAll<HTMLButtonElement>('[data-suit]').forEach(button=>button.addEventListener('click',()=>{
      this.save.suit=Number(button.dataset.suit);this.view.setSuit(this.save.suit);this.persist();this.showSuits();
    },{signal:this.abort.signal}));
  }

  private showSettings():void {
    this.openModal('settings',`${this.closeButton()}<span class="modal-eyebrow">SAJÁT RITMUSOD</span><h2 id="modal-title">Hang & fény.</h2><label class="slider-label" for="jumper-music">Zene <output data-music-output>${Math.round(this.save.music*100)}%</output><input id="jumper-music" aria-label="Zene hangereje" data-music type="range" min="0" max="100" value="${Math.round(this.save.music*100)}"></label><label class="slider-label" for="jumper-effects">Játékhangok <output data-effects-output>${Math.round(this.save.effects*100)}%</output><input id="jumper-effects" aria-label="Játékhangok hangereje" data-effects type="range" min="0" max="100" value="${Math.round(this.save.effects*100)}"></label><label class="setting-row"><span>Csendes mód<small>Egy gombbal minden hang kikapcsolható.</small></span><input data-mute type="checkbox" ${this.muted?'checked':''}></label><label class="setting-row"><span>Nyugis kaland<small>Lassabb pálya, 5 élet. Új futamnál érvényes.</small></span><input data-chill type="checkbox" ${this.save.difficulty==='chill'?'checked':''}></label><label class="setting-row"><span>Kevesebb mozgó effekt<small>Részecskék és képernyőrázás nélkül.</small></span><input data-reduced type="checkbox" ${this.view.reducedMotion?'checked':''}></label>`);
    this.modalOn('[data-modal-close]',()=>this.closeModal());
    for(const key of ['music','effects'] as const)this.el<HTMLInputElement>(`[data-${key}]`).addEventListener('input',event=>{
      this.save[key]=Number((event.target as HTMLInputElement).value)/100;this.el(`[data-${key}-output]`).textContent=t(Math.round(this.save[key]*100)+'%');
      this.volumes();this.persist();void this.audio.unlock();
    },{signal:this.abort.signal});
    this.el<HTMLInputElement>('[data-mute]').addEventListener('change',event=>{this.muted=(event.target as HTMLInputElement).checked;this.volumes();},{signal:this.abort.signal});
    this.el<HTMLInputElement>('[data-chill]').addEventListener('change',event=>{this.save.difficulty=(event.target as HTMLInputElement).checked?'chill':'normal';this.persist();},{signal:this.abort.signal});
    this.el<HTMLInputElement>('[data-reduced]').addEventListener('change',event=>{this.view.reducedMotion=(event.target as HTMLInputElement).checked;},{signal:this.abort.signal});
  }
  private volumes():void {this.audio.setVolumes(this.muted?0:this.save.music,this.muted?0:this.save.effects);}

  private showHelp():void {
    this.openModal('help',`${this.closeButton()}<span class="modal-eyebrow">EGY PERC, ÉS MEHETÜNK</span><h2 id="modal-title">Ugorj. Gyűjts. Ragyogj.</h2><p class="help-camera">Kamerával: állj úgy, hogy a vállad és a csípőd látszódjon. Kalibrálás után ugorj, hajolj le, és dőlj oldalra! A képet helyben dolgozzuk fel. Billentyűvel és érintéssel kamera nélkül is játszhatsz.</p><div class="help-steps"><p><b>01</b><span><strong>Ugorj át a fénykapun!</strong>Szóköz / ↑ / W, vagy az UGRÁS gomb. Akkor ugorj, amikor a kapu közel ér. A 3. világtól az arany felső rúd alatt hajolj le: tartsd a ↓ / S billentyűt vagy a HAJOLJ LE gombot, amíg átérsz.</span></p><p><b>02</b><span><strong>Kövesd a kristályokat!</strong>← → / A D, a képernyő nyilai vagy oldalra húzás vált sávot. A kék pajzs egy ütközést kivéd.</span></p><p><b>03</b><span><strong>Hódítsd meg az öt világot!</strong>8 kapu egy pálya. 3 csillag: hibátlan futam és legalább 15 kristály. 2 csillag: legfeljebb 2 hibázás.</span></p></div><p class="help-sword"><strong>Kardos kaland · hamarosan</strong><br>Opcionális játékmód színes jelölőbottal. A mozgásos alapjátékhoz nem kell kard.</p>`);
    this.modalOn('[data-modal-close]',()=>this.closeModal());
  }

  private showCameraSetup(resuming=false):void {
    this.openModal('camera',`<span class="modal-eyebrow">MOZDULJ, BIT KÖVET!</span><h2 id="modal-title">Készülj az ugrásra!</h2><p>Állj egyenesen, a vállad és a csípőd is legyen a képben. Tartsd a telefont vagy kamerát stabilan.</p><p class="camera-setup-status" role="status" data-camera-status>Kamera indítása…</p><progress data-calibration max="1" value="0" aria-label="Kamera kalibrálása"></progress><fieldset class="camera-response"><legend>Kamera reakciója</legend><label><input type="radio" name="camera-response" value="quick" ${this.cameraResponse==='quick'?'checked':''}> Gyors · játékhoz</label><label><input type="radio" name="camera-response" value="steady" ${this.cameraResponse==='steady'?'checked':''}> Stabilabb · ha remeg a kép</label><small>Váltás után állj egyenesen egy pillanatra az új kalibráláshoz.</small></fieldset><label class="setting-row"><span>Automatikus futás<small>Kikapcsolva helyben futással adod a tempót.</small></span><input data-auto-run type="checkbox" checked></label><button class="jumper-primary wide" data-camera-go disabled>${icon('play')} ${resuming?'Folytatás':'Indulhat!'}</button><button class="jumper-secondary wide" data-camera-retry hidden>Kamera újraindítása</button><button class="jumper-secondary wide" data-use-keys>Billentyűvel / érintéssel játszom</button><button class="modal-text-button" data-cancel-camera>Mégsem</button><small class="local-privacy">A kamera képe a gépeden marad. Az első indításhoz internet kell a testkövető modell letöltéséhez.</small>`);
    this.root.querySelectorAll<HTMLInputElement>('[name="camera-response"]').forEach(option=>option.addEventListener('change',()=>{
      this.cameraResponse=option.value==='steady'?'steady':'quick';
      this.camera.setResponse(this.cameraResponse);this.updateCameraSetup();
    },{signal:this.abort.signal}));
    this.modalOn('[data-camera-go]',()=>{
      this.cameraSetup=false;
      this.autoRun=this.el<HTMLInputElement>('[data-auto-run]').checked;
      if(resuming){this.closeModal(false);this.simulation.resume();this.syncPhase();this.audio.play(this.simulation.level);}else this.begin();
    });
    this.modalOn('[data-use-keys]',()=>{this.camera.stop();this.el('.camera-preview').hidden=true;this.mode='keys';this.el<HTMLInputElement>('[value="keys"]').checked=true;this.updatePlayLabel();this.begin();});
    this.modalOn('[data-camera-retry]',()=>{this.cameraError=false;void this.camera.start();});
    this.modalOn('[data-cancel-camera]',()=>this.home());
  }
  private autoRun=true;
  private updateCameraSetup():void {
    if(!this.cameraSetup || this.modalName!=='camera')return;
    const input=this.camera.input(true);
    this.el<HTMLProgressElement>('[data-calibration]').value=input.calibrationProgress;
    this.el<HTMLButtonElement>('[data-camera-go]').disabled=!input.tracked || !input.calibrated;
    this.el('[data-camera-retry]').hidden=!this.cameraError && this.cameraMessage!==t('A kamera ki van kapcsolva.');
    this.el('[data-camera-status]').textContent=t(input.calibrated?'Készen állsz! Ugorj, hajolj le, és dőlj oldalra a sávváltáshoz.':this.cameraError?this.cameraMessage:input.tracked?'Kalibrálás… állj egyenesen egy pillanatra.':this.cameraMessage);
  }

  private result():void {
    const s=this.simulation,won=s.phase!=='game-over',finished=s.phase==='victory';
    this.save.best=Math.max(this.save.best,s.score);
    if(won)this.save.stars[s.level]=Math.max(this.save.stars[s.level],s.stars);
    this.persist();this.el('[data-best]').textContent=t(this.save.best.toLocaleString(getLanguage()));
    const title=finished?'Fénybajnok vagy!':won?'Ez ragyogó volt!':'Még egy kaland?';
    const label=finished?'MIND AZ ÖT VILÁG A TIÉD':won?t(WORLDS[s.level].name).toUpperCase()+' · TELJESÍTVE':'BIT VELED VAN';
    this.openModal('result',`<span class="modal-eyebrow">${label}</span><h2 id="modal-title">${title}</h2>${won?`<div class="result-stars" aria-label="${s.stars} csillag">${'★'.repeat(s.stars)}<span>${'☆'.repeat(3-s.stars)}</span></div>`:'<p>Szép próbálkozás! Kövesd a kapu jelzését: ↑ ugorj, ↓ maradj lent, amíg átérsz.</p>'}<div class="result-stats"><div><strong>${s.score.toLocaleString(getLanguage())}</strong><small>PONT</small></div><div><strong>◆ ${s.crystals}</strong><small>KRISTÁLY</small></div><div><strong>${s.maxCombo}×</strong><small>LEGJOBB KOMBO</small></div></div>${won?`<p class="result-note">${s.stars===3?'Tökéletes fényfutam!':s.stars===2?'Három csillaghoz: 0 hiba + 15 kristály.':'Két csillaghoz: legfeljebb 2 hiba.'}</p>`:''}<button class="jumper-primary wide" data-next>${icon('play')} ${won&&!finished?'Következő világ':'Újra játszom'}</button>${won&&!finished?'<button class="jumper-secondary wide" data-again>Még több csillagot szerzek</button>':''}<button class="modal-text-button" data-back>Vissza a kezdőlapra</button>`);
    this.modalOn('[data-next]',()=>{this.closeModal(false);if(won&&!finished)this.simulation.next();else if(finished)this.simulation.start(0,this.save.difficulty);else this.simulation.retry();this.syncPhase();this.audio.play(this.simulation.level);this.el('canvas').focus();});
    if(won&&!finished)this.modalOn('[data-again]',()=>{this.closeModal(false);this.simulation.retry();this.syncPhase();this.audio.play(this.simulation.level);});
    this.modalOn('[data-back]',()=>{this.selectedLevel=Math.min(s.level+(won&&!finished?1:0),4);this.el('[data-selected-world]').textContent=t(WORLDS[this.selectedLevel].name);this.el('.world-orbit').textContent=t(String(this.selectedLevel+1).padStart(2,'0'));this.home();});
  }

  private syncPhase():void {
    const phase=this.simulation.phase,playing=phase!=='ready';
    if(phase!=='running')this.releaseDuckControls();
    this.root.dataset.phase=phase;this.el('.jumper-hero').hidden=playing;this.el('.robot-caption').hidden=playing;
    this.el('.jumper-hud').hidden=!playing;this.el('.course-progress').hidden=!playing;
    this.el('.course-lookahead').hidden=phase!=='running' && phase!=='paused';
    this.el('.touch-controls').hidden=phase!=='running';this.el('[data-pause]').hidden=phase!=='running';
    this.el('[data-duck]').hidden=this.simulation.level<2;
    this.el('.jump-cue').hidden=true;this.el('.tracking-notice').hidden=true;
    if(phase==='game-over' || phase==='level-complete' || phase==='victory'){this.audio.stop();this.result();}
    this.previousPhase=phase;this.updateHud();
  }

  private updateHud():void {
    const s=this.simulation;
    this.root.dataset.duckEnabled=String(s.level>=2);
    this.el('[data-duck]').setAttribute('aria-pressed',String(s.ducking));
    this.el('[data-level-number]').textContent=t(`${String(s.level+1).padStart(2,'0')} / 05`);
    this.el('[data-level-name]').textContent=t(WORLDS[s.level].name);this.el('[data-score]').textContent=t(s.score.toLocaleString(getLanguage()));
    this.el('[data-crystals]').textContent=t(String(s.crystals));
    this.el('[data-hearts]').textContent=t('♥ '.repeat(s.hearts).trim());this.el('[data-hearts]').setAttribute('aria-label',t(`${s.hearts} élet`));
    this.el('[data-shield]').hidden=!s.shield;
    this.el<HTMLProgressElement>('.course-progress progress').value=s.progress;
    this.el('[data-course-count]').textContent=t(`${s.runner.state.cleared+s.runner.state.missed} / 8`);
    this.el('[data-course-label]').textContent=t(s.combo>1?`${s.combo}× KOMBO · SZÉP SOROZAT!`:'FÉNYFUTAM');
    this.updateCoursePreview();
    if(import.meta.env.DEV && this.root.querySelector('[data-diagnostics]'))this.el('[data-diagnostics]').textContent=t(JSON.stringify({
      phase:s.phase,level:s.level,height:s.runner.state.height,distance:s.runner.state.distance,obstacle:s.runner.state.obstacleDistance,
      cleared:s.runner.state.cleared,missed:s.runner.state.missed,lane:s.lane,score:s.score,ducking:s.ducking,obstacleKind:s.obstacleKind,audio:this.audio.snapshot(),view:this.view.snapshot(),
    }));
  }
  private updateCoursePreview():void {
    const sections=this.simulation.lookAhead.filter(section=>section.distance>(section.kind==='duck'?-DUCK_GATE_HALF_DEPTH:.28));
    const signature=sections.map(section=>`${section.index}:${section.kind}:${section.pickups.filter(p=>p.distance>.3).map(p=>p.slot).join(',')}`).join('|');
    if(signature===this.previewSignature)return;
    this.previewSignature=signature;
    this.el('[data-course-preview]').innerHTML=localizedHtml(sections.map(section=>{
      const crystals=section.pickups.some(p=>p.kind==='crystal' && p.distance>.3);
      const shield=section.pickups.some(p=>p.kind==='shield' && p.distance>.3);
      const lane=t(['BAL','KÖZÉP','JOBB'][section.lane+1]);
      const duck=section.kind==='duck',action=duck?'↓ HAJOLJ':'↑ UGROJ';
      return `<li class="section-preview${duck?' duck':''}" data-section="${section.index}" aria-label="${t('{count}. szakasz:',{count:section.index+1})} ${t(duck?'felső rúd, maradj lehajolva':'alsó fénykapu, ugrás')}${crystals?t(', kristályok: {lane} sáv',{lane:lane.toLowerCase()}):''}${shield?t(', pajzs a középső sávban'):''}"><strong><span>${String(section.index+1).padStart(2,'0')}</span> ${action}</strong><div class="preview-lanes${duck?' duck':''}" aria-hidden="true">${[-1,0,1].map(value=>`<span>${crystals&&section.lane===value?'◆':''}${shield&&value===0?'<i>◈</i>':''}</span>`).join('')}<b></b></div><small>${crystals?`◆ ${lane}`:action}${shield?' · ◈':''}</small></li>`;
    }).join(''));
  }
  private toast(message:string,duration=2.1):void {const toast=this.el('.game-toast');toast.textContent=t(message);toast.hidden=false;this.toastTime=duration;}

  private frame(time:number):void {
    if(this.destroyed)return;
    const dt=this.lastTime?Math.min(.05,(time-this.lastTime)/1000):1/60;this.lastTime=time;
    if(this.cameraSetup)this.updateCameraSetup();
    let input;
    if(this.mode==='camera' && this.simulation.phase==='running'){
      input=this.camera.input(this.autoRun);this.simulation.setLane(input.lane*2);
      const unavailable=!input.tracked || !input.calibrated;
      this.el('.tracking-notice').hidden=!unavailable;
      if(unavailable){this.audio.stop();this.el('.tracking-notice').textContent=t(this.cameraError?this.cameraMessage:'Állj a kamera elé, a pálya megvár!');}
      else this.audio.play(this.simulation.level);
    }
    this.simulation.update(dt,input);
    if(this.previousPhase!==this.simulation.phase)this.syncPhase();
    for(const event of this.simulation.drainEvents()){
      this.audio.event(event);this.view.event(event,this.simulation);
      if(event.type==='clear' && this.simulation.combo>1)this.toast(`${this.simulation.combo}× KOMBO! +${event.value}`);
      if(event.type==='shield')this.toast(event.value===-1?'A pajzs megvédett!':'Védőpajzs! ◈');
      if(event.type==='hit')this.toast('Semmi baj, folytasd! ♥');
    }
    if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0)this.el('.game-toast').hidden=true;}
    const s=this.simulation;
    const duck=s.obstacleKind==='duck';
    const cue=s.phase==='running' && (duck ? s.runner.state.obstacleDistance>-DUCK_GATE_HALF_DEPTH && s.runner.state.obstacleDistance<s.speed*.7
      : s.runner.state.height<.05 && s.runner.state.obstacleDistance>.65 && s.runner.state.obstacleDistance<s.speed*.5);
    this.el('.jump-cue').hidden=!cue;
    this.el('.jump-cue').classList.toggle('duck',duck);
    this.el('.jump-cue').textContent=t(duck?(s.ducking?'↓ MARADJ LENT!':'↓ HAJOLJ LE!'):'↑ MOST UGROJ!');
    // HUD text updates at 10 Hz; rendering and physics remain independent.
    if(Math.floor(time/100)!==Math.floor((time-dt*1000)/100))this.updateHud();
    if(!this.contextLost)this.view.update(dt,s);
    this.raf=requestAnimationFrame(next=>this.frame(next));
  }

  private dispose():void {this.destroyed=true;cancelAnimationFrame(this.raf);this.abort.abort();this.camera.stop();this.audio.dispose();this.view.dispose();}
}
