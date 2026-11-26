// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FestivalGame, FestivalInput } from '../../core/festival/types';
import type { SwordFrame } from '../../core/tracking/sword/types';
import { setLanguage } from '../../i18n';
import { FestivalApp } from './FestivalApp';

const { createGame, wand, hand, roverView } = vi.hoisted(() => ({
  createGame: vi.fn(() => ({
    score: 0, won: false, lost: false, hull: 3, gates: 0,
    draw: vi.fn(), update: vi.fn<FestivalGame['update']>(() => null),
  })),
  roverView: { open: vi.fn(), draw: vi.fn(), dispose: vi.fn() },
  wand: {
    start: vi.fn<() => Promise<boolean>>(), stop: vi.fn(), running: true,
    emit: undefined as ((frame: SwordFrame | null) => void) | undefined,
  },
  hand: { start: vi.fn<() => Promise<boolean>>(), stop: vi.fn() },
}));
vi.mock('../../core/festival/missions', () => ({ createMission: createGame }));
vi.mock(import('../../core/festival/workshop'), async importOriginal => ({
  ...await importOriginal(), createWorkshop: createGame,
}));
vi.mock('./RoverView3D', () => ({
  RoverView3D: class {
    constructor(canvas: HTMLCanvasElement) { roverView.open(canvas); }
    draw = roverView.draw;
    dispose = roverView.dispose;
  },
}));
vi.mock('../../core/blade/BladeCamera', () => ({
  BladeCamera: class {
    constructor(emit: (frame: SwordFrame | null) => void) { wand.emit = emit; }
    start = wand.start;
    stop = wand.stop;
    get running() { return wand.running; }
  },
}));
vi.mock('../../core/robot/RobotCamera', () => ({
  RobotCamera: class { running = true; start = hand.start; stop = hand.stop; },
}));

let root: HTMLElement;
let app: FestivalApp | undefined;
let clock: number;
let callbacks: Map<number, FrameRequestCallback>;
function mount(mission?: string) {
  history.replaceState(null, '', '?game=arcade&lang=en' + (mission ? '&mission=' + mission : ''));
  app = new FestivalApp(root);
}
const el = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const start = () => el('[data-start]').click();
const mode = (value: string) => el<HTMLInputElement>(`[name=arc-mode][value=${value}]`).click();
const currentGame = (): ReturnType<typeof createGame> => createGame.mock.results[createGame.mock.results.length - 1].value!;
function advance(frames: number, beforeFrame?: () => void) {
  for (let i = 0; i < frames; i++) {
    clock += 50;
    beforeFrame?.();
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const render of pending) render(clock);
  }
}
function wandSample() {
  wand.emit?.({ timestampMs: clock, base: { x: .7, y: .4 }, tip: { x: .25, y: .4 },
    confidence: 1, imageAspectRatio: 4 / 3, source: 'four-ring-2d' });
}
function pendingWand() {
  let resolve!: (ready: boolean) => void;
  wand.start.mockReturnValueOnce(new Promise<boolean>(done => { resolve = done; }));
  return resolve;
}

beforeEach(() => {
  vi.clearAllMocks();
  wand.start.mockReset().mockResolvedValue(true); hand.start.mockReset().mockResolvedValue(true);
  wand.emit = undefined; wand.running = true;
  localStorage.clear(); setLanguage('en'); clock = 100; callbacks = new Map();
  root = document.createElement('div'); document.body.replaceChildren(root);
  let nextFrame = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (render: FrameRequestCallback) => { callbacks.set(++nextFrame, render); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext']);
});
afterEach(() => {
  app?.dispose(); app = undefined;
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('festival gallery and camera lifecycle', () => {
  it('offers six mission links and keeps the untouched gallery idle', () => {
    mount();
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.arc-card[href]')];
    expect(links.map(link => new URL(link.href).searchParams.get('mission')).sort())
      .toEqual(['build', 'ferry', 'herd', 'jungle', 'paint', 'rover']);
    expect(links.every(link => new URL(link.href).searchParams.get('lang') === 'en')).toBe(true);
    expect(callbacks.size).toBe(0);
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });

  it('plays the booth demo by request, links the active clip, and cycles clips without writing scores', () => {
    setLanguage('de'); mount();
    const play = el<HTMLAnchorElement>('[data-demo-play]');
    const selected = () => new URL(play.href).searchParams;
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const open = el('[data-demo-open]'), close = el('[data-demo-close]');
    expect(el('[data-demo]').hidden).toBe(true);
    open.click();
    expect(el('[data-demo]').hidden).toBe(false); expect(document.activeElement).toBe(play);
    expect(selected().get('lang')).toBe('de'); expect(selected().get('mission')).toBe('jungle');
    expect(el('[data-demo-count]').textContent).toBe('1 / 6');
    el('[data-demo-next]').click();
    expect(selected().get('mission')).toBe('ferry'); expect(el('[data-demo-count]').textContent).toBe('2 / 6');
    const clip = currentGame();
    advance(20); expect(clip.update).toHaveBeenCalled(); expect(selected().get('mission')).toBe('ferry');
    advance(225);
    expect(el('[data-demo-count]').textContent).toBe('3 / 6');
    const third = el<HTMLAnchorElement>('.arc-card:nth-child(3)');
    expect(play.href).toBe(third.href);
    close.click();
    expect(el('[data-demo]').hidden).toBe(true); expect(el('.arc-grid').hidden).toBe(false);
    expect(callbacks.size).toBe(0); expect(document.activeElement).toBe(open);
    expect(storage.mock.calls.some(([key]) => key.startsWith('catspirits.arcade.'))).toBe(false);
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });

  it('stops the reel when hidden and removes its listeners and animation on disposal', () => {
    mount();
    const open = el('[data-demo-open]');
    open.click(); advance(4);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(el('[data-demo]').hidden).toBe(true); expect(callbacks.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange')); expect(callbacks.size).toBe(0);
    open.click(); expect(callbacks.size).toBe(1);
    app!.dispose(); app = undefined;
    expect(el('[data-demo]').hidden).toBe(true); expect(callbacks.size).toBe(0);
    open.click(); expect(callbacks.size).toBe(0);
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });

  it('retries a rejected wand start only on request and freezes the clock when tracking goes stale', async () => {
    mount('jungle');
    wand.start.mockRejectedValueOnce(new DOMException('Camera permission denied', 'NotAllowedError'));
    expect(wand.start).not.toHaveBeenCalled();
    start(); await Promise.resolve();
    expect(el('[data-result]').textContent).toBeTruthy(); expect(root.querySelector('video')).toBeNull();
    expect(wand.stop).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0);
    start(); await Promise.resolve();
    advance(60);
    const game = currentGame();
    expect(game.update).not.toHaveBeenCalled(); expect(el('[data-time]').textContent).toBe('75');
    advance(75, wandSample);
    expect(game.update).toHaveBeenCalled();
    expect(game.update.mock.calls[0][1]).toMatchObject({ x: .75, y: .4, action: false });
    advance(8);
    const updates = game.update.mock.calls.length;
    const time = el('[data-time]').textContent;
    advance(40);
    expect(game.update.mock.calls).toHaveLength(updates); expect(el('[data-time]').textContent).toBe(time);
    advance(3, wandSample); expect(game.update.mock.calls.length).toBeGreaterThan(updates);
    wand.running = false; advance(1);
    expect(el('[data-result]').textContent).toContain('camera stopped'); expect(callbacks.size).toBe(0);
    expect(root.querySelector('video')).toBeNull();
  });

  it('ignores an old camera promise and its late frames after switching input during startup', async () => {
    mount('herd');
    const resolve = pendingWand();
    start(); start();
    expect(wand.start).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0);
    const oldFrame = wand.emit;
    mode('hand');
    expect(wand.stop).toHaveBeenCalledOnce(); expect(hand.start).not.toHaveBeenCalled();
    start(); await Promise.resolve();
    expect(hand.start).toHaveBeenCalledOnce();
    resolve(true); await Promise.resolve();
    expect(callbacks.size).toBe(1);
    advance(50, () => oldFrame?.({ timestampMs: clock, base: { x: .3, y: .4 }, tip: { x: .6, y: .7 },
      confidence: 1, imageAspectRatio: 1, source: 'four-ring-2d' }));
    expect(currentGame().update).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pagehide'));
    expect(hand.stop).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0);
    window.dispatchEvent(new Event('pageshow')); expect(hand.start).toHaveBeenCalledOnce();
  });

  it('disposes while waiting for permission and ignores later input on the abandoned screen', async () => {
    mount('build');
    const resolve = pendingWand();
    start(); app!.dispose(); app = undefined;
    resolve(true); await Promise.resolve();
    expect(wand.stop).toHaveBeenCalledOnce(); expect(callbacks.size).toBe(0);
    el('[data-start]').click(); expect(wand.start).toHaveBeenCalledOnce();
  });
});

describe('festival practice round', () => {
  it('keeps a 75-second booth round on clock time even on a 10 Hz display', () => {
    mount('ferry');
    mode('touch');
    start();
    const game = currentGame();
    for (let i = 0; i <= 770; i++) {
      clock += 100;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const render of pending) render(clock);
    }
    expect(el('[data-time]').textContent).toBe('0');
    expect(el('[data-start]').textContent).toBe('Play again');
    expect(callbacks.size).toBe(0);
    expect(game.update.mock.calls.every(([dt]) => dt <= .06)).toBe(true);
  });

  it('maps scaled canvas coordinates, consumes each action once, and resumes the same round', () => {
    mount('ferry'); mode('touch'); start(); advance(45);
    const game = currentGame(), board = el<HTMLCanvasElement>('[data-board]');
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 30, width: 400, height: 280 } as DOMRect);
    const send = (name: string) => board.dispatchEvent(new MouseEvent(name, { bubbles: true, button: 0, clientX: 350, clientY: 100 }));
    send('pointerdown'); send('pointermove'); advance(2);
    const inputs = game.update.mock.calls.slice(-2).map(call => call[1]);
    expect(inputs[0]).toMatchObject({ x: .75, y: .25, action: true });
    expect(inputs[0].angle).toBeGreaterThan(0);
    expect(inputs[1].action).toBe(false);
    const key = (code: string, key: string) => board.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    key('ArrowLeft', 'ArrowLeft'); key('Space', ' '); advance(1);
    const moved: FestivalInput = game.update.mock.calls[game.update.mock.calls.length - 1][1];
    expect(moved.x).toBeLessThan(.75); expect(moved.action).toBe(true);
    const time = Number(el('[data-time]').textContent);
    key('Escape', 'Escape'); advance(15);
    expect(callbacks.size).toBe(0); expect(Number(el('[data-time]').textContent)).toBe(time);
    start(); advance(65);
    expect(currentGame()).toBe(game); expect(Number(el('[data-time]').textContent)).toBeLessThan(time);
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });

  it('switches rover views without restarting and keeps playing after loss of WebGL', async () => {
    mount('rover'); mode('touch'); start(); advance(70);
    const game = currentGame(), board = el<HTMLCanvasElement>('[data-board]');
    const toggle = el('[data-rover-view]');
    expect(roverView.open).not.toHaveBeenCalled();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    const before = Number(el('[data-time]').textContent);
    toggle.click(); await vi.dynamicImportSettled(); advance(24);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const gl = el<HTMLCanvasElement>('[data-rover-canvas]');
    expect(roverView.open).toHaveBeenCalledWith(gl);
    expect(roverView.draw).toHaveBeenCalledWith(game);
    const active = Number(el('[data-time]').textContent);
    expect(active).toBeLessThan(before);
    gl.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(roverView.dispose).toHaveBeenCalledOnce();

    const draws = roverView.draw.mock.calls.length;
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 20, width: 400, height: 300 } as DOMRect);
    board.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 245 }));
    advance(24);
    expect(currentGame()).toBe(game);
    expect(Number(el('[data-time]').textContent)).toBeLessThan(active);
    expect(game.update.mock.calls[game.update.mock.calls.length - 1][1]).toMatchObject({ x: .25, y: .75 });
    expect(roverView.draw.mock.calls).toHaveLength(draws);
    expect(callbacks.size).toBe(1);
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });

  it('persists the highest score for the current input and resets the next run', () => {
    mount('paint'); mode('touch'); start();
    const win = (points: number) => {
      const game = currentGame();
      game.update.mockImplementationOnce(() => { game.score = points; game.won = true; return 'correct'; });
      advance(50);
      expect(callbacks.size).toBe(0);
      expect(el('[data-score]').textContent).toBe(String(points));
      expect(el('[data-start]').textContent).toBe('Play again');
    };
    win(36); expect(el('[data-best]').textContent).toBe('36');
    start(); expect(el('[data-score]').textContent).toBe('0'); win(12);
    expect(el('[data-best]').textContent).toBe('36');
    mode('wand'); expect(el('[data-best]').textContent).toBe('0');
    mode('touch'); expect(el('[data-best]').textContent).toBe('36');
    expect(localStorage.getItem('catspirits.arcade.paint.touch.v1')).toBe('36');
    expect(wand.start).not.toHaveBeenCalled(); expect(hand.start).not.toHaveBeenCalled();
  });
});
