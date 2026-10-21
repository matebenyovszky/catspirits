import { getLanguage, isLanguage, LANGUAGE_KEY, localizedHtml, t } from '../../i18n';
import { BladeCamera } from '../../core/blade/BladeCamera';
import { BladeSimulation } from '../../core/blade/BladeSimulation';
import { validSword, type SwordFrame } from '../../core/tracking/sword/types';
import { BladeView } from './BladeView';
import './blade.css';

const BEST_KEY = 'catspirits.neon-blade.best.v1';
const art = `<svg viewBox="0 0 520 490" aria-hidden="true"><defs><linearGradient id="blade-glow" x2="1" y2="1"><stop stop-color="#dcfff0"/><stop offset="1" stop-color="#57e3cc"/></linearGradient></defs><circle cx="260" cy="245" r="184" fill="none" stroke="#3b4661"/><circle cx="260" cy="245" r="144" fill="none" stroke="#35485b" stroke-dasharray="4 12"/><path d="M96 358Q308 404 411 119" fill="none" stroke="#6af2cd" stroke-width="28" opacity=".06"/><path d="M96 358Q308 404 411 119" fill="none" stroke="#6af2cd" stroke-width="2" opacity=".6"/><g transform="rotate(38 260 245)"><path d="M248 102l12-39 12 39v230h-24z" fill="url(#blade-glow)"/><path d="M260 85v235" stroke="white" stroke-width="3"/><rect x="230" y="323" width="60" height="10" rx="5" fill="#e4e6fa"/><rect x="250" y="334" width="20" height="71" rx="7" fill="#383e63"/><path d="M250 346h20m-20 12h20m-20 12h20m-20 12h20" stroke="#b88bb9" stroke-width="4"/></g><g fill="#b695ff38" stroke="#c4adff" stroke-width="2"><path d="M108 126l32 16 6 35-29 25-34-19-4-32z"/><path d="M376 286l35 9 15 36-24 28-39-13-8-34z"/></g><path d="M108 126l9 39 29 12m-29-12v37m0-37-38-14M376 286l23 35 27 10m-27-10 3 38m-3-38-44-9" stroke="#c4adff" fill="none"/><g fill="#a3e9d8"><circle cx="374" cy="128" r="3"/><circle cx="147" cy="324" r="3"/><circle cx="197" cy="85" r="2"/><circle cx="433" cy="236" r="2"/></g><path d="M305 401l7-12 7 12-7 12z" fill="#ffe1a0"/></svg>`;

export class BladeApp {
  private game = new BladeSimulation();
  private view: BladeView;
  private camera: BladeCamera;
  private measured: SwordFrame | null = null;
  private abort = new AbortController();
  private phase: 'menu' | 'setup' | 'playing' | 'paused' | 'over' = 'menu';
  private mode: 'camera' | 'touch' = 'camera';
  private raf = 0;
  private previousTime = 0;
  private lastHud = 0;
  private pointer: number | null = null;
  private generation = 0;
  private destroyed = false;
  private best = { camera: 0, touch: 0 };
  private audio: AudioContext | null = null;
  private sound = false;
  private lastTone = 0;

  constructor(private root: HTMLElement) {
    document.title = `Catspirits · Neon Blade · ${t('Mozdulj és vágj!')}`;
    root.classList.add('blade-root');
    try { const saved = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}'); for (const key of ['camera', 'touch'] as const) if (Number.isSafeInteger(saved?.[key]) && saved[key] >= 0 && saved[key] <= 100000) this.best[key] = saved[key]; } catch { /* Optional local scores. */ }
    root.innerHTML = localizedHtml(`
      <header class="blade-header"><a class="blade-brand" href="?lang=${getLanguage()}"><span class="blade-brand-icon">✦</span><span>CATSPIRITS<small>MOVE. PLAY. GLOW.</small></span></a>
        <nav class="blade-games" aria-label="Játékválasztó"><a href="?lang=${getLanguage()}">Cyber Jumper</a><a href="?game=blade&lang=${getLanguage()}" aria-current="page">Neon Blade</a></nav>
        <label class="blade-language"><span class="sr-only">Nyelv</span><select aria-label="Nyelv"><option value="en">EN</option><option value="hu">HU</option><option value="de">DE</option></select></label></header>
      <main class="blade-menu">
        <section class="blade-intro"><span class="blade-eyebrow">KAMERÁS KARDKALAND</span><h1>NEON<br><span>BLADE.</span></h1><p class="blade-lead">A mozdulatod a penge.<br>Vágd át a kristályokat, és építs fénykombókat!</p>
          <div class="blade-tags"><span>60 másodperc</span><span>3 hullám</span><span>4× szorzó</span></div>
          <button class="blade-primary" data-camera>Kamera és jelölőbot <span>↗</span></button><button class="blade-secondary" data-practice>Kipróbálom egérrel / érintéssel <span>→</span></button>
          <p class="blade-private">A kamera képe a gépeden marad.</p>
        </section><div class="blade-art">${art}<span class="blade-art-label">01 / NEON BLADE</span></div>
        <section class="blade-guide"><div><span class="blade-eyebrow">AMIRE SZÜKSÉGED LESZ</span><h2>Egy kamera. Egy puha jelölőbot.</h2><p>A négy színes sávot követjük. Nem kell a teljes testednek a képbe férnie.</p></div>
          <div class="blade-wand"><div class="wand-diagram" aria-label="50 centiméteres bot: két rózsaszín és két zöld sáv"><i></i><b class="band b1"></b><b class="band b2"></b><b class="band b3"></b><b class="band b4"></b></div><small>MARKOLAT → RÓZSASZÍN → RÓZSASZÍN → ZÖLD → ZÖLD</small><details><summary>Jelölőbot és játékszabályok</summary><p>50 cm hosszú, puha végű bot. Rózsaszín sávok: 12–18 és 22–25 cm; zöld sávok: 34–37 és 42–48 cm a markolat aljától. Átmérő: kb. 25 mm. A sávok érjenek körbe.</p><p>Induláskor mutasd mind a négy sávot. Szórt fény és egyszínű háttér segít. Csak puha játékbotot használj, és hagyj magad körül szabad helyet.</p><p>Vágj mozgó pengével a kristályokba! Öt egymás utáni találatonként nő a szorzó. Az aranykristály háromszor annyit ér; egy kihagyás megszakítja a kombót. Jelvesztéskor az idő megáll.</p></details></div></section>
        <footer class="blade-menu-footer"><span>CATSPIRITS / PLAY WITH MOVEMENT</span><a href="/licenses/THIRD-PARTY-NOTICES.txt">Licencek</a><details><summary>Adatvédelem</summary><p>A kamera képe a gépeden marad. A játék nem rögzít és nem tölt fel kameraképet. A nyelvválasztást és a rekordokat a böngésződ tárolja. A tárhelyet a Cloudflare biztosítja; a kiszolgáláshoz és a védelemhez hálózati adatokat kezel.</p></details></footer>
      </main>
      <section class="blade-play" hidden>
        <div class="blade-toolbar"><button class="blade-text-button" data-home>← Menü</button><span data-mode-label></span><div><button class="blade-text-button" data-sound aria-pressed="false">Hang: ki</button><button class="blade-text-button" data-pause>Szünet</button></div></div>
        <div class="blade-hud"><div><small>PONT</small><strong data-score>0</strong></div><div class="blade-timer"><small>HÁTRALÉVŐ IDŐ</small><strong data-time>60</strong></div><div><small>KOMBÓ</small><strong data-combo>0 <em>×1</em></strong></div></div>
        <div class="blade-arena-wrap"><div class="blade-arena"><video autoplay muted playsinline aria-label="Tükrözött kamera"></video><canvas tabindex="0" aria-label="Neon Blade játékpálya. Húzd végig az ujjad vagy az egeret a kristályokon."></canvas>
          <div class="blade-tracking" role="status" hidden></div><div class="blade-overlay"><div class="blade-panel"><span class="blade-eyebrow" data-panel-eyebrow>NEON BLADE</span><h2 data-panel-title></h2><p data-panel-message></p><div data-results hidden></div><button class="blade-primary" data-begin>Indulhat!</button><button class="blade-secondary" data-restart>Kamera újraindítása</button><button class="blade-text-button" data-exit>Vissza a menübe</button></div></div>
        </div></div><div class="blade-bottom"><span data-hint></span><span data-wave></span></div>
      </section>`);
    this.el<HTMLSelectElement>('select').value = getLanguage();
    this.view = new BladeView(this.el('canvas'));
    this.camera = new BladeCamera(this.el('video'), frame => {
      this.measured = frame;
      if (this.phase === 'playing') this.game.accept(frame, performance.now());
    });
    if (import.meta.env.DEV) { const diagnostics = document.createElement("output"); diagnostics.hidden = true; diagnostics.dataset.bladeDiagnostics = ""; this.root.append(diagnostics); }
    this.bind();
  }
  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private on(selector: string, action: () => void): void { this.el(selector).addEventListener('click', action, { signal: this.abort.signal }); }
  private text(selector: string, value: string): void { const el = this.el(selector); if (el.textContent !== value) el.textContent = value; }
  private bind(): void {
    const signal = this.abort.signal;
    this.on('[data-camera]', () => void this.setupCamera(false));
    this.on('[data-practice]', () => { this.enter('touch'); this.begin(); });
    this.on('[data-home]', () => this.home()); this.on('[data-exit]', () => this.home());
    this.on('[data-pause]', () => this.pause());
    this.on('[data-restart]', () => void this.setupCamera(this.game.phase === 'running'));
    this.on('[data-begin]', () => {
      if (this.mode === 'camera' && !this.camera.running) void this.setupCamera(this.game.phase === 'running');
      else this.begin();
    });
    this.on('[data-sound]', () => {
      this.sound = !this.sound; this.el('[data-sound]').setAttribute('aria-pressed', String(this.sound));
      this.text('[data-sound]', t(this.sound ? 'Hang: be' : 'Hang: ki'));
      if (this.sound) { this.audio ??= typeof AudioContext !== 'undefined' ? new AudioContext() : null; void this.audio?.resume().catch(() => {}); }
      else void this.audio?.suspend().catch(() => {});
    });
    this.el('select').addEventListener('change', event => {
      const language = (event.target as HTMLSelectElement).value; if (!isLanguage(language)) return;
      try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* URL retains the choice. */ }
      this.camera.stop(); const url = new URL(location.href); url.searchParams.set('lang', language); location.assign(url.href);
    }, { signal });
    const canvas = this.el('canvas');
    canvas.addEventListener('pointerdown', event => {
      if (this.mode !== 'touch' || this.phase !== 'playing' || event.button !== 0 || this.pointer !== null) return;
      this.pointer = event.pointerId; canvas.setPointerCapture(event.pointerId); this.game.breakSweep(); this.movePointer(event);
    }, { signal });
    canvas.addEventListener('pointermove', event => { if (this.pointer === event.pointerId) this.movePointer(event); }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, event => {
      if (event.pointerId === this.pointer) { this.pointer = null; this.measured = null; this.game.breakSweep(); }
    }, { signal });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' || (event.key.toLowerCase() === 'p' && !(event.target instanceof HTMLSelectElement))) this.pause(); }, { signal });
    window.addEventListener('resize', () => this.resize(), { signal });
    this.el('video').addEventListener('resize', () => {
      if (this.phase === 'playing') this.pause();
      this.resize(); this.measured = null; this.game.breakSweep(); this.view.reset();
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspend(); }, { signal });
    window.addEventListener('pagehide', () => this.suspend(), { signal });
    window.addEventListener('pageshow', () => { if (this.phase !== 'menu' && !document.hidden) this.resize(); }, { signal });
  }
  private enter(mode: 'camera' | 'touch'): void {
    this.mode = mode; this.phase = 'setup'; this.root.classList.toggle('blade-calibrating', mode === 'camera'); this.root.classList.add('blade-in-game');
    this.el('.blade-menu').hidden = true; this.el('.blade-play').hidden = false;
    this.el('video').hidden = mode !== 'camera';
    this.el('[data-results]').hidden = true;
    this.text('[data-mode-label]', t(mode === 'camera' ? 'KAMERÁS KARDKALAND' : 'EGÉR / ÉRINTÉS · GYAKORLÁS'));
    this.text('[data-hint]', t(mode === 'camera' ? 'A két szélső sáv közötti fényes rész a pengéd.' : 'Tartsd lenyomva, és húzd át a kristályokon!'));
    this.resize(); this.startFrames();
  }
  private async setupCamera(resume: boolean): Promise<void> {
    const generation = ++this.generation;
    this.enter('camera'); if (!resume) this.game.phase = 'ready';
    this.panel('Mutasd a jelölőbotot!', 'Kamera engedélyezése…');
    this.el<HTMLButtonElement>('[data-begin]').disabled = true;
    this.el('[data-restart]').hidden = true;
    try {
      const started = await this.camera.start();
      if (generation !== this.generation || this.destroyed) return;
      if (!started) throw new Error('camera-unavailable');
      this.resize(); this.text('[data-panel-message]', t('Mutasd mind a négy színes sávot a kamerának.'));
      this.el('[data-restart]').hidden = false;
    } catch {
      if (generation !== this.generation) return;
      this.camera.stop(); this.text('[data-panel-message]', t('A kamera nem indult el. Engedélyezd a böngészőben, vagy próbáld ki érintéssel a menüből.'));
      this.el('[data-restart]').hidden = false;
      cancelAnimationFrame(this.raf); this.raf = 0;
    }
  }
  private panel(title: string, message: string): void {
    this.el('.blade-overlay').hidden = false;
    this.text('[data-panel-title]', t(title)); this.text('[data-panel-message]', t(message));
    this.text('[data-begin]', t(this.game.phase === 'running' ? 'Folytatás' : 'Indulhat!'));
    this.el<HTMLButtonElement>('[data-begin]').disabled = false;
    this.el('[data-restart]').hidden = this.mode !== 'camera';
  }
  private begin(): void {
    if (this.mode === 'camera' && (!this.camera.running || !this.measured || !validSword(this.measured, performance.now()))) return;
    if (this.game.phase !== 'running') this.game.start(this.aspect());
    else { this.game.aspect = this.aspect(); this.game.breakSweep(); }
    this.root.classList.remove('blade-calibrating'); this.phase = 'playing'; this.pointer = null; this.el('.blade-overlay').hidden = true;
    this.el('[data-results]').hidden = true; this.game.paused = false; this.previousTime = 0;
    this.view.reset(); this.startFrames(); if (this.sound) void this.audio?.resume().catch(() => {});
    this.el('canvas').focus();
  }
  private pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'setup') return;
    this.root.classList.remove('blade-calibrating'); this.phase = 'paused'; ++this.generation; this.camera.stop(); this.game.update(0, false); this.pointer = null;
    this.panel('Egy kis pihenő.', 'A köröd megvár.');
    this.text('[data-begin]', t(this.mode === 'camera' ? 'Kamera és folytatás' : 'Folytatás'));
    this.el('[data-restart]').hidden = true; this.el('.blade-tracking').hidden = true;
    cancelAnimationFrame(this.raf); this.raf = 0; void this.audio?.suspend().catch(() => {});
  }
  private suspend(): void { this.pause(); this.camera.stop(); cancelAnimationFrame(this.raf); this.raf = 0; ++this.generation; }
  private home(): void {
    ++this.generation; this.camera.stop(); this.phase = 'menu'; this.game.phase = 'ready'; this.measured = null; this.pointer = null;
    this.game.breakSweep(); this.view.reset(); this.root.classList.remove('blade-in-game');
    this.el('.blade-play').hidden = true; this.el('.blade-menu').hidden = false;
    cancelAnimationFrame(this.raf); this.raf = 0; void this.audio?.suspend().catch(() => {});
    this.el('[data-camera]').focus();
  }
  private aspect(): number { const video = this.el<HTMLVideoElement>('video'); return this.mode === 'camera' && video.videoWidth ? video.videoWidth / video.videoHeight : innerWidth < 600 ? 3 / 4 : 4 / 3; }
  private resize(): void {
    if (this.phase === 'menu') return;
    const aspect = this.aspect();
    const height = Math.max(180, Math.min((innerWidth - 32) / aspect, innerHeight - (innerWidth < 600 ? 242 : 250), 750));
    const arena = this.el('.blade-arena'); arena.style.width = `${height * aspect}px`; arena.style.height = `${height}px`;
    this.view.resize(); this.view.draw(this.game, this.measured, performance.now(), this.mode === 'camera');
  }
  private movePointer(event: PointerEvent): void {
    if (this.phase !== 'playing') return;
    const rect = this.el('canvas').getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const now = performance.now();
    this.measured = { timestampMs: now, base: { x: 1 - x, y: Math.min(1, y + .1) }, tip: { x: 1 - x, y },
      confidence: 1, imageAspectRatio: this.aspect(), source: 'color-bands-2d' };
    this.game.accept(this.measured, now);
  }
  private startFrames(): void { if (!this.raf && !document.hidden && !this.destroyed) { this.previousTime = 0; this.raf = requestAnimationFrame(time => this.frame(time)); } }
  private frame(now: number): void {
    this.raf = 0;
    if (document.hidden || this.destroyed || this.phase === 'menu' || this.phase === 'paused' || this.phase === 'over') return;
    const dt = this.previousTime ? (now - this.previousTime) / 1000 : 0;
    if (this.previousTime && dt < 1 / (this.phase === 'setup' ? 31 : 62)) { this.raf = requestAnimationFrame(time => this.frame(time)); return; }
    this.previousTime = now;
    const fresh = this.measured && validSword(this.measured, performance.now());
    if (this.phase === 'playing' && this.mode === 'camera' && !this.camera.running) {
      this.pause(); this.text('[data-panel-message]', t('A kamera leállt. A folytatáshoz indítsd újra.')); return;
    }
    const active = this.phase === 'playing' && (this.mode === 'touch' || !!fresh);
    this.game.update(dt, active);
    if (this.phase === 'setup') {
      this.el<HTMLButtonElement>('[data-begin]').disabled = !fresh;
      if (fresh) this.text('[data-panel-message]', t('Megvan a bot! Indulhat a kristályvadászat.'));
      else if (this.camera.running) this.text('[data-panel-message]', t('Mutasd mind a négy színes sávot a kamerának.'));
    }
    if (this.phase === 'playing') {
      const notice = this.el('.blade-tracking'); notice.hidden = active;
      if (!active) notice.textContent = t(this.camera.running ? 'Mutasd a színsávokat! Az idő addig megáll.' : 'A kamera leállt. A folytatáshoz nyomj szünetet.');
    }
    this.view.draw(this.game, this.measured, performance.now(), this.mode === 'camera');
    if (now - this.lastHud >= 100 || !this.lastHud) {
      if (import.meta.env.DEV) this.text("[data-blade-diagnostics]", JSON.stringify({ camera: this.camera.running, stats: this.camera.stats, fresh: !!fresh, rings: this.measured?.visibleRings }));
      this.lastHud = now; this.text('[data-score]', String(this.game.score)); this.text('[data-time]', String(Math.ceil(this.game.remaining)).padStart(2, '0'));
      this.text('[data-combo]', `${this.game.combo} · ×${this.game.multiplier}`);
      this.text('[data-wave]', t('{wave}. HULLÁM / 3', { wave: this.game.wave }));
      if (this.mode === 'camera' && this.phase === 'playing') this.text('[data-hint]', fresh
        ? t('{count}/4 sáv követve', { count: this.measured?.visibleRings ?? 0 }) : t('Mutasd mind a négy színes sávot a kamerának.'));
    }
    if (this.sound && this.game.bursts.some(burst => burst.age < .08) && now - this.lastTone > 100) this.tone(now);
    if (this.game.phase === 'over') { this.finish(); return; }
    this.raf = requestAnimationFrame(time => this.frame(time));
  }
  private tone(now: number): void {
    if (!this.audio || this.audio.state !== 'running') return;
    this.lastTone = now; const oscillator = this.audio.createOscillator(), gain = this.audio.createGain(), time = this.audio.currentTime;
    oscillator.frequency.setValueAtTime(420 + this.game.multiplier * 100, time); oscillator.frequency.exponentialRampToValueAtTime(900, time + .07);
    gain.gain.setValueAtTime(.035, time); gain.gain.exponentialRampToValueAtTime(.001, time + .09);
    oscillator.connect(gain).connect(this.audio.destination); oscillator.start(); oscillator.stop(time + .1);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  private finish(): void {
    this.root.classList.remove('blade-calibrating'); this.phase = 'over'; this.camera.stop(); this.el('.blade-tracking').hidden = true;
    this.best[this.mode] = Math.max(this.best[this.mode], this.game.score);
    try { localStorage.setItem(BEST_KEY, JSON.stringify(this.best)); } catch { /* Optional local scores. */ }
    this.panel('Fényes kör volt!', 'Még egy kör? Építs még hosszabb kombót!');
    this.text('[data-begin]', t('Új kör')); this.el('[data-restart]').hidden = true;
    const results = this.el('[data-results]'); results.hidden = false;
    results.textContent = t('{score} pont · {cuts} vágás · {combo} legjobb kombó · {best} rekord', { score: this.game.score, cuts: this.game.cuts, combo: this.game.bestCombo, best: this.best[this.mode] });
    this.el('[data-begin]').focus(); void this.audio?.suspend().catch(() => {});
  }
  dispose(): void { this.suspend(); this.destroyed = true; this.abort.abort(); void this.audio?.close().catch(() => {}); }
}
