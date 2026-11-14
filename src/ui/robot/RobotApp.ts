import { ChipAudio } from '../../core/audio/ChipAudio';
import { bindSoundToggle } from '../audio/soundToggle';
import { getLanguage, isLanguage, LANGUAGE_KEY, localizedHtml, t } from '../../i18n';
import { RobotCamera } from '../../core/robot/RobotCamera';
import type { PoseFrame } from '../../core/tracking/types';
import { RobotPinchInput, type PinchState } from '../../core/robot/RobotPinchInput';
import { RobotSimulation, type RobotLevel } from '../../core/robot/RobotSimulation';
import { RobotView } from './RobotView';
import type { RobotView3D } from './RobotView3D';
import type { Point } from '../../core/robot/RobotSimulation';
type RobotRenderer = { resize(): void; draw(game: RobotSimulation): void; screenToWorld?(x: number, y: number): Point | null };
import '../blade/blade.css';
import './robot.css';

type Phase = 'ready' | 'loading' | 'playing' | 'paused' | 'complete';
export class RobotApp {
  private audio = new ChipAudio('robot');
  private heard = { holding: null as number | null, delivered: 0, blocked: false };
  private game = new RobotSimulation();
  private view: RobotRenderer;
  private flatView: RobotView;
  private spatialView: RobotView3D | null = null;
  private spatialCanvas: HTMLCanvasElement | null = null;
  private viewMode: '2d' | '3d' = '2d';
  private viewLoading = false;
  private camera: RobotCamera;
  private handInput = new RobotPinchInput();
  private pinch: PinchState | null = null;
  private depthControl = false;
  private hands: PoseFrame | null = null;
  private source: 'pointer' | 'camera' = 'pointer';
  private phase: Phase = 'ready';
  private raf = 0;
  private previous = 0;
  private lastHud = 0;
  private generation = 0;
  private destroyed = false;
  private abort = new AbortController();
  private keys = new Set<string>();
  private pointer: number | null = null;
  private cameraError = false;
  constructor(private root: HTMLElement) {
    root.classList.add('blade-root', 'robot-root'); document.title = `Catspirits · Bit Rescue · ${t('Te vagy a robotpilóta.')}`;
    root.innerHTML = localizedHtml(`
      <header class="blade-header"><a class="blade-brand" href="?lang=${getLanguage()}"><span class="blade-brand-icon">✦</span><span>CATSPIRITS<small>MOVE. PLAY. GLOW.</small></span></a>
        <nav class="blade-games" aria-label="Játékválasztó"><a href="?lang=${getLanguage()}">Cyber Jumper</a><a href="?game=blade&lang=${getLanguage()}">Neon Blade</a><a href="?game=pop&lang=${getLanguage()}">Neon Pop</a><a href="?game=robot&lang=${getLanguage()}" aria-current="page">Bit Rescue</a></nav>
        <button class="blade-text-button" data-sound aria-pressed="true">Hang: be</button><label class="blade-language"><span class="sr-only">Nyelv</span><select data-language aria-label="Nyelv"><option value="en">EN</option><option value="hu">HU</option><option value="de">DE</option></select></label>
      </header>
      <main class="robot-main">
        <div class="robot-heading"><div><span class="blade-eyebrow">04 / ROBOT LAB · VIRTUAL</span><h1>BIT <span>RESCUE.</span></h1><p>Te vagy a robotpilóta.</p></div><div class="robot-heading-controls"><div class="robot-view-select" aria-label="Nézet"><button data-view="2d" aria-pressed="true">2D</button><button data-view="3d" aria-pressed="false">3D · próba</button></div><div class="robot-mission-select"><label for="robot-level">Küldetés</label><select id="robot-level"><option value="1">01 · Első dokkolás</option><option value="2">02 · Kerülőút</option></select></div></div></div>
        <p class="robot-view-note" data-view-note role="status" hidden></p><div class="robot-workspace">
          <section class="robot-board" aria-label="Robotkaros játék">
            <div class="robot-board-bar"><span class="robot-mode" data-owner>TE VEZETSZ</span><span data-clock>00:00</span><span><b data-count>0</b> / 3 <span>CELLA</span></span></div>
            <div class="robot-stage"><canvas tabindex="0" aria-label="Robotkar munkatere. Nyilak: mozgatás. Szóköz: fogás vagy elengedés. Enter: automata. M: kézi vezérlés."></canvas>
              <div class="robot-banner" data-banner><span class="blade-eyebrow">MENTSD MEG AZ ŰRÁLLOMÁST!</span><h2 data-banner-title>Három cella. Egy robotkar. Te.</h2><p data-banner-text>Vidd a számozott cellákat a párjukhoz. Átadhatod a vezérlést Bitnek, és bármikor visszaveheted.</p><button class="blade-primary" data-resume hidden>Folytatás</button><button class="blade-primary" data-next hidden>Következő küldetés</button></div>
            </div>
            <div class="robot-board-footer"><span data-task role="status">Válassz irányítást a kezdéshez.</span><button data-pause class="blade-text-button" disabled>Szünet</button></div>
          </section>
          <aside class="robot-console">
            <section class="robot-card robot-input"><span class="blade-eyebrow">01 / PILÓTA</span><h2>Mozdulj, és irányíts!</h2><button class="blade-primary" data-camera>Kamera indítása <span>↗</span></button><button class="blade-secondary" data-pointer>Egér / érintés / billentyűzet</button><p data-camera-status role="status">A kamera képe a gépeden marad.</p><video autoplay muted playsinline hidden aria-label="Tükrözött kamera"></video><p data-pinch-status role="status" hidden></p><label class="robot-depth-option"><input type="checkbox" data-depth> Térbeli kézvezérlés · kísérleti</label><p>Tenyérrel a kamera felé: közelítés = emelés, távolítás = süllyesztés. A kéz elfordítása pontatlanságot okozhat.</p><button class="blade-text-button" data-calibrate disabled>Mélység újrakalibrálása</button><p data-height hidden></p></section>
            <section class="robot-card"><span class="blade-eyebrow">02 / VEZÉRLÉS</span><div class="robot-control-switch"><button data-manual aria-pressed="true" disabled>Én vezetem</button><button data-auto aria-pressed="false" disabled>Bit vezeti</button></div><p data-control-status role="status">Bármikor átveheted a vezérlést.</p><button class="blade-secondary" data-grip disabled>Fogás / elengedés</button><div class="robot-stats"><div><strong data-interventions>0</strong><small>ÁTVÉTEL</small></div><div><strong data-auto-count>0</strong><small>AUTO DOKKOLÁS</small></div></div></section>
            <section class="robot-card robot-how"><span class="blade-eyebrow">03 / ÍGY MŰKÖDIK</span><ol><li>Egy kéz elég. Mutasd a tenyered és az ujjaidat; a kezed mozgatja a fogót.</li><li>Kamerával: csippents a hüvelyk- és mutatóujjaddal a megfogáshoz, nyisd szét az elengedéshez. Egérrel továbbra is működik a rövid várakozás.</li><li>A sárga mezőt kerüld meg a fogóval. Ha Bit elakad, vedd át, segíts neki, majd add vissza!</li></ol><p>Egérrel húzz vagy kattints. Billentyűvel: nyilak / WASD, szóköz a fogó, M kézi, Enter automata.</p></section>
          </aside>
        </div>
        <footer class="robot-footer"><p>Virtuális robotkar · Szabályalapú automata, nem tanított AI. A kar a mezők fölött mozog; a fogó nem haladhat át rajtuk.</p><button class="blade-text-button" data-reset>Új küldetés indítása</button><a href="/licenses/THIRD-PARTY-NOTICES.txt">Licencek</a></footer>
      </main>`);
    this.el<HTMLSelectElement>('[data-language]').value = getLanguage();
    const level: RobotLevel = new URLSearchParams(location.search).get('level') === '2' ? 2 : 1;
    this.game.reset(level); this.el<HTMLSelectElement>('#robot-level').value = String(level);
    if (level === 2) this.text('[data-banner-title]', t('Segíts Bitnek kerülőutat találni!'));
    this.flatView = new RobotView(this.el('canvas')); this.view = this.flatView;
    this.camera = new RobotCamera(this.el('video'), frame => { this.hands = frame; });
    bindSoundToggle(this.root, this.audio, this.abort.signal); this.bind(); this.resize(); this.hud();
    if (new URLSearchParams(location.search).get('view') === '3d') void this.setView('3d');
  }
  private canvas(): HTMLCanvasElement { return this.viewMode === '3d' && this.spatialCanvas ? this.spatialCanvas : this.el('canvas'); }
  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private text(selector: string, value: string): void { const e = this.el(selector); if (e.textContent !== value) e.textContent = value; }
  private on(selector: string, callback: () => void): void { this.el(selector).addEventListener('click', callback, { signal: this.abort.signal }); }
  private bind(): void {
    const signal = this.abort.signal, stage = this.el('.robot-stage');
    this.on('[data-view="2d"]', () => void this.setView('2d')); this.on('[data-view="3d"]', () => void this.setView('3d'));
    this.el('[data-depth]').addEventListener('change', () => { this.depthControl = this.el<HTMLInputElement>('[data-depth]').checked; this.game.setDepth(null); this.hud(); }, { signal });
    this.on('[data-calibrate]', () => { this.handInput.calibrateDepth(); this.game.setDepth(null); });
    this.on('[data-camera]', () => void this.startCamera());
    this.on('[data-pointer]', () => this.startPointer());
    this.on('[data-manual]', () => this.mode('manual')); this.on('[data-auto]', () => this.mode('auto'));
    this.on('[data-grip]', () => { if (this.phase !== 'playing') return; this.mode('manual'); this.game.grip(); this.draw(); });
    this.on('[data-pause]', () => this.pause());
    this.on('[data-resume]', () => { if (this.source === 'camera') void this.startCamera(); else this.startPointer(); });
    this.on('[data-next]', () => { const camera = this.source === 'camera'; this.reset(2); if (camera) void this.startCamera(); else this.startPointer(); });
    this.on('[data-reset]', () => this.reset(this.game.level));
    this.el('#robot-level').addEventListener('change', event => this.reset((event.target as HTMLSelectElement).value === '2' ? 2 : 1), { signal });
    this.el('[data-language]').addEventListener('change', event => {
      const value = (event.target as HTMLSelectElement).value; if (!isLanguage(value)) return;
      this.pause(); try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* Optional preference. */ }
      const url = new URL(location.href); url.searchParams.set('lang', value); url.searchParams.set('level', String(this.game.level)); location.assign(url.href);
    }, { signal });
    const aim = (event: PointerEvent) => {
      const rect = this.canvas().getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      const point = this.view.screenToWorld ? this.view.screenToWorld(x, y) : { x, y }; if (point) this.game.aim(point);
    };
    stage.addEventListener('pointerdown', event => {
      if (event.target !== this.canvas() || this.phase !== 'playing' || this.source !== 'pointer' || event.button !== 0) return;
      this.mode('manual'); this.pointer = event.pointerId; this.canvas().setPointerCapture?.(event.pointerId); aim(event); this.canvas().focus();
    }, { signal });
    stage.addEventListener('pointermove', event => { if (this.phase === 'playing' && this.source === 'pointer' && this.pointer === event.pointerId) aim(event); }, { signal });
    stage.addEventListener('pointerup', () => { this.pointer = null; }, { signal });
    stage.addEventListener('pointercancel', () => { this.pointer = null; this.game.stop(); }, { signal });
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement || this.phase !== 'playing') return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key) && this.source === 'pointer') {
        event.preventDefault(); this.mode('manual'); this.keys.add(key);
      } else if (!event.repeat && [' ', 'enter', 'm', 'escape'].includes(key)) {
        event.preventDefault(); if (key === 'escape') this.pause(); else if (key === 'enter') this.mode('auto');
        else { this.mode('manual'); if (key === ' ') this.game.grip(); }
      }
    }, { signal });
    window.addEventListener('keyup', event => { this.keys.delete(event.key.toLowerCase()); }, { signal });
    window.addEventListener('blur', () => { if (this.phase === 'playing') this.pause(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.audio.sleep(); this.pause(); } }, { signal });
    window.addEventListener('pagehide', () => { this.audio.sleep(); this.pause(); }, { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
  }
  private mode(mode: 'manual' | 'auto'): void {
    if (this.phase !== 'playing') return;
    if (mode !== this.game.mode) { this.keys.clear(); this.pointer = null; this.handInput.rearm(); this.pinch = null; this.game.setDepth(null); }
    this.game.setMode(mode); this.hud(); this.canvas().focus();
  }
  private async setView(mode: '2d' | '3d'): Promise<void> {
    if (this.destroyed || this.viewLoading || mode === this.viewMode) return;
    const note = this.el('[data-view-note]');
    if (mode === '3d' && !this.spatialView) {
      this.viewLoading = true;
      this.el<HTMLButtonElement>('[data-view="3d"]').disabled = true;
      note.hidden = false; this.text('[data-view-note]', t('A 3D nézet betöltése…'));
      let canvas: HTMLCanvasElement | null = null;
      try {
        const { RobotView3D } = await import('./RobotView3D');
        if (this.destroyed) return;
        canvas = document.createElement('canvas'); canvas.tabIndex = 0; canvas.dataset.robot3d = '';
        canvas.setAttribute('aria-label', this.el('canvas').getAttribute('aria-label') ?? 'Bit Rescue');
        this.el('.robot-stage').insertBefore(canvas, this.el('[data-banner]'));
        this.spatialView = new RobotView3D(canvas); this.spatialCanvas = canvas;
        canvas.addEventListener('webglcontextlost', event => {
          event.preventDefault(); if (this.destroyed) return;
          void this.setView('2d');
          this.spatialView?.dispose(); this.spatialView = null; this.spatialCanvas?.remove(); this.spatialCanvas = null;
          note.hidden = false; this.text('[data-view-note]', t('A 3D gyorsítás nem elérhető. A játék 2D-ben folytatható.'));
        }, { signal: this.abort.signal });
      } catch {
        canvas?.remove(); this.text('[data-view-note]', t('A 3D gyorsítás nem elérhető. A játék 2D-ben folytatható.')); return;
      } finally {
        this.viewLoading = false; if (!this.destroyed) this.el<HTMLButtonElement>('[data-view="3d"]').disabled = false;
      }
    }
    if (this.destroyed) return;
    this.viewMode = mode; this.view = mode === '3d' && this.spatialView ? this.spatialView : this.flatView;
    this.el<HTMLCanvasElement>('canvas').hidden = mode === '3d'; if (this.spatialCanvas) this.spatialCanvas.hidden = mode !== '3d';
    this.el('[data-view="2d"]').setAttribute('aria-pressed', String(mode === '2d'));
    this.el('[data-view="3d"]').setAttribute('aria-pressed', String(mode === '3d'));
    this.keys.clear(); this.pointer = null; this.game.stop(); this.resize();
    note.hidden = mode === '2d'; this.text('[data-view-note]', t('3D robotkar: automatikus emelés, vagy kapcsolható kísérleti kézi magasságvezérlés.'));
    const url = new URL(location.href); if (mode === '3d') url.searchParams.set('view', '3d'); else url.searchParams.delete('view'); history.replaceState(null, '', url.href);
    if (this.phase === 'playing') this.canvas().focus();
  }
  private stopCamera(): void { ++this.generation; this.camera.stop(); this.hands = null; this.pinch = null; this.handInput.reset(); this.game.setDepth(null); this.el('video').hidden = true; }
  private startPointer(): void {
    if (this.destroyed || document.hidden) return;
    void this.audio.unlock();
    this.stopCamera(); this.source = 'pointer'; this.cameraError = false;
    if (this.game.complete) this.game.reset(this.game.level);
    this.play();
  }
  private async startCamera(): Promise<void> {
    if (this.destroyed || document.hidden || this.phase === 'loading') return;
    this.audio.stop(); void this.audio.unlock();
    this.stopCamera(); this.stopFrames(); this.keys.clear(); this.pointer = null; this.game.stop();
    this.source = 'camera'; this.phase = 'loading'; this.cameraError = false; const generation = this.generation;
    this.el('video').hidden = false; this.el('[data-banner]').hidden = true; this.hud();
    try {
      const ready = await this.camera.start();
      if (generation !== this.generation || this.destroyed) return;
      if (!ready) throw new Error('Camera unavailable');
      if (this.game.complete) this.game.reset(this.game.level);
      this.play();
    } catch {
      if (generation !== this.generation || this.destroyed) return;
      this.stopCamera(); this.phase = 'paused'; this.cameraError = true; this.showPause(); this.hud();
    }
  }
  private play(): void {
    this.heard = { holding: this.game.holding, delivered: this.game.delivered, blocked: this.game.blocked }; this.audio.play(this.game.level);
    this.phase = 'playing'; this.game.stop(); this.keys.clear(); this.pointer = null;
    this.el('[data-banner]').hidden = true; this.previous = this.lastHud = 0; this.hud(); this.canvas().focus(); this.startFrames();
  }
  private pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'loading') return;
    this.audio.sleep(); this.phase = 'paused'; this.stopCamera(); this.stopFrames(); this.keys.clear(); this.pointer = null; this.game.stop(); this.showPause(); this.draw();
  }
  private showPause(): void {
    this.el('[data-banner]').hidden = false; this.text('[data-banner-title]', t('A robot megvár.'));
    this.text('[data-banner-text]', t('A küldetésed megmaradt. Folytasd, amikor készen állsz.'));
    this.el('[data-resume]').hidden = false; this.el('[data-next]').hidden = true;
  }
  private reset(level: RobotLevel): void {
    this.audio.sleep();
    this.stopCamera(); this.stopFrames(); this.game.reset(level); this.phase = 'ready'; this.cameraError = false; this.keys.clear(); this.pointer = null;
    this.el<HTMLSelectElement>('#robot-level').value = String(level);
    const url = new URL(location.href); url.searchParams.set('level', String(level)); history.replaceState(null, '', url.href);
    this.el('[data-banner]').hidden = false; this.el('[data-resume]').hidden = true; this.el('[data-next]').hidden = true;
    this.text('[data-banner-title]', t(level === 1 ? 'Három cella. Egy robotkar. Te.' : 'Segíts Bitnek kerülőutat találni!'));
    this.text('[data-banner-text]', t('Vidd a számozott cellákat a párjukhoz. Átadhatod a vezérlést Bitnek, és bármikor visszaveheted.')); this.draw();
  }
  private startFrames(): void { if (!this.raf && !this.destroyed && !document.hidden) this.raf = requestAnimationFrame(time => this.frame(time)); }
  private stopFrames(): void { cancelAnimationFrame(this.raf); this.raf = 0; this.previous = 0; }
  private frame(time: number): void {
    this.raf = 0; if (this.destroyed || document.hidden || this.phase !== 'playing') return;
    const elapsed = this.previous ? (time - this.previous) / 1000 : 0;
    if (this.previous && elapsed < 1 / 62) { this.startFrames(); return; }
    this.previous = time; const dt = Math.min(elapsed, .05);
    this.pinch = this.source === 'camera' && this.camera.running ? this.handInput.update(this.hands, performance.now(), this.game.holding !== null) : null;
    const hand = this.pinch?.armed && (!this.depthControl || this.pinch.depth !== null) ? this.pinch : null;
    this.game.setDepth(this.source === 'camera' && this.depthControl && hand ? hand.depth : null);
    if (this.game.mode === 'manual') {
      if (hand) { this.game.aim(hand.point); this.game.setGripper(hand.closed ? 'closed' : 'open'); }
      else if (this.source === 'pointer' && this.keys.size) {
        const x = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
        const y = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
        const length = Math.hypot(x, y) || 1;
        this.game.aim({ x: this.game.tool.x + x / length * dt * .38, y: this.game.tool.y + y / length * dt * .38 });
      }
    }
    this.game.step(dt, this.source === 'pointer' || !!hand, this.source === 'pointer');
    if (this.source === 'pointer' || hand || this.game.mode === 'auto') this.audio.play(this.game.level); else this.audio.stop();
    if (this.game.delivered > this.heard.delivered) this.audio.cue('correct');
    if (this.game.holding !== this.heard.holding) this.audio.cue(this.game.holding === null ? 'release' : 'grab');
    if (this.game.blocked && !this.heard.blocked) this.audio.cue('blocked');
    this.heard = { holding: this.game.holding, delivered: this.game.delivered, blocked: this.game.blocked };
    this.view.draw(this.game);
    if (time - this.lastHud > 100 || !this.lastHud) { this.lastHud = time; this.hud(); }
    if (this.game.complete) { this.finish(); return; }
    this.startFrames();
  }
  private finish(): void {
    this.audio.stop(); this.audio.cue('finish');
    this.phase = 'complete'; this.stopCamera(); this.stopFrames(); this.el('[data-banner]').hidden = false;
    this.text('[data-banner-title]', t('Az állomás újra él!'));
    this.text('[data-banner-text]', t('3 cella a helyén · {auto} automata dokkolás · {help} átvétel', { auto: this.game.autoDeliveries, help: this.game.takeovers }));
    this.el('[data-resume]').hidden = true; this.el('[data-next]').hidden = this.game.level === 2; this.hud();
  }
  private hud(): void {
    const playing = this.phase === 'playing'; this.root.dataset.phase = this.phase; this.root.dataset.control = this.game.mode;
    for (const selector of ['[data-manual]', '[data-auto]', '[data-grip]', '[data-pause]']) this.el<HTMLButtonElement>(selector).disabled = !playing;
    this.el<HTMLButtonElement>('[data-camera]').disabled = this.phase === 'loading';
    this.el('[data-manual]').setAttribute('aria-pressed', String(this.game.mode === 'manual')); this.el('[data-auto]').setAttribute('aria-pressed', String(this.game.mode === 'auto'));
    this.text('[data-owner]', t(!playing ? this.phase === 'complete' ? 'KÜLDETÉS TELJESÍTVE' : 'KÉSZENLÉT' : this.game.mode === 'auto' ? 'BIT VEZET' : 'TE VEZETSZ'));
    this.text('[data-clock]', `${Math.floor(this.game.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(this.game.elapsed % 60).toString().padStart(2, '0')}`);
    this.text('[data-count]', String(this.game.delivered)); this.text('[data-auto-count]', String(this.game.autoDeliveries)); this.text('[data-interventions]', String(this.game.takeovers));
    const fresh = this.source === 'camera' && this.camera.running && !!this.pinch;
    const cameraControl = playing && this.source === 'camera';
    this.el('[data-pinch-status]').hidden = !cameraControl; this.el('[data-height]').hidden = !cameraControl;
    this.el<HTMLButtonElement>('[data-calibrate]').disabled = !cameraControl || this.game.holding !== null;
    this.text('[data-height]', t('Emelés: {height}%', { height: Math.round(this.game.lift / .12 * 100) }));
    this.text('[data-pinch-status]', t(!this.pinch?.armed ? this.game.holding !== null ? 'A folytatáshoz csippents újra. A tárgyat megtartom.' : 'Nyisd szét a hüvelyk- és mutatóujjad a kezdéshez.' : this.depthControl && this.pinch.depth === null ? 'Kalibrálás: tartsd nyitott tenyered mozdulatlanul a kamera felé.' : this.pinch.closed ? 'CSIPPENTÉS · FOGÁS' : 'NYITOTT KÉZ · ELENGEDÉS'));
    this.text('[data-camera-status]', t(this.cameraError ? 'A kamera nem indult el. Próbáld újra, vagy válassz másik irányítást.' : this.phase === 'loading' ? 'A kamerakövetés betöltése…' : playing && this.source === 'camera' ? fresh ? 'Megvan a vezérlő kezed. Csippentéssel foghatsz.' : 'Mutasd a tenyered és az ujjaidat. Követés nélkül a robot megáll, és megtartja a tárgyat.' : 'A kamera képe a gépeden marad.'));
    this.text('[data-control-status]', t(this.phase === 'complete' ? 'Mindhárom cella a helyén!' : !playing ? 'A robot megvár.' : this.game.blocked ? 'A mező útban van. Vedd át, kerüld meg, majd add vissza Bitnek!' : this.game.mode === 'auto' ? 'Bit a következő cellán dolgozik. Bármikor visszaveheted.' : 'Bármikor átveheted a vezérlést.'));
    this.text('[data-task]', t(this.phase === 'complete' ? 'Mindhárom cella a helyén!' : this.phase === 'paused' ? 'A robot megvár.' : !playing ? 'Válassz irányítást a kezdéshez.' : this.game.blocked ? 'Kerüld meg a sárga mezőt felül vagy alul!' : this.game.holding === null ? this.source === 'camera' ? 'Vezesd a fogót a cellához, és csippents!' : 'Vezesd a fogót egy cellához, és tartsd ott.' : 'Vidd a cellát az azonos számú dokkhoz.'));
    this.root.classList.toggle('robot-blocked', playing && this.game.blocked);
  }
  private draw(): void { this.view.draw(this.game); this.hud(); }
  private resize(): void { this.view.resize(); this.draw(); }
  dispose(): void { this.destroyed = true; this.stopCamera(); this.stopFrames(); this.abort.abort(); this.audio.dispose(); this.spatialView?.dispose(); }
}
