import { getLanguage, isLanguage, LANGUAGE_KEY, localizedHtml, t } from '../../i18n';
import { PopCamera, type PopCameraMode } from '../../core/pop/PopCamera';
import { PopSimulation } from '../../core/pop/PopSimulation';
import { validHands, type HandFrame } from '../../core/pop/HandInput';
import { validSword, type SwordFrame } from '../../core/tracking/sword/types';
import { PopView } from './PopView';
import '../blade/blade.css';
import './pop.css';
type Mode = PopCameraMode | 'touch';
const BEST_KEY = 'catspirits.neon-pop.best.v1';
const art = `<svg viewBox="0 0 480 460" aria-hidden="true"><g fill="none" stroke="#7ce5d8" opacity=".2"><circle cx="240" cy="230" r="180"/><circle cx="240" cy="230" r="135" stroke-dasharray="4 12"/><path d="M60 230h360M240 50v360"/></g><g stroke-width="3"><g transform="translate(150 143)"><circle r="55" fill="#24585f" stroke="#83e9d9"/><path d="M-18-6v10m36-10v10m-30 17q12 12 24 0" stroke="#f2fff8" fill="none" stroke-linecap="round"/></g><g transform="translate(326 248)"><circle r="67" fill="#413a67" stroke="#b6a4ff"/><path d="M-20-8v12m40-12v12m-34 20q14 14 28 0" stroke="#fff" fill="none" stroke-linecap="round"/></g><g transform="translate(164 333)"><circle r="39" fill="#69502b" stroke="#ffe4a1"/><path d="M-12-5v8m24-8v8m-20 12q8 8 16 0" stroke="#fff4c9" fill="none" stroke-linecap="round"/></g><circle cx="296" cy="122" r="18" fill="#ffb1df44" stroke="#ffb1df"/><path d="M277 142l-36 36" stroke="#ffb1df" stroke-dasharray="3 8"/></g></svg>`;

export class PopApp {
  private game = new PopSimulation();
  private camera: PopCamera; private view: PopView;
  private hands: HandFrame | null = null; private sword: SwordFrame | null = null; private lastSeen = -Infinity;
  private phase: 'menu' | 'setup' | 'playing' | 'paused' | 'over' = 'menu';
  private mode: Mode = 'hands'; private raf = 0; private previousTime = 0; private lastHud = 0;
  private generation = 0; private destroyed = false; private abort = new AbortController();
  private best = { hands: 0, sword: 0, touch: 0 };
  constructor(private root: HTMLElement) {
    document.title = `Catspirits · Neon Pop · ${t('Célozz és csapj le!')}`; root.classList.add('blade-root', 'pop-root');
    try { const saved = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}'); for (const key of ['hands', 'sword', 'touch'] as const) if (Number.isSafeInteger(saved?.[key]) && saved[key] >= 0 && saved[key] <= 100000) this.best[key] = saved[key]; } catch { /* Optional local scores. */ }
    root.innerHTML = localizedHtml(`
      <header class="blade-header"><a class="blade-brand" href="?lang=${getLanguage()}"><span class="blade-brand-icon">✦</span><span>CATSPIRITS<small>MOVE. PLAY. GLOW.</small></span></a>
      <nav class="blade-games" aria-label="Játékválasztó"><a href="?lang=${getLanguage()}">Cyber Jumper</a><a href="?game=blade&lang=${getLanguage()}">Neon Blade</a><a href="?game=pop&lang=${getLanguage()}" aria-current="page">Neon Pop</a></nav>
      <label class="blade-language"><span class="sr-only">Nyelv</span><select aria-label="Nyelv"><option value="en">EN</option><option value="hu">HU</option><option value="de">DE</option></select></label></header>
      <main class="blade-menu"><section class="blade-intro"><span class="blade-eyebrow">CÉLZÓS TESZTJÁTÉK</span><h1>NEON<br><span>POP.</span></h1>
      <p class="blade-lead">Célozz és csapj le!<br>A felbukkanó fénylényeket kézzel vagy karddal is elkaphatod.</p>
      <div class="blade-tags"><span>45 másodperc</span><span>Két kézzel is</span><span>Pontos találatok</span></div>
      <button class="blade-primary" data-hands>Kamera · kézzel <span>↗</span></button><button class="blade-secondary" data-sword>Kamera · jelölőbottal <span>↗</span></button><button class="blade-text-button" data-touch>Kipróbálom egérrel / érintéssel</button><p class="blade-private">A kamera képe a gépeden marad.</p></section>
      <div class="blade-art">${art}<span class="blade-art-label">03 / NEON POP · TEST</span></div>
      <section class="blade-guide"><div><span class="blade-eyebrow">CSAK CÉLOZZ, ÉS MOZDULJ!</span><h2>Minden célpont aktív.</h2><p>Több fénylényt is elkaphatsz egy mozdulattal. A körív mutatja, mennyi idejük maradt. Az arany háromszoros pontot ér.</p></div><div class="pop-instructions"><p>Kézzel: a csuklódat követő színes körrel csapj a célpontra. Mindkét kéz működik; a vállad, könyököd és kezed legyen a képen.</p><p>Karddal: a fényes pengével vágj át a célponton, bármelyik irányból.</p><p>Puha játékbotot használj, hagyj szabad helyet, és ne üsd meg a képernyőt!</p><a href="?game=blade&lang=${getLanguage()}">Jelölőbot és játékszabályok</a></div></section>
      <footer class="blade-menu-footer"><span>CATSPIRITS / PLAY WITH MOVEMENT</span><a href="/licenses/THIRD-PARTY-NOTICES.txt">Licencek</a><details><summary>Adatvédelem</summary><p>A kamera képe a gépeden marad. A játék nem rögzít és nem tölt fel kameraképet. A nyelvválasztást és a rekordokat a böngésződ tárolja. A tárhelyet a Cloudflare biztosítja; a kiszolgáláshoz és a védelemhez hálózati adatokat kezel.</p></details></footer></main>
      <section class="blade-play" hidden><div class="blade-toolbar"><button class="blade-text-button" data-home>← Menü</button><span data-mode></span><button class="blade-text-button" data-pause>Szünet</button></div>
      <div class="blade-hud"><div><small>PONT</small><strong data-score>0</strong></div><div class="blade-timer"><small>HÁTRALÉVŐ IDŐ</small><strong data-time>45</strong></div><div><small>KOMBÓ</small><strong data-combo>0 · ×1</strong></div></div>
      <div class="blade-arena-wrap"><div class="blade-arena"><video autoplay muted playsinline aria-label="Tükrözött kamera"></video><canvas tabindex="0" aria-label="Neon Pop játékpálya. Koppints a felbukkanó célpontokra."></canvas><div class="blade-tracking" role="status" hidden></div>
      <div class="blade-overlay"><div class="blade-panel"><span class="blade-eyebrow">NEON POP · TEST</span><h2 data-title></h2><p data-message></p><div data-results hidden></div><button class="blade-primary" data-begin>Indulhat!</button><button class="blade-secondary" data-restart>Kamera újraindítása</button><button class="blade-text-button" data-exit>Vissza a menübe</button></div></div></div></div>
      <div class="blade-rules"><span>Minden célpont aktív · Nincs kötelező vágási irány</span></div><div class="blade-bottom"><span data-hint></span><span data-wave></span></div></section>`);
    this.el<HTMLSelectElement>('select').value = getLanguage(); this.view = new PopView(this.el('canvas'));
    this.camera = new PopCamera(this.el('video'), frame => {
      if (this.mode !== 'hands') return;
      const now = performance.now(); if (frame && validHands(frame, now)) { this.hands = frame; this.lastSeen = frame.timestampMs; }
      if (this.phase === 'playing') this.game.acceptHands(frame, now);
    }, frame => {
      if (this.mode !== 'sword') return;
      const now = performance.now(); if (frame && validSword(frame, now)) { this.sword = frame; this.lastSeen = frame.timestampMs; }
      if (this.phase === 'playing') this.game.acceptSword(frame, now);
    });
    this.bind();
    if (import.meta.env.DEV) { const output = document.createElement('output'); output.hidden = true; output.dataset.popDiagnostics = ''; this.root.append(output); }
  }
  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private text(selector: string, text: string): void { const el = this.el(selector); if (el.textContent !== text) el.textContent = text; }
  private on(selector: string, action: () => void): void { this.el(selector).addEventListener('click', action, { signal: this.abort.signal }); }
  private bind(): void {
    const signal = this.abort.signal;
    this.on('[data-hands]', () => void this.setup('hands', false)); this.on('[data-sword]', () => void this.setup('sword', false));
    this.on('[data-touch]', () => { this.game.phase = 'ready'; this.enter('touch'); this.begin(); });
    this.on('[data-home]', () => this.home()); this.on('[data-exit]', () => this.home()); this.on('[data-pause]', () => this.pause());
    this.on('[data-restart]', () => { if (this.mode !== 'touch') void this.setup(this.mode, this.game.phase === 'running'); });
    this.on('[data-begin]', () => { if (this.mode !== 'touch' && !this.camera.running) void this.setup(this.mode, this.game.phase === 'running'); else this.begin(); });
    this.el('select').addEventListener('change', event => {
      const language = (event.target as HTMLSelectElement).value; if (!isLanguage(language)) return;
      try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* URL retains choice. */ }
      this.camera.stop(); const url = new URL(location.href); url.searchParams.set('lang', language); location.assign(url.href);
    }, { signal });
    this.el('canvas').addEventListener('pointerdown', event => {
      if (this.mode !== 'touch' || this.phase !== 'playing' || event.button !== 0) return;
      const box = this.el('canvas').getBoundingClientRect(); this.game.tap({ x: (event.clientX-box.left)/box.width, y: (event.clientY-box.top)/box.height });
    }, { signal });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' || (event.key.toLowerCase() === 'p' && !(event.target instanceof HTMLSelectElement))) this.pause(); }, { signal });
    window.addEventListener('resize', () => { if (this.phase === 'playing') this.pause(); this.resize(); }, { signal });
    this.el('video').addEventListener('resize', () => { if (this.phase === 'playing') this.pause(); this.resize(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.suspend(); }, { signal });
    window.addEventListener('pagehide', () => this.suspend(), { signal });
  }
  private clearInput(): void { this.hands = null; this.sword = null; this.lastSeen = -Infinity; this.game.breakInput(); }
  private enter(mode: Mode): void {
    this.mode = mode; this.phase = 'setup'; this.clearInput(); this.root.classList.add('blade-in-game'); this.root.classList.toggle('blade-calibrating', mode !== 'touch');
    this.el('.blade-menu').hidden = true; this.el('.blade-play').hidden = false; this.el('video').hidden = mode === 'touch'; this.el('[data-results]').hidden = true;
    this.text('[data-mode]', t(mode === 'hands' ? 'KÉZ · KAMERA' : mode === 'sword' ? 'KARD · KAMERA' : 'EGÉR / ÉRINTÉS · GYAKORLÁS'));
    this.text('[data-hint]', t(mode === 'hands' ? 'A két színes kör a két kezed.' : mode === 'sword' ? 'A két szélső sáv közötti fényes rész a pengéd.' : 'Koppints a fénylényekre!'));
    this.resize(); this.startFrames();
  }
  private async setup(mode: PopCameraMode, resume: boolean): Promise<void> {
    const generation = ++this.generation; this.enter(mode); if (!resume) { this.game.start(this.aspect()); this.game.phase = 'ready'; this.game.paused = true; }
    this.panel('Készülj a célzásra!', 'Kamera engedélyezése…'); this.el<HTMLButtonElement>('[data-begin]').disabled = true; this.el('[data-restart]').hidden = true;
    try {
      const ready = await this.camera.start(mode); if (generation !== this.generation || this.destroyed) return;
      if (!ready) throw new Error('camera-unavailable'); this.resize(); this.el('[data-restart]').hidden = false;
    } catch {
      if (generation !== this.generation) return;
      this.camera.stop(); this.clearInput(); this.text('[data-message]', t('A kamera nem indult el. Engedélyezd a böngészőben, vagy próbáld ki érintéssel a menüből.'));
      this.el('[data-restart]').hidden = false; this.stopFrames();
    }
  }
  private panel(title: string, message: string): void {
    this.el('.blade-overlay').hidden = false; this.text('[data-title]', t(title)); this.text('[data-message]', t(message));
    this.text('[data-begin]', t(this.game.phase === 'running' ? 'Folytatás' : 'Indulhat!'));
    this.el<HTMLButtonElement>('[data-begin]').disabled = false; this.el('[data-restart]').hidden = this.mode === 'touch';
  }
  private fresh(now: number): boolean { return this.mode === 'hands' ? !!this.hands && validHands(this.hands, now) : this.mode === 'sword' ? !!this.sword && validSword(this.sword, now) : true; }
  private begin(): void {
    if (this.mode !== 'touch' && (!this.camera.running || !this.fresh(performance.now()))) return;
    if (this.game.phase !== 'running') this.game.start(this.aspect()); else { this.game.aspect = this.aspect(); this.game.breakInput(); }
    this.phase = 'playing'; this.game.paused = false; this.root.classList.remove('blade-calibrating'); this.el('.blade-overlay').hidden = true; this.el('[data-results]').hidden = true;
    this.previousTime = 0; this.startFrames(); this.el('canvas').focus();
  }
  private pause(): void {
    if (this.phase !== 'playing' && this.phase !== 'setup') return;
    this.phase = 'paused'; ++this.generation; this.camera.stop(); this.clearInput(); this.game.update(0, false); this.stopFrames(); this.root.classList.remove('blade-calibrating'); this.el('.blade-tracking').hidden = true;
    this.panel('Egy kis pihenő.', 'A köröd megvár.'); this.text('[data-begin]', t(this.mode === 'touch' ? 'Folytatás' : 'Kamera és folytatás')); this.el('[data-restart]').hidden = true;
  }
  private suspend(): void { this.pause(); ++this.generation; this.camera.stop(); this.clearInput(); this.stopFrames(); }
  private home(): void {
    ++this.generation; this.camera.stop(); this.clearInput(); this.stopFrames(); this.phase = 'menu'; this.game.phase = 'ready'; this.root.classList.remove('blade-in-game', 'blade-calibrating');
    this.el('.blade-play').hidden = true; this.el('.blade-menu').hidden = false; this.el('[data-hands]').focus();
  }
  private aspect(): number { const v = this.el<HTMLVideoElement>('video'); return this.mode !== 'touch' && v.videoWidth ? v.videoWidth/v.videoHeight : innerWidth < 600 ? 3/4 : 4/3; }
  private resize(): void {
    if (this.phase === 'menu') return;
    const aspect = this.aspect(), height = Math.max(180, Math.min((innerWidth-32)/aspect, innerHeight-280, 750));
    const arena = this.el('.blade-arena'); arena.style.width = `${height*aspect}px`; arena.style.height = `${height}px`;
    this.view.resize(); this.view.draw(this.game, this.hands, this.sword, performance.now(), this.mode !== 'touch');
  }
  private startFrames(): void { if (!this.raf && !document.hidden && !this.destroyed) { this.previousTime = 0; this.raf = requestAnimationFrame(time => this.frame(time)); } }
  private stopFrames(): void { cancelAnimationFrame(this.raf); this.raf = 0; }
  private frame(time: number): void {
    this.raf = 0; if (document.hidden || this.destroyed || (this.phase !== 'setup' && this.phase !== 'playing')) return;
    const dt = this.previousTime ? (time-this.previousTime)/1000 : 0;
    if (this.previousTime && dt < 1/(this.phase === 'setup' ? 31 : 62)) { this.raf = requestAnimationFrame(t => this.frame(t)); return; }
    this.previousTime = time; const now = performance.now();
    if (this.phase === 'playing' && this.mode !== 'touch' && !this.camera.running && !this.camera.loading) { this.pause(); this.text('[data-message]', t('A kamera leállt. A folytatáshoz indítsd újra.')); return; }
    const active = this.phase === 'playing' && (this.mode === 'touch' || this.camera.running && now-this.lastSeen <= (this.mode === 'hands' ? 360 : 240));
    this.game.update(dt, active);
    if (this.phase === 'setup') {
      this.el<HTMLButtonElement>('[data-begin]').disabled = !this.camera.running || !this.fresh(now);
      this.text('[data-message]', t(this.camera.loading ? 'A kamerakövetés betöltése…' : this.fresh(now) ? 'Megvan! Indulhat a célvadászat.' : this.mode === 'hands' ? 'Mutasd a kezed és a könyököd a kamerának.' : 'Mutasd mind a négy színes sávot a kamerának.'));
    }
    if (this.phase === 'playing') { this.el('.blade-tracking').hidden = active; if (!active) this.text('.blade-tracking', t('Nincs követés. Az idő megáll, amíg újra látlak.')); }
    this.view.draw(this.game, this.hands, this.sword, now, this.mode !== 'touch');
    if (time-this.lastHud >= 100 || !this.lastHud) { this.lastHud = time; this.hud(); }
    if (import.meta.env.DEV) this.text('[data-pop-diagnostics]', JSON.stringify({ mode: this.mode, phase: this.phase, fresh: this.fresh(now), active, hits: this.game.hits, camera: this.camera.running }));
    if (this.game.phase === 'over') { this.finish(); return; }
    this.raf = requestAnimationFrame(t => this.frame(t));
  }
  private hud(): void {
    this.text('[data-score]', String(this.game.score)); this.text('[data-time]', String(Math.ceil(this.game.remaining)).padStart(2, '0')); this.text('[data-combo]', `${this.game.combo} · ×${this.game.multiplier}`);
    this.text('[data-wave]', t('{wave}. HULLÁM / 3', { wave: this.game.wave }));
  }
  private finish(): void {
    this.phase = 'over'; this.camera.stop(); this.clearInput(); this.el('.blade-tracking').hidden = true; this.hud();
    this.best[this.mode] = Math.max(this.best[this.mode], this.game.score); try { localStorage.setItem(BEST_KEY, JSON.stringify(this.best)); } catch { /* Optional local scores. */ }
    this.panel('Szép célzás!', 'Újra megpróbálod?'); this.text('[data-begin]', t('Új kör')); this.el('[data-restart]').hidden = true;
    this.el('[data-results]').hidden = false; this.text('[data-results]', t('{score} pont · {hits} találat · {missed} kihagyás · {best} rekord', { score: this.game.score, hits: this.game.hits, missed: this.game.missed, best: this.best[this.mode] })); this.el('[data-begin]').focus();
  }
  dispose(): void { this.suspend(); this.destroyed = true; this.abort.abort(); }
}
