// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HandNavigation } from './HandNavigation';
import { cameraFeed } from '../../core/tracking/CameraFeed';
import { RobotCamera } from '../../core/robot/RobotCamera';
import { handFixture } from '../../core/robot/handFixture';
import type { TrackingStatus } from '../../core/tracking/CameraPoseTracker';
import type { PoseFrame } from '../../core/tracking/types';
import { setLanguage } from '../../i18n';

const simulation = vi.hoisted(() => ({
  workers: [] as { onStatus: (status: TrackingStatus) => void; onFrame: (frame: PoseFrame) => void }[],
  open: vi.fn<() => Promise<TrackingStatus>>(), dispose: vi.fn(),
}));
vi.mock('../../core/tracking/CameraPoseTracker', () => ({ CameraPoseTracker: class {
  constructor(_video: HTMLVideoElement, private readonly callbacks: typeof simulation.workers[number]) {
    simulation.workers.push(callbacks);
  }
  setInputWidth() {}
  async start() { this.callbacks.onStatus(await simulation.open()); }
  dispose() { simulation.dispose(); }
} }));
vi.mock('../../core/tracking/hand.worker', () => ({ createHandWorker: vi.fn() }));

let root: HTMLElement;
let nav: HandNavigation;
let hit: Element | null;
const live: TrackingStatus = { state: 'tracking', message: 'ready' };
const denied: TrackingStatus = { state: 'error', message: 'Camera unavailable' };
const settle = async () => { await vi.dynamicImportSettled(); for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks();
  simulation.workers.length = 0;
  simulation.open.mockReset().mockResolvedValue(live);
  document.body.innerHTML = '<main id="jumper"><button id="route">Menu</button><div data-hand-playfield><button id="action">Action</button></div></main>';
  root = document.querySelector('main')!;
  hit = null;
  setLanguage('en');
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('PointerEvent', MouseEvent);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
});
afterEach(() => { nav?.dispose(); cameraFeed.stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setLanguage('hu'); });
const dialog = () => document.querySelector<HTMLElement>('.camera-required')!;
const cursor = () => document.querySelector<HTMLElement>('.hand-cursor')!;

it('starts automatically and gates every game until the shared camera becomes ready', async () => {
  let accept!: (status: TrackingStatus) => void;
  simulation.open.mockReturnValueOnce(new Promise(resolve => { accept = resolve; }));
  nav = new HandNavigation(root);
  await settle();
  expect(simulation.open).toHaveBeenCalledOnce();
  expect(root.inert).toBe(true);
  expect(dialog().hidden).toBe(false);
  expect(dialog().textContent).toContain('CatSpirits requires a camera');
  const video = document.querySelector('video');
  accept(live);
  await settle();
  expect(root.inert).toBe(false);
  expect(dialog().hidden).toBe(true);
  nav.beforeRouteChange();
  root.innerHTML = '<button>Another game</button>';
  setLanguage('hu');
  nav.refreshLanguage();
  expect(document.querySelectorAll('video')).toHaveLength(1);
  expect(document.querySelector('video')).toBe(video);
  expect(document.querySelector('.hand-caption')!.textContent).toBe('Élő kamera');
  expect(simulation.open).toHaveBeenCalledOnce();
});

it('offers only a camera retry after denial', async () => {
  simulation.open.mockResolvedValueOnce(denied);
  nav = new HandNavigation(root);
  await settle();
  expect(root.inert).toBe(true);
  expect(dialog().textContent).toContain('Camera unavailable');
  const game = new RobotCamera(vi.fn());
  expect(await game.start()).toBe(false);
  expect(simulation.open).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  await settle();
  expect(simulation.open).toHaveBeenCalledOnce();
  const retry = dialog().querySelector('button')!;
  expect(retry.hidden).toBe(false);
  retry.click(); await settle();
  expect(simulation.open).toHaveBeenCalledTimes(2);
  expect(root.inert).toBe(false);
  expect(game.running).toBe(true);
  game.stop();
});

it('releases capture in the background and reuses the same preview element on return', async () => {
  nav = new HandNavigation(root);
  await settle();
  const video = document.querySelector('video');
  window.dispatchEvent(new Event('pagehide'));
  expect(simulation.dispose).toHaveBeenCalledOnce();
  expect(root.inert).toBe(true);
  window.dispatchEvent(new Event('pageshow')); await settle();
  expect(root.inert).toBe(false);
  expect(document.querySelector('video')).toBe(video);
  expect(simulation.open).toHaveBeenCalledTimes(2);
});

it('moves the live camera, cursor and tracking lines into the expanded game and back', async () => {
  nav = new HandNavigation(root);
  await settle();
  const video = document.querySelector('video');
  const overlay = document.querySelector('.tracking-overlay');
  const frame = root.querySelector<HTMLElement>('[data-hand-playfield]')!;
  nav.setFullscreenFrame(frame);
  expect(frame.querySelector('video')).toBe(video);
  expect(frame.querySelector('.tracking-overlay')).toBe(overlay);
  expect(frame.querySelector('.hand-cursor')).toBe(cursor());
  nav.setFullscreenFrame();
  expect(frame.querySelector('video')).toBeNull();
  expect(document.querySelector('video')).toBe(video);
  expect(document.querySelectorAll('video')).toHaveLength(1);
  expect(simulation.open).toHaveBeenCalledOnce();
});

it('hands off the cursor to native play and reserves a pinch over menu controls for the menu', async () => {
  nav = new HandNavigation(root);
  await settle();
  const release = cameraFeed.claimInput();
  const native = vi.fn();
  const off = cameraFeed.onGameHands(native);
  const game = document.querySelector<HTMLButtonElement>('#action')!;
  const menu = document.querySelector<HTMLButtonElement>('#route')!;
  const gameClick = vi.fn(), menuClick = vi.fn();
  game.addEventListener('click', gameClick);
  menu.addEventListener('click', menuClick);
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const send = (closed: boolean) => { time += 65; simulation.workers[0].onFrame(handFixture(time, closed)); };
  try {
    hit = game;
    for (const closed of [false, false, false, false, true, true, false, false]) send(closed);
    expect(cursor().hidden).toBe(true);
    expect(gameClick).not.toHaveBeenCalled();
    expect(native).toHaveBeenLastCalledWith(expect.objectContaining({ timestampMs: time }));
    hit = menu;
    for (const closed of [false, false, false, false, true, true, false, false]) send(closed);
    expect(cursor().hidden).toBe(false);
    expect(menuClick).toHaveBeenCalledOnce();
    expect(native).toHaveBeenLastCalledWith(null);
    hit = game;
    send(false);
    expect(cursor().hidden).toBe(true);
    expect(native).toHaveBeenLastCalledWith(expect.objectContaining({ timestampMs: time }));
    release();
    send(false);
    expect(cursor().hidden).toBe(false);
    expect(simulation.open).toHaveBeenCalledOnce();
  } finally {
    release();
    off();
  }
});

it('blocks a camera loss with the same dialog and clears the live cursor', async () => {
  nav = new HandNavigation(root);
  await settle();
  simulation.workers[0].onFrame(handFixture(performance.now(), false));
  expect(cursor().hidden).toBe(false);
  simulation.workers[0].onStatus(denied);
  expect(cursor().hidden).toBe(true);
  expect(root.inert).toBe(true);
  expect(document.querySelectorAll('video')).toHaveLength(1);
});


it('sends hover and pinch to a pointer-driven playfield while using its own visible marker', async () => {
  nav = new HandNavigation(root);
  await settle();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-hand-game-cursor', '');
  root.append(canvas);
  const hover = vi.fn(), down = vi.fn(), up = vi.fn();
  canvas.addEventListener('pointermove', hover);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  hit = canvas;
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const send = (closed: boolean) => simulation.workers[0].onFrame(handFixture(time += 65, closed));
  for (const closed of [false, false, false, false, true, true, false, false]) send(closed);
  expect(cursor().hidden).toBe(true);
  expect(hover).toHaveBeenCalled();
  expect(down).toHaveBeenCalledOnce();
  expect(up).toHaveBeenCalledOnce();
  canvas.removeAttribute('data-hand-game-cursor');
  send(false);
  expect(cursor().hidden).toBe(false);
});
