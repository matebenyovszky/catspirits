import { getLanguage, isLanguage, LANGUAGE_KEY, localizedHtml, t } from '../../i18n';
import { PopCamera } from '../../core/pop/PopCamera';
import type { HandFrame } from '../../core/pop/HandInput';
import { RobotHandInput } from '../../core/robot/RobotHandInput';
import { RobotSimulation, type RobotLevel } from '../../core/robot/RobotSimulation';
import { RobotView } from './RobotView';
import '../blade/blade.css';
import './robot.css';

type Phase = 'ready' | 'loading' | 'playing' | 'paused' | 'complete';
export class RobotApp {
  private game = new RobotSimulation();
  private view: RobotView;
  private camera: PopCamera;
  private handInput = new RobotHandInput();
  private hands: HandFrame | null = null;
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
        <label class="blade-language"><span class="sr-only">Nyelv</span><select data-language aria-label="Nyelv"><option value="en">EN</option><option value="hu">HU</option><option value="de">DE</option></select></label>
      </header>
      <main class="robot-main">
        <div class="robot-heading"><div><span class="blade-eyebrow">04 / ROBOT LAB · VIRTUAL</span><h1>BIT <span>RESCUE.</span></h1><p>Te vagy a robotpilóta.</p></div><div class="robot-mission-select"><label for="robot-level">Küldetés</label><select id="robot-level"><option value="1">01 · Első dokkolás</option><option value="2">02 · Kerülőút</option></select></div></div>
        <div class="robot-workspace">
          <section class="robot-board" aria-label="Robotkaros játék">
            <div class="robot-board-bar"><span class="robot-mode" data-owner>TE VEZETSZ</span><span data-clock>00:00</span><span><b data-count>0</b> / 3 <span>CELLA</span></span></div>
            <div class="robot-stage"><canvas tabindex="0" aria-label="Robotkar munkatere. Nyilak: mozgatás. Szóköz: fogás vagy elengedés. Enter: automata. M: kézi vezérlés."></canvas>
              <div class="robot-banner" data-banner><span class="blade-eyebrow">MENTSD MEG AZ ŰRÁLLOMÁST!</span><h2 data-banner-title>Három cella. Egy robotkar. Te.</h2><p data-banner-text>Vidd a számozott cellákat a párjukhoz. Átadhatod a vezérlést Bitnek, és bármikor visszaveheted.</p><button class="blade-primary" data-resume hidden>Folytatás</button><button class="blade-primary" data-next hidden>Következő küldetés</button></div>
            </div>
            <div class="robot-board-footer"><span data-task role="status">Válassz irányítást a kezdéshez.</span><button data-pause class="blade-text-button" disabled>Szünet</button></div>
          </section>
          <aside class="robot-console">
            <section class="robot-card robot-input"><span class="blade-eyebrow">01 / PILÓTA</span><h2>Mozdulj, és irányíts!</h2><button class="blade-primary" data-camera>Kamera indítása <span>↗</span></button><button class="blade-secondary" data-pointer>Egér / érintés / billentyűzet</button><p data-camera-status role="status">A kamera képe a gépeden marad.</p><video autoplay muted playsinline hidden aria-label="Tükrözött kamera"></video></section>
            <section class="robot-card"><span class="blade-eyebrow">02 / VEZÉRLÉS</span><div class="robot-control-switch"><button data-manual aria-pressed="true" disabled>Én vezetem</button><button data-auto aria-pressed="false" disabled>Bit vezeti</button></div><p data-control-status role="status">Bármikor átveheted a vezérlést.</p><button class="blade-secondary" data-grip disabled>Fogás / elengedés</button><div class="robot-stats"><div><strong data-interventions>0</strong><small>ÁTVÉTEL</small></div><div><strong data-auto-count>0</strong><small>AUTO DOKKOLÁS</small></div></div></section>
            <section class="robot-card robot-how"><span class="blade-eyebrow">03 / ÍGY MŰKÖDIK</span><ol><li>Kamerával az egyik csuklód vezeti a fogót. Tartsd a kezed és a könyököd a képen.</li><li>Állj meg a cellánál, majd a hozzá tartozó dokknál: a fogó rövid várakozás után magától működik.</li><li>A sárga mezőt kerüld meg a fogóval. Ha Bit elakad, vedd át, segíts neki, majd add vissza!</li></ol><p>Egérrel húzz vagy kattints. Billentyűvel: nyilak / WASD, szóköz a fogó, M kézi, Enter automata.</p></section>
          </aside>
        </div>
        <footer class="robot-footer"><p>Virtuális robotkar · Szabályalapú automata, nem tanított AI. A kar a mezők fölött mozog; a fogó nem haladhat át rajtuk.</p><button class="blade-text-button" data-reset>Új küldetés indítása</button><a href="/licenses/THIRD-PARTY-NOTICES.txt">Licencek</a></footer>
      </main>`);
    this.el<HTMLSelectElement>('[data-language]').value = getLanguage();
    const level: RobotLevel = new URLSearchParams(location.search).get('level') === '2' ? 2 : 1;
    this.game.reset(level); this.el<HTMLSelectElement>('#robot-level').value = String(level);
    if (level === 2) this.text('[data-banner-title]', t('Segíts Bitnek kerülőutat találni!'));
    this.view = new RobotView(this.el('canvas'));
    this.camera = new PopCamera(this.el('video'), frame => { this.hands = frame; }, () => {});
    this.bind(); this.resize(); this.hud();
  }
  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private text(selector: string, value: string): void { const e = this.el(selector); if (e.textContent !== value) e.textContent = value; }
  private on(selector: string, callback: () => void): void { this.el(selector).addEventListener('click', callback, { signal: this.abort.signal }); }
  private bind(): void {
    const signal = this.abort.signal, canvas = this.el<HTMLCanvasElement>('canvas');
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
      const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      this.game.aim({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    };
    canvas.addEventListener('pointerdown', event => {
      if (this.phase !== 'playing' || this.source !== 'pointer' || event.button !== 0) return;
      this.mode('manual'); this.pointer = event.pointerId; canvas.setPointerCapture?.(event.pointerId); aim(event); canvas.focus();
    }, { signal });
    canvas.addEventListener('pointermove', event => { if (this.phase === 'playing' && this.source === 'pointer' && this.pointer === event.pointerId) aim(event); }, { signal });
    canvas.addEventListener('pointerup', () => { this.pointer = null; }, { signal });
    canvas.addEventListener('pointercancel', () => { this.pointer = null; this.game.stop(); }, { signal });
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
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, { signal });
    window.addEventListener('pagehide', () => this.pause(), { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
  }
  private mode(mode: 'manual' | 'auto'): void {
    if (this.phase !== 'playing') return;
    if (mode !== this.game.mode) { this.keys.clear(); this.pointer = null; }
    this.game.setMode(mode); this.hud(); this.el('canvas').focus();
  }
  private stopCamera(): void { ++this.generation; this.camera.stop(); this.hands = null; this.handInput.reset(); this.el('video').hidden = true; }
  private startPointer(): void {
    if (this.destroyed || document.hidden) return;
    this.stopCamera(); this.source = 'pointer'; this.cameraError = false;
    if (this.game.complete) this.game.reset(this.game.level);
    this.play();
  }
  private async startCamera(): Promise<void> {
    if (this.destroyed || document.hidden || this.phase === 'loading') return;
    this.stopCamera(); this.stopFrames(); this.keys.clear(); this.pointer = null; this.game.stop();
    this.source = 'camera'; this.phase = 'loading'; this.cameraError = false; const generation = this.generation;
    this.el('video').hidden = false; this.el('[data-banner]').hidden = true; this.hud();
    try {
      const ready = await this.camera.start('hands');
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
    this.phase = 'playing'; this.game.stop(); this.keys.clear(); this.pointer = null;
    this.el('[data-banner]').hidden = true; this.previous = this.lastHud = 0; this.hud(); this.el('canvas').focus(); this.startFrames();
  }
  private pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'loading') return;
    this.phase = 'paused'; this.stopCamera(); this.stopFrames(); this.keys.clear(); this.pointer = null; this.game.stop(); this.showPause(); this.draw();
  }
  private showPause(): void {
    this.el('[data-banner]').hidden = false; this.text('[data-banner-title]', t('A robot megvár.'));
    this.text('[data-banner-text]', t('A küldetésed megmaradt. Folytasd, amikor készen állsz.'));
    this.el('[data-resume]').hidden = false; this.el('[data-next]').hidden = true;
  }
  private reset(level: RobotLevel): void {
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
    const hand = this.source === 'camera' && this.camera.running ? this.handInput.point(this.hands, performance.now()) : null;
    if (this.game.mode === 'manual') {
      if (hand) this.game.aim(hand);
      else if (this.source === 'pointer' && this.keys.size) {
        const x = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a'));
        const y = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w'));
        const length = Math.hypot(x, y) || 1;
        this.game.aim({ x: this.game.tool.x + x / length * dt * .38, y: this.game.tool.y + y / length * dt * .38 });
      }
    }
    this.game.step(dt, this.source === 'pointer' || !!hand);
    this.view.draw(this.game);
    if (time - this.lastHud > 100 || !this.lastHud) { this.lastHud = time; this.hud(); }
    if (this.game.complete) { this.finish(); return; }
    this.startFrames();
  }
  private finish(): void {
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
    const fresh = this.source === 'camera' && this.camera.running && !!this.handInput.point(this.hands, performance.now());
    this.text('[data-camera-status]', t(this.cameraError ? 'A kamera nem indult el. Próbáld újra, vagy válassz másik irányítást.' : this.phase === 'loading' ? 'A kamerakövetés betöltése…' : playing && this.source === 'camera' ? fresh ? 'Megvan a vezérlő kezed.' : 'Mutasd a vezérlő kezed és a könyököd. Kézi módban a robot megvár.' : 'A kamera képe a gépeden marad.'));
    this.text('[data-control-status]', t(this.phase === 'complete' ? 'Mindhárom cella a helyén!' : !playing ? 'A robot megvár.' : this.game.blocked ? 'A mező útban van. Vedd át, kerüld meg, majd add vissza Bitnek!' : this.game.mode === 'auto' ? 'Bit a következő cellán dolgozik. Bármikor visszaveheted.' : 'Bármikor átveheted a vezérlést.'));
    this.text('[data-task]', t(this.phase === 'complete' ? 'Mindhárom cella a helyén!' : this.phase === 'paused' ? 'A robot megvár.' : !playing ? 'Válassz irányítást a kezdéshez.' : this.game.blocked ? 'Kerüld meg a sárga mezőt felül vagy alul!' : this.game.holding === null ? 'Vezesd a fogót egy cellához, és tartsd ott.' : 'Vidd a cellát az azonos számú dokkhoz.'));
    this.root.classList.toggle('robot-blocked', playing && this.game.blocked);
  }
  private draw(): void { this.view.draw(this.game); this.hud(); }
  private resize(): void { this.view.resize(); this.draw(); }
  dispose(): void { this.destroyed = true; this.stopCamera(); this.stopFrames(); this.abort.abort(); }
}
