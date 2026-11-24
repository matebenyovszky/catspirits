import type { QuarryRover } from '../../core/festival/workshop';
import type { RoverView3D } from './RoverView3D';
import { say } from './catalog';

/** The accessible input canvas and the running simulation survive view changes. */
export class RoverDisplay {
  private view?: RoverView3D;
  private generation = 0;
  private canvas: HTMLCanvasElement;
  private readonly toggle: HTMLButtonElement;
  private readonly hud: HTMLElement;
  private readonly message: HTMLElement;
  private lastHud = '';

  constructor(root: HTMLElement, private redraw: () => void, private signal: AbortSignal) {
    this.canvas = root.querySelector('[data-rover-canvas]')!;
    this.toggle = root.querySelector('[data-rover-view]')!;
    this.hud = root.querySelector('[data-rover-hud]')!;
    this.message = root.querySelector('[data-rover-message]')!;
    this.toggle.addEventListener('click', () => {
      if (this.view) this.disable();
      else void this.enable();
    }, { signal });
  }
  async enable(): Promise<void> {
    if (this.view || this.toggle.disabled || this.signal.aborted) return;
    const request = ++this.generation;
    this.toggle.disabled = true;
    this.message.hidden = true;
    try {
      const { RoverView3D } = await import('./RoverView3D');
      if (request !== this.generation || this.signal.aborted) return;
      // A released WebGL context belongs to its canvas. A second activation needs a fresh surface.
      const canvas = this.canvas.cloneNode(false) as HTMLCanvasElement;
      this.canvas.replaceWith(canvas);
      this.canvas = canvas;
      canvas.hidden = false;
      canvas.addEventListener('webglcontextlost', () => {
        if (this.view && this.canvas === canvas) this.fallback();
      }, { once: true });
      this.view = new RoverView3D(canvas);
      this.hud.hidden = false;
      this.toggle.setAttribute('aria-pressed','true');
      this.redraw();
    } catch {
      if (request === this.generation) this.fallback();
    } finally {
      if (!this.signal.aborted) this.toggle.disabled = false;
    }
  }
  draw(game: QuarryRover): boolean {
    if (!this.view) return false;
    try {
      this.view.draw(game);
    } catch {
      this.fallback();
      return false;
    }
    const status = `${say('Kapu','Gates','Tore')} ${game.gates}/10   ·   ♥ ${game.hull}/3`;
    if (status !== this.lastHud) {
      this.hud.textContent = status;
      this.lastHud = status;
    }
    return true;
  }
  private disable(): void {
    this.dispose();
    this.canvas.hidden = this.hud.hidden = true;
    this.toggle.setAttribute('aria-pressed', 'false');
    this.redraw();
  }
  private fallback(): void {
    this.disable();
    this.message.textContent = say('A térbeli nézet nem elérhető. A futam az alapnézetben folytatható.',
      '3D is unavailable. You can continue in the standard view.',
      '3D ist nicht verfügbar. Du kannst in der Standardansicht weiterspielen.');
    this.message.hidden = false;
  }
  dispose(): void {
    ++this.generation;
    const view = this.view;
    this.view = undefined;
    view?.dispose();
  }
}
