import { t } from '../../i18n';

export const GAME_LAYOUT_EVENT = 'catspirits-game-layout';

export class GameFullscreen {
  private readonly abort = new AbortController();
  private readonly visibility = new MutationObserver(() => {
    if (this.frame?.hidden) this.leave(false);
    this.updateButton();
  });
  private frames: HTMLElement[] = [];
  private frame?: HTMLElement;
  private native = false;
  private tools?: HTMLElement;
  private button?: HTMLButtonElement;
  private background: HTMLElement[] = [];

  constructor(private readonly root: HTMLElement, private readonly onFrame: (frame?: HTMLElement) => void) {
    const signal = this.abort.signal;
    root.addEventListener('click', event => {
      if (!(event.target instanceof Element) || event.target.closest('[data-game-fullscreen]') !== this.button || this.button?.disabled) return;
      if (this.frame) this.leave();
      else {
        const frame = this.available;
        if (frame) this.enter(frame);
      }
    }, { signal });
    document.addEventListener('fullscreenchange', () => {
      if (!this.frame) return;
      if (document.fullscreenElement === this.frame) this.native = true;
      else if (this.native) this.leave();
    }, { signal });
    window.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.frame) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.leave();
    }, { signal, capture: true });
  }

  private get available(): HTMLElement | undefined { return this.frames.find(frame => !frame.hidden); }

  refresh(): void {
    this.visibility.disconnect();
    this.tools = this.root.querySelector<HTMLElement>('.shell-tools') ?? undefined;
    this.button = this.tools?.querySelector<HTMLButtonElement>('[data-game-fullscreen]') ?? undefined;
    this.frames = Array.from(this.root.querySelectorAll<HTMLElement>('[data-game-frame]'));
    for (const frame of this.frames) this.visibility.observe(frame, { attributes: true, attributeFilter: ['hidden'] });
    this.updateButton();
  }

  beforeRouteChange(): void {
    this.visibility.disconnect();
    this.leave(false);
    this.frames = [];
    this.tools = this.button = undefined;
  }

  private enter(frame: HTMLElement): void {
    this.frame = frame;
    frame.dataset.gameExpanded = '';
    for (let item = frame; item !== this.root && item.parentElement; item = item.parentElement) {
      for (const sibling of item.parentElement.children) {
        if (sibling === item || !(sibling instanceof HTMLElement)) continue;
        sibling.dataset.fullscreenBackground = '';
        this.background.push(sibling);
      }
    }
    if (this.button) frame.append(this.button);
    this.updateButton();
    this.layoutChanged();
    const focus = frame.querySelector<HTMLElement>('[data-hand-playfield][tabindex], canvas[tabindex]') ?? this.button;
    focus?.focus({ preventScroll: true });

    // Camera-generated clicks can expand the viewport. Native fullscreen also needs browser activation.
    if (document.fullscreenEnabled && frame.requestFullscreen && navigator.userActivation?.isActive !== false) {
      void frame.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        if (document.fullscreenElement !== frame) return;
        if (this.frame === frame) this.native = true;
        else void document.exitFullscreen().catch(() => {});
      }, () => {});
    }
  }

  private leave(restoreFocus = true): void {
    const frame = this.frame;
    if (!frame) return;
    this.frame = undefined;
    this.native = false;
    if (document.fullscreenElement === frame) void document.exitFullscreen().catch(() => {});
    delete frame.dataset.gameExpanded;
    for (const sibling of this.background) delete sibling.dataset.fullscreenBackground;
    this.background = [];
    if (this.button) this.tools?.append(this.button);
    this.updateButton();
    this.layoutChanged();
    if (restoreFocus) this.button?.focus({ preventScroll: true });
  }

  private updateButton(): void {
    if (!this.button) return;
    const expanded = !!this.frame;
    const label = t(expanded ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő');
    this.button.toggleAttribute('data-exit-fullscreen', expanded);
    this.button.disabled = !expanded && !this.available;
    this.button.setAttribute('aria-label', label);
    this.button.title = this.button.disabled ? t('Játék közben érhető el.') : label;
  }

  private layoutChanged(): void {
    this.onFrame(this.frame);
    window.dispatchEvent(new Event(GAME_LAYOUT_EVENT));
  }

  dispose(): void {
    this.beforeRouteChange();
    this.abort.abort();
  }
}
