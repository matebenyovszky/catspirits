import { t } from '../../i18n';
import { cameraFeed } from '../../core/tracking/CameraFeed';
import type { TrackingStatus } from '../../core/tracking/CameraPoseTracker';
import { TrackingOverlay } from '../../core/tracking/TrackingOverlay';
import type { PoseFrame } from '../../core/tracking/types';
import { HandGesture } from './HandGesture';
import { HandPointer } from './HandPointer';
import './hand.css';

export class HandNavigation {
  private readonly panel = document.createElement('aside');
  private readonly preview = document.createElement('div');
  private readonly caption = document.createElement('p');
  private readonly access = document.createElement('section');
  private readonly heading = document.createElement('h1');
  private readonly instruction = document.createElement('p');
  private readonly message = document.createElement('p');
  private readonly retry = document.createElement('button');
  private readonly cursor = document.createElement('div');
  private readonly gesture = new HandGesture();
  private readonly pointer = new HandPointer();
  private readonly abort = new AbortController();
  private readonly overlay: TrackingOverlay;
  private readonly unsubscribe: (() => void)[];
  private fullscreenFrame?: HTMLElement;
  private state?: TrackingStatus;
  private lastSeen = -Infinity;
  private raf = 0;
  private lastTick = 0;
  private edgeSince = 0;
  private edgeDirection = 0;
  private held = false;
  private menuWasHit = false;
  private point?: { x: number; y: number };

  constructor(private readonly root: HTMLElement) {
    this.panel.className = 'hand-navigation';
    this.preview.className = 'hand-preview';
    this.caption.className = 'hand-caption';
    this.preview.append(cameraFeed.video);
    this.panel.append(this.preview, this.caption);
    this.overlay = new TrackingOverlay(cameraFeed.video);
    this.cursor.className = 'hand-cursor';
    this.cursor.hidden = true;
    this.cursor.setAttribute('aria-hidden', 'true');
    this.access.className = 'camera-required';
    this.access.setAttribute('role', 'dialog');
    this.access.setAttribute('aria-modal', 'true');
    this.heading.id = 'camera-required-title';
    this.access.setAttribute('aria-labelledby', this.heading.id);
    this.message.setAttribute('role', 'status');
    this.retry.type = 'button';
    const prompt = document.createElement('div');
    prompt.append(this.heading, this.instruction, this.message, this.retry);
    this.access.append(prompt);

    const signal = this.abort.signal;
    this.access.addEventListener('keydown', event => event.stopPropagation(), { signal });
    this.retry.addEventListener('click', () => {
      window.dispatchEvent(new Event('catspirits-hand-enable'));
      void cameraFeed.start();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else this.resume();
    }, { signal });
    window.addEventListener('pagehide', () => this.suspend(), { signal });
    window.addEventListener('pageshow', () => this.resume(), { signal });
    document.addEventListener('keydown', event => {
      if (!this.access.hidden) {
        if (this.access.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Tab' && !this.retry.hidden) this.retry.focus();
      } else if (event.key === 'Escape') {
        this.cancel();
        this.pointer.closePopup();
      }
    }, { signal, capture: true });
    this.unsubscribe = [
      cameraFeed.onStatus(status => {
        const lost = this.state?.state === 'tracking' && status.state !== 'tracking';
        this.state = status;
        if (status.state !== 'tracking') { this.cancel(); this.overlay.clear(); }
        this.renderStatus();
        if (lost) window.dispatchEvent(new Event('catspirits-camera-lost'));
      }),
      cameraFeed.onObservation(frame => this.overlay.pose(frame)),
      cameraFeed.onSword(frame => this.overlay.sword(frame)),
      cameraFeed.onOwnership(() => { this.cancel(); this.pointer.closePopup(); }),
      cameraFeed.setNavigator(frame => this.frame(frame)),
    ];
    this.refreshLanguage();
    this.resume();
  }

  private mount(container: Element): void { container.append(this.panel, this.cursor, this.access); }

  beforeRouteChange(): void {
    this.setFullscreenFrame();
  }

  setFullscreenFrame(frame?: HTMLElement): void {
    this.cancel();
    this.pointer.closePopup();
    this.fullscreenFrame = frame;
    this.mount(frame ?? document.body);
    this.renderStatus();
  }

  refreshLanguage(): void {
    this.mount(this.fullscreenFrame ?? document.body);
    this.panel.setAttribute('aria-label', t('Kamera előnézet'));
    this.heading.textContent = t('A CatSpiritshez kamera szükséges.');
    this.instruction.textContent = t('Engedélyezd a kamerát a böngészőben. A kézkurzor automatikusan elindul, a képed az eszközödön marad.');
    this.retry.textContent = t('Kamera újraindítása');
    this.renderStatus();
  }

  private renderStatus(): void {
    const state = this.state;
    if (!state) return;
    const live = state.state === 'tracking';
    const newlyBlocked = !live && this.access.hidden;
    const newlyReady = live && !this.access.hidden;
    this.root.inert = !live && !this.root.contains(this.access);
    this.access.hidden = live;
    this.retry.hidden = state.state === 'loading';
    this.caption.textContent = t(live ? 'Élő kamera' : 'Kamera');
    this.panel.dataset.live = String(live);
    if (!live) this.message.textContent = t(state.message);
    if (document.hidden || !this.access.isConnected) return;
    if (newlyReady && this.access.contains(document.activeElement)) {
      this.root.tabIndex = -1;
      this.root.focus({ preventScroll: true });
    } else if (newlyBlocked && !this.retry.hidden) {
      this.retry.focus();
    }
  }

  private resume(): void {
    if (!document.hidden && this.state?.state !== 'error') void cameraFeed.start();
  }

  private suspend(): void {
    // Preserve a denied permission until the player chooses to retry.
    if (this.state?.state !== 'error') cameraFeed.stop();
    this.cancel();
  }

  private frame(frame: PoseFrame): boolean {
    if (!cameraFeed.running) return false;
    const sample = this.gesture.update(frame, performance.now(), {
      width: innerWidth, height: innerHeight, allowDrag: this.pointer.canDrag,
    });
    if (!sample) { this.cancel(); return false; }
    const game = cameraFeed.gameOwnsInput;
    this.point = { x: sample.x * (innerWidth - 1), y: sample.y * (innerHeight - 1) };
    const { x, y } = this.point;
    const pressed = this.pointer.pressed;
    const hit = this.pointer.move(x, y, !game);
    this.cursor.classList.toggle('target', hit);
    if (this.held && !sample.held && sample.edge !== 'up') this.pointer.cancel();
    if (sample.edge === 'down' && (!game || (hit && this.menuWasHit))) this.pointer.down();
    if (sample.edge === 'up') this.pointer.up();
    // A click may synchronously start a camera game and transfer input.
    if (game !== cameraFeed.gameOwnsInput) return true;
    // Native play owns its aim. A pointer-driven game can also supply its own
    // marker without giving up hover or pinch events from the hand cursor.
    const menuOwnsInput = game && (hit || pressed);
    this.cursor.hidden = game ? !menuOwnsInput : this.pointer.usesGameCursor;
    if (!this.cursor.hidden) this.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
    this.held = sample.held;
    this.menuWasHit = hit;
    this.cursor.classList.toggle('pressed', sample.held && (!game || hit || pressed));
    this.lastSeen = performance.now();
    this.tick();
    return menuOwnsInput;
  }

  private tick(): void {
    if (this.raf || document.hidden) return;
    this.lastTick = performance.now();
    const run = (now: number) => {
      this.raf = 0;
      if (document.hidden || now - this.lastSeen > 400) { this.cancel(); return; }
      if (this.point && !this.held && !cameraFeed.gameOwnsInput) {
        const direction = this.point.y < 40 ? -1 : this.point.y > innerHeight - 40 ? 1 : 0;
        if (direction !== this.edgeDirection) { this.edgeDirection = direction; this.edgeSince = now; }
        if (direction && now - this.edgeSince > 650) {
          this.pointer.scroll(direction * Math.min(40, now - this.lastTick) * .45);
          this.pointer.move(this.point.x, this.point.y);
        }
      } else this.edgeDirection = 0;
      this.lastTick = now;
      this.raf = requestAnimationFrame(run);
    };
    this.raf = requestAnimationFrame(run);
  }

  private cancel(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pointer.leave();
    this.gesture.reset();
    this.held = this.menuWasHit = false;
    this.point = undefined;
    this.cursor.hidden = true;
    this.edgeDirection = 0;
  }

  dispose(): void {
    this.abort.abort();
    this.unsubscribe.forEach(release => release());
    this.suspend();
    this.overlay.dispose();
    this.pointer.dispose();
    this.panel.remove();
    this.access.remove();
    this.cursor.remove();
    this.root.inert = false;
  }
}
