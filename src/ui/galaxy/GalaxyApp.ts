import { Euler } from 'three';
import { ChipAudio } from '../../core/audio/ChipAudio';
import { AirPodsLink, type HeadMotion, type HeadState } from '../../core/galaxy/AirPodsLink';
import { Dive, starseed, stations, totalLarvae } from '../../core/galaxy/Dive';
import { CURRENT_GATE, GalaxyView } from '../../core/galaxy/GalaxyView';
import { HandGestures, TorsoLean, type HandSide } from '../../core/galaxy/gestures';
import { measurePalm, SpatialGrip } from '../../core/galaxy/SpatialHand';
import { RobotCamera } from '../../core/robot/RobotCamera';
import type { PoseFrame } from '../../core/tracking/types';
import { localizedHtml, t } from '../../i18n';
import { bindSoundToggle } from '../audio/soundToggle';
import { gameHeader } from '../shell/GameHeader';
import { gameElements } from '../shell/gameElements';
import './galaxy.css';

type Point = { x: number; y: number };
type Press = { side: HandSide; target?: HTMLButtonElement };
const TURNS = {
  left: { x: 35, y: 0 }, right: { x: -35, y: 0 },
  up: { x: 0, y: -28 }, down: { x: 0, y: 28 },
};
const KEYS = { ArrowLeft: TURNS.left, ArrowRight: TURNS.right, ArrowUp: TURNS.up, ArrowDown: TURNS.down };
const HEAD_LABELS: Record<HeadState, string> = {
  off: 'AirPods kikapcsolva', connecting: 'A helyi AirPods-segédre vár…', waiting: 'AirPods mozgásjelre vár…',
  denied: 'A fejkövetés engedélyre vár.', error: 'Az AirPods-követés megszakadt.', live: 'Fejkövetés aktív',
};

const markup = () => localizedHtml(`${gameHeader('galaxy')}
  <div class="galaxy-page">
    <div class="galaxy-frame" data-game-frame>
      <div class="galaxy-header">
        <div><h1>Galaxisfa</h1><p>Ússz végig az ágakon, és keresd meg a Csillagmagot. Egy ágon belül bármilyen sorrendben elkaphatod a fényhernyókat.</p></div>
        <div class="galaxy-score">
          <div><span>Fényhernyók</span><output data-galaxy-score>0 / ${totalLarvae}</output></div>
          <div class="galaxy-pips" aria-hidden="true">${'<i></i>'.repeat(totalLarvae)}</div>
        </div>
      </div>
      <div class="galaxy-input">
        <span data-galaxy-camera-status role="status"></span>
        <div class="galaxy-head" data-galaxy-head hidden>
          <button type="button" data-galaxy-airpods aria-pressed="false">AirPods</button>
          <span class="galaxy-head-meter" aria-hidden="true"><i></i></span>
          <button type="button" data-galaxy-calibrate disabled>Kalibrálás</button>
          <small data-galaxy-head-state role="status"></small>
        </div>
      </div>
      <section class="galaxy-stage" data-galaxy-stage data-hand-playfield tabindex="0" aria-label="A Galaxisfa térnézete">
        <div class="galaxy-world"></div>
        <div class="galaxy-depth" aria-hidden="true"></div>
        <div class="galaxy-brief">
          <div class="galaxy-location"><i aria-hidden="true"></i><span data-galaxy-location></span></div>
          <p data-galaxy-hint></p>
          <div class="galaxy-discovery" role="status">
            <strong data-galaxy-find></strong><span data-galaxy-note></span>
          </div>
        </div>

        <p class="galaxy-error" data-galaxy-error role="status" hidden>A Galaxisfához WebGL 2 szükséges.</p>
        <div class="galaxy-targets"></div>
        <div class="galaxy-view-controls" role="group" aria-label="A nézet irányítása">
          <button type="button" data-galaxy-turn="left" data-galaxy-pinch aria-label="Fordulj balra" title="Fordulj balra">←</button>
          <button type="button" data-galaxy-turn="up" data-galaxy-pinch aria-label="Nézz fel" title="Nézz fel">↑</button>
          <button type="button" data-galaxy-turn="down" data-galaxy-pinch aria-label="Nézz le" title="Nézz le">↓</button>
          <button type="button" data-galaxy-turn="right" data-galaxy-pinch aria-label="Fordulj jobbra" title="Fordulj jobbra">→</button>
          <button type="button" data-galaxy-zoom="out" data-galaxy-pinch aria-label="Távolítás" title="Távolítás">−</button>
          <button type="button" data-galaxy-zoom="in" data-galaxy-pinch aria-label="Nagyítás" title="Nagyítás">+</button>
          <button type="button" data-galaxy-center data-galaxy-pinch aria-label="Nézet visszaállítása" title="Nézet visszaállítása">⟲</button>
        </div>
        <div class="galaxy-branch-controls" role="group" aria-label="Ágak közti úszás">
          <button type="button" data-galaxy-back data-galaxy-pinch disabled aria-label="Ússz vissza" title="Ússz vissza">←</button>
          <button type="button" data-galaxy-swim data-galaxy-pinch disabled aria-label="Ússz tovább" title="Ússz tovább">→</button>
        </div>
        <div class="galaxy-dots" aria-hidden="true"><span data-galaxy-hand="Left" hidden></span><span data-galaxy-hand="Right" hidden></span></div>
        <div class="galaxy-finish" data-galaxy-finish hidden>
          <div class="galaxy-finish-gem" aria-hidden="true">✦</div>
          <h2 tabindex="-1">Megtaláltad a Csillagmagot!</h2>
          <p>Mind a ${totalLarvae} fényhernyót begyűjtötted.</p>
          <button type="button" class="galaxy-primary" data-galaxy-restart>Új merülés</button>
        </div>
      </section>
    </div>
    <aside class="galaxy-journal">
      <div class="galaxy-route">
        <h2>Merülési útvonal</h2>
        <ol>${stations.map(station => `<li style="--stop:${station.color}"><span aria-hidden="true"></span>${station.name}</li>`).join('')}</ol>
      </div>
      <details class="galaxy-help">
        <summary>Irányítás</summary>
        <p>Célozz és kattints vagy koppints. Húzással és a nyilakkal fordulsz. Tab és Enter billentyűvel elkaphatod a látható hernyókat.</p>
        <p>Kamerával csippents a hernyóra vagy egy nyílra, majd engedd el. Tartott csippentéssel fordulhatsz. Két csippentési pont széthúzásával közelítesz.</p>
      </details>
    </aside>
  </div>`);

export class GalaxyApp {
  private readonly abort = new AbortController();
  private readonly el: ReturnType<typeof gameElements>;
  private readonly game = new Dive();
  private readonly audio = new ChipAudio('galaxy');
  private readonly view?: GalaxyView;
  private readonly stage: HTMLElement;
  private readonly camera: RobotCamera;
  private readonly gestures = new HandGestures();
  private readonly torso = new TorsoLean();
  private readonly spatial = new SpatialGrip();
  private readonly rotation = new Euler(0, 0, 0, 'YXZ');
  private readonly pointers = new Map<number, Point>();
  private readonly handMarkers: Record<HandSide, HTMLElement>;
  private readonly airpods: AirPodsLink;
  private aimed = new Set<HTMLButtonElement>();
  private head?: HeadMotion;
  private press?: Press;
  private headEnabled = false;
  private poseTime = -Infinity;
  private trackingTime = -Infinity;
  private previous = 0;
  private raf = 0;
  private wasTravelling = false;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    root.classList.add('galaxy-root');
    root.innerHTML = markup();
    document.title = `${t('Galaxisfa')} · Catspirits`;
    this.el = gameElements(root);
    this.stage = this.el('[data-galaxy-stage]');
    this.handMarkers = { Left: this.el('[data-galaxy-hand="Left"]'), Right: this.el('[data-galaxy-hand="Right"]') };
    try {
      this.view = new GalaxyView(this.stage, this.el('.galaxy-world'), this.el('.galaxy-targets'), this.game, id => this.activate(id));
    } catch (error) {
      this.el('[data-galaxy-error]').hidden = false;
      console.warn('Galaxy Tree: WebGL initialization failed', error);
    }
    this.camera = new RobotCamera(frame => this.capture(frame));
    this.airpods = new AirPodsLink(state => this.headStatus(state), motion => {
      this.head = motion;
      const dot = this.el('.galaxy-head-meter i');
      dot.style.transform = `translate(${Math.round(Math.max(-1, Math.min(1, motion.yaw * 2.5)) * 6)}px,${Math.round(Math.max(-1, Math.min(1, motion.pitch * 2.5)) * -6)}px)`;
    });
    const localBridge = ['localhost', '127.0.0.1'].includes(location.hostname) && ['5173', '4173'].includes(location.port);
    this.el('[data-galaxy-head]').hidden = !localBridge;
    this.headStatus('off');
    this.bind();

    bindSoundToggle(root, this.audio, this.abort.signal);
    this.hud();
    this.startFrames();
    if (this.view) void this.camera.start();
  }

  private bind(): void {
    const signal = this.abort.signal;
    this.el('[data-galaxy-swim]').addEventListener('click', () => this.swim('forward'), { signal });
    this.el('[data-galaxy-back]').addEventListener('click', () => this.swim('back'), { signal });
    for (const button of this.stage.querySelectorAll<HTMLButtonElement>('[data-galaxy-turn]')) {
      const turn = TURNS[button.dataset.galaxyTurn as keyof typeof TURNS];
      button.addEventListener('click', () => this.view?.turn(turn.x, turn.y), { signal });
    }

    this.el('[data-galaxy-airpods]').addEventListener('click', () => {
      this.headEnabled = !this.headEnabled;
      if (this.headEnabled) this.airpods.start();
      else this.airpods.stop();
      this.el('[data-galaxy-airpods]').setAttribute('aria-pressed', String(this.headEnabled));
    }, { signal });
    this.el('[data-galaxy-calibrate]').addEventListener('click', () => this.airpods.calibrate(), { signal });
    this.el('[data-galaxy-center]').addEventListener('click', () => this.view?.center(), { signal });
    this.el('[data-galaxy-zoom="in"]').addEventListener('click', () => this.view?.zoom(1.21), { signal });
    this.el('[data-galaxy-zoom="out"]').addEventListener('click', () => this.view?.zoom(1 / 1.21), { signal });
    this.el('[data-galaxy-restart]').addEventListener('click', () => this.restart(), { signal });
    this.stage.addEventListener('keydown', event => {
      if (this.game.complete || this.view?.travelling || event.target !== this.stage) return;
      const step = KEYS[event.key as keyof typeof KEYS];
      if (step) this.view?.turn(step.x, step.y);
      else if (event.key === '+' || event.key === '=') this.view?.zoom(1.2);
      else if (event.key === '-') this.view?.zoom(1 / 1.2);
      else if (event.code === 'Space') this.swim('forward');
      else return;
      event.preventDefault();
    }, { signal });
    this.stage.addEventListener('wheel', event => {
      if (this.game.complete || this.view?.travelling) return;
      event.preventDefault();
      this.view?.zoom(Math.exp(-Math.max(-110, Math.min(110, event.deltaY)) * .0028));
    }, { signal, passive: false });
    this.stage.addEventListener('pointerdown', event => {
      if (!this.view || this.view.travelling || this.game.complete || event.button !== 0
        || (event.target instanceof Element && event.target.closest('button')) || !event.isTrusted) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.stage.setPointerCapture(event.pointerId);
      this.stage.focus({ preventScroll: true });
      this.resetHandPress();
    }, { signal });
    this.stage.addEventListener('pointermove', event => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous || !this.view) return;
      const next = { x: event.clientX, y: event.clientY };
      const other = [...this.pointers].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const before = Math.max(16, Math.hypot(other.x - previous.x, other.y - previous.y));
        const after = Math.max(16, Math.hypot(other.x - next.x, other.y - next.y));
        this.view.zoom(after / before);
      }
      const pan = other ? .5 : 1;
      this.view.turn((next.x - previous.x) * pan, (next.y - previous.y) * pan);
      this.pointers.set(event.pointerId, next);
    }, { signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.stage.addEventListener(event, sample => this.pointers.delete(sample.pointerId), { signal });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else this.startFrames();
    }, { signal });
    window.addEventListener('pagehide', () => this.suspend(), { signal });
    window.addEventListener('pageshow', () => this.startFrames(), { signal });
  }

  private startFrames(): void {
    if (!this.view || this.raf || this.disposed || document.hidden) return;
    this.raf = requestAnimationFrame(time => this.frame(time));
  }

  private frame(time: number): void {
    this.raf = 0;
    if (this.disposed || document.hidden || !this.view) return;
    const elapsed = time - this.previous;
    if (elapsed >= 15) {
      const dt = this.previous ? Math.min(.08, elapsed / 1000) : 1 / 60;
      this.previous = time;
      if (this.trackingTime > -Infinity && time - this.trackingTime > 350) this.clearTracking();
      this.view.draw(time, dt, this.pointers.size || this.game.complete ? undefined : this.head);
      if (this.wasTravelling !== this.view.travelling) {
        this.wasTravelling = this.view.travelling;
        this.hud();
      }
    }
    this.startFrames();
  }

  private activate(id: string): void {
    if (!this.view?.visible(id) || this.view.travelling || this.game.complete) return;
    if (id === CURRENT_GATE) { this.swim('forward'); return; }
    if (id === starseed.id) {
      if (!this.game.findSeed(true)) return;
      this.audio.stop();
      void this.audio.unlock().then(() => this.audio.cue('finish'));
      this.camera.stop();
      this.stopHead();
      this.el('[data-galaxy-finish]').hidden = false;
      this.el('.galaxy-finish h2').focus({ preventScroll: true });
    } else {
      const larva = this.game.catch(id);
      if (!larva) return;
      this.el('[data-galaxy-find]').textContent = t(larva.name);
      this.el('[data-galaxy-note]').textContent = t(larva.note);
      void this.audio.unlock().then(() => this.audio.cue('pick'));
      this.audio.play(this.game.stage);
      if (this.stage.contains(document.activeElement)) this.stage.focus({ preventScroll: true });
    }
    this.hud();
  }

  private swim(direction: 'forward' | 'back'): void {
    if (!this.view || this.view.travelling) return;
    if (!(direction === 'forward' ? this.game.swim() : this.game.back())) return;
    this.view.enter(true);
    this.wasTravelling = this.view.travelling;
    this.resetHandPress();
    this.el('[data-galaxy-find]').textContent = '';
    this.el('[data-galaxy-note]').textContent = '';
    void this.audio.unlock().then(() => this.audio.cue('clear'));
    this.audio.play(this.game.stage);
    this.stage.focus({ preventScroll: true });
    this.hud();
  }

  private restart(): void {
    this.game.reset();
    if (this.view) void this.camera.start();
    this.view?.enter(false);
    this.el('[data-galaxy-finish]').hidden = true;
    this.el('[data-galaxy-find]').textContent = '';
    this.el('[data-galaxy-note]').textContent = '';
    this.stage.focus({ preventScroll: true });
    this.hud();
  }

  private hud(): void {
    const { stage, count, station, canSwim, canSwimBack, complete } = this.game;
    this.stage.style.setProperty('--current', station.color);
    this.el('[data-galaxy-location]').textContent = t(station.name);
    this.el('[data-galaxy-score]').textContent = `${count} / ${totalLarvae}`;
    this.root.querySelectorAll('.galaxy-pips i').forEach((pip, index) => pip.classList.toggle('filled', index < count));
    this.root.querySelectorAll('.galaxy-route li').forEach((stop, index) => {
      stop.classList.toggle('visited', complete || (index !== stage && stations[index].larvae.length > 0 &&
        stations[index].larvae.every(larva => this.game.collected(larva.id))));
      if (index === stage) stop.setAttribute('aria-current', 'step');
      else stop.removeAttribute('aria-current');
    });
    this.el('[data-galaxy-hint]').textContent = t(complete ? 'Merülés teljesítve.' : this.view?.travelling
      ? 'Sodródás a következő ág felé…' : canSwim ? 'Megnyílt az út. Kövesd a világító áramlatot!' : station.hint);
    const steering = !!this.view && !this.view.travelling && !complete;
    this.el<HTMLButtonElement>('[data-galaxy-swim]').disabled = !steering || !canSwim;
    this.el<HTMLButtonElement>('[data-galaxy-back]').disabled = !steering || !canSwimBack;

    for (const button of this.stage.querySelectorAll<HTMLButtonElement>('.galaxy-view-controls button')) button.disabled = !steering;
  }

  private cameraStatus(message: string): void {
    const status = this.el('[data-galaxy-camera-status]');
    const copy = t(message);
    if (status.textContent !== copy) status.textContent = copy;
  }

  private capture(frame: PoseFrame | null): void {
    if (!frame || !this.view) {
      this.clearTracking();

      return;
    }
    const time = frame.timestampMs;
    const armTime = frame.armTimestampMs ?? -Infinity;
    const pose = Math.abs(time - armTime) <= 180 ? frame.armLandmarks ?? [] : [];
    const aspect = frame.imageAspectRatio ?? 4 / 3;
    const screen = { width: this.stage.clientWidth, height: this.stage.clientHeight };
    const { left, top } = this.stage.getBoundingClientRect();
    const hitAt = (aim: Point): HTMLButtonElement | undefined => {
      const x = aim.x * screen.width, y = aim.y * screen.height;
      const hit = document.elementFromPoint(left + this.stage.clientLeft + x, top + this.stage.clientTop + y);
      if (!hit || !this.stage.contains(hit)) return;
      const control = hit.closest<HTMLButtonElement>('button[data-galaxy-pinch]');
      if (control) return control.disabled ? undefined : control;
      return this.view?.pick(x, y, 9);
    };
    const output = this.gestures.update(frame.hands ?? [], time, aspect, screen, pose);
    this.trackingTime = performance.now();
    if (armTime > this.poseTime || !pose.length) {
      this.poseTime = armTime;
      this.view.setBody(this.torso.update(pose, time).yaw);
    }

    const [first, second] = output.hands;
    const together = second && Math.hypot((first.projectedContact.x - second.projectedContact.x) * screen.width,
      (first.projectedContact.y - second.projectedContact.y) * screen.height) < 13;
    const aimed = new Set<HTMLButtonElement>();
    for (const side of ['Left', 'Right'] as const) {
      const cursor = this.handMarkers[side];
      const hand = output.hands.find(item => item.side === side);
      cursor.hidden = !hand;
      if (!hand) continue;
      const moving = this.press?.side === side && this.spatial.moved;
      const aim = second ? hand.projectedContact : moving ? hand.freeAim : hand.cursor;
      if (!output.grab && !output.cancel) {
        const heldTarget = this.press?.side === side && !moving ? this.press.target : undefined;
        const target = heldTarget ?? hitAt(moving ? aim : hand.cursor);
        if (target) aimed.add(target);
      }
      cursor.style.transform = `translate(${(aim.x * screen.width).toFixed(1)}px,${(aim.y * screen.height).toFixed(1)}px) translate(-50%,-50%)`;
      cursor.classList.toggle('pinched', hand.pinched);
      cursor.classList.toggle('together', !!together);
    }
    this.highlight(aimed);
    this.cameraStatus(output.grab ? 'Kétkezes nagyítás' : output.hands.length
      ? 'Csippents egy célpontra vagy nyílra.' : 'Mutasd a nyitott kezed a kamerának.');

    if (this.view.travelling || this.pointers.size || this.game.complete) { this.resetHandPress(); return; }
    if (output.grab) {
      this.resetHandPress();
      this.view.turn(output.grab.dx, output.grab.dy);
      this.view.zoom(output.grab.zoom);
      return;
    }
    if (output.cancel) { this.resetHandPress(); return; }
    const owner = output.hands.find(hand => hand.side === this.press?.side);
    if (!owner && this.press) this.resetHandPress();
    const hand = owner ?? output.hands.find(item => item.cursor.edge === 'down');
    if (!hand) return;
    const cursor = hand.cursor;
    if (cursor.edge === 'down') {
      const target = hitAt(cursor);
      this.press = { side: hand.side, target };
      this.spatial.reset();
    }
    if (cursor.edge === 'up') {
      const target = this.press?.target;
      const click = !cursor.dragging && !this.spatial.moved;
      this.resetHandPress();
      if (click && target?.isConnected && !target.disabled) target.click();
      return;
    }
    const target = this.press?.target;
    const canSteer = !target || (target.dataset.galaxyTarget && target.dataset.galaxyTarget !== CURRENT_GATE);
    if (cursor.held && this.press && canSteer) {
      const step = this.spatial.update(measurePalm(hand, aspect, screen), time);
      if (!step) return;
      this.view.turn(step.dx, step.dy);
      this.view.zoom(step.zoom);
      if (step.turn) {
        this.rotation.setFromQuaternion(step.turn);
        this.view.tilt(this.rotation.y * .71, this.rotation.x * .61, this.rotation.z * .8);
      }
    }
  }

  private highlight(aimed: Set<HTMLButtonElement>): void {
    for (const button of this.aimed) if (!aimed.has(button)) button.classList.remove('is-aimed');
    for (const button of aimed) button.classList.add('is-aimed');
    this.aimed = aimed;
  }

  private resetHandPress(): void {
    this.press = undefined;
    this.spatial.reset();
  }

  private clearTracking(): void {
    this.trackingTime = -Infinity;
    this.poseTime = -Infinity;
    this.gestures.reset();
    this.torso.reset();
    this.resetHandPress();
    this.view?.setBody(0);
    this.highlight(new Set());
    for (const marker of Object.values(this.handMarkers)) marker.hidden = true;
  }

  private headStatus(state: HeadState): void {
    this.el('[data-galaxy-head-state]').textContent = t(HEAD_LABELS[state]);
    this.el('.galaxy-head-meter').classList.toggle('live', state === 'live');
    this.el<HTMLButtonElement>('[data-galaxy-calibrate]').disabled = state !== 'live';
  }

  private stopHead(): void {
    this.headEnabled = false;
    this.airpods.stop();
    this.el('[data-galaxy-airpods]').setAttribute('aria-pressed', 'false');
  }

  private suspend(): void {
    cancelAnimationFrame(this.raf);
    this.raf = this.previous = 0;
    this.pointers.clear();
    this.stopHead();
    this.audio.sleep();
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    this.suspend();
    this.camera.stop();
    this.audio.dispose();
    this.view?.dispose();
  }
}
