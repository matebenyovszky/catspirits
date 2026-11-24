import { ChipAudio } from '../../core/audio/ChipAudio';
import { demoInput } from '../../core/festival/demo';
import type { FestivalGame, FestivalId } from '../../core/festival/types';
import { accents, description, ids, say, titles } from './catalog';

const CLIP_SECONDS = 12;
const STEP = 1 / 30;

export function demoMarkup(): string {
  return `<section class="arc-reel" data-demo hidden>
    <canvas width="800" height="560" aria-hidden="true"></canvas>
    <div><small>${say('Standi bemutató','Booth demo','Stand-Demo')} · <span data-demo-count></span></small>
    <h2 data-demo-title></h2><p class="arc-demo-objective" data-demo-caption></p>
    <a data-route data-demo-play>${say('Ezt játszom','Play this game','Dieses Spiel starten')} ▸</a>
    <div class="arc-demo-tools"><button class="arc-demo-next" type="button" data-demo-next>${say('Következő','Next','Weiter')} →</button>
    <button class="arc-demo-close" type="button" data-demo-close>${say('Vissza a játékokhoz','Back to games','Zur Spielauswahl')}</button></div></div></section>`;
}

/** Only the selected foreground clip animates. The public demo never starts a camera or records scores. */
export class DemoReel {
  private readonly section: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly open: HTMLButtonElement;
  private readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private game?: FestivalGame;
  private index = 0;
  private elapsed = 0;
  private previous = 0;
  private accumulator = 0;
  private raf = 0;

  constructor(root: HTMLElement, private audio: ChipAudio, private create: (id: FestivalId) => FestivalGame,
      private link: (id: FestivalId) => string, signal: AbortSignal) {
    this.section = root.querySelector('[data-demo]')!;
    this.intro = root.querySelector('.arc-intro')!;
    this.grid = root.querySelector('.arc-grid')!;
    this.open = root.querySelector('[data-demo-open]')!;
    this.canvas = this.section.querySelector('canvas')!;
    this.open.addEventListener('click', () => this.start(), { signal });
    this.section.querySelector('[data-demo-next]')!.addEventListener('click', () => this.select(this.index + 1), { signal });
    this.section.querySelector('[data-demo-close]')!.addEventListener('click', () => this.stop(), { signal });
    document.addEventListener('keydown', event => {
      if (this.game && event.key === 'Escape') this.stop();
    }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(false); }, { signal });
    window.addEventListener('pagehide', () => this.stop(false), { signal });
  }

  private start(): void {
    if (this.game || document.hidden) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;
    this.section.hidden = false;
    this.intro.hidden = this.grid.hidden = true;
    void this.audio.unlock();
    this.select(0);
    this.section.querySelector<HTMLAnchorElement>('[data-demo-play]')!.focus({ preventScroll: true });
    this.raf = requestAnimationFrame(this.frame);
  }
  private select(index: number): void {
    this.index = index % ids.length;
    const id = ids[this.index];
    this.game = this.create(id);
    this.elapsed = this.previous = this.accumulator = 0;
    this.section.style.setProperty('--accent', accents[id]);
    this.section.querySelector('[data-demo-count]')!.textContent = `${this.index + 1} / ${ids.length}`;
    this.section.querySelector('[data-demo-title]')!.textContent = titles[id];
    this.section.querySelector('[data-demo-caption]')!.textContent = description(id);
    this.section.querySelector<HTMLAnchorElement>('[data-demo-play]')!.href = this.link(id);
    this.audio.setTheme(id);
    this.audio.play();
    this.game.draw(this.ctx!, this.canvas.width, this.canvas.height);
  }
  private frame = (now: number): void => {
    if (!this.game || !this.ctx) return;
    if (document.hidden) { this.stop(false); return; }
    const delta = this.previous ? Math.min(.15, (now - this.previous) / 1000) : 0;
    this.previous = now;
    this.accumulator += Math.max(0, delta);
    if (this.accumulator >= STEP) {
      const id = ids[this.index];
      let input;
      do {
        const previousElapsed = this.elapsed;
        this.elapsed += STEP;
        this.accumulator -= STEP;
        input = demoInput(id, this.elapsed, previousElapsed);
        if (id === 'paint') input.beatPhase = this.audio.beatPhase();
        const cue = this.game.update(STEP, input);
        if (cue) this.audio.cue(cue);
      } while (this.accumulator >= STEP);
      const w = this.canvas.width, h = this.canvas.height;
      this.game.draw(this.ctx, w, h);
      this.ctx.save();
      this.ctx.translate(input.x * w, input.y * h);
      this.ctx.rotate(input.angle);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = '#fff';
      this.ctx.beginPath(); this.ctx.arc(0, 0, 7, 0, Math.PI * 2);
      this.ctx.moveTo(-32, 0); this.ctx.lineTo(-8, 0); this.ctx.stroke();
      this.ctx.restore();
      if (this.elapsed >= CLIP_SECONDS) this.select(this.index + 1);
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  stop(restoreFocus = true): void {
    if (!this.game) return;
    cancelAnimationFrame(this.raf);
    this.game = undefined;
    this.audio.sleep();
    this.section.hidden = true;
    this.intro.hidden = this.grid.hidden = false;
    if (restoreFocus) this.open.focus({ preventScroll: true });
  }
}
