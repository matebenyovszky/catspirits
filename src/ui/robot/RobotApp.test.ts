// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RobotApp } from './RobotApp';
import { setLanguage } from '../../i18n';
import type { HandFrame } from '../../core/pop/HandInput';
const mock = vi.hoisted(() => ({ start: vi.fn(async () => false), stop: vi.fn(), running: false, viewError: false, emit: null as ((f: HandFrame | null) => void) | null }));
vi.mock('../../core/pop/PopCamera', () => ({ PopCamera: class {
  constructor(_video: unknown, callback: (f: HandFrame | null) => void) { mock.emit = callback; }
  get running() { return mock.running; } start = mock.start;
  stop() { mock.running = false; mock.emit?.(null); mock.stop(); }
} }));
vi.mock('./RobotView3D', () => ({ RobotView3D: class { constructor() { if (mock.viewError) throw new Error('No WebGL'); } resize() {} draw() {} dispose() {} screenToWorld(x: number, y: number) { return { x, y }; } } }));
vi.mock('./RobotView', () => ({ RobotView: class { resize() {} draw() {} } }));
let root: HTMLElement, app: RobotApp, clock: number, sequence: number, callbacks: Map<number, FrameRequestCallback>;
const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();
const advance = (count: number) => { for (let i = 0; i < count; i++) { clock += 20; const entry = callbacks.entries().next().value; if (!entry) continue; callbacks.delete(entry[0]); entry[1](clock); } };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  setLanguage('en'); history.replaceState(null, '', '/?game=robot'); mock.start.mockReset(); mock.start.mockResolvedValue(false); mock.stop.mockClear(); mock.running = false; mock.viewError = false;
  clock = sequence = 0; callbacks = new Map(); vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  root = document.createElement('main'); document.body.replaceChildren(root); app = new RobotApp(root);
});
afterEach(() => { app.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('offers all four games without camera or background rendering on arrival', () => {
  expect(root.querySelectorAll('nav a')).toHaveLength(4); expect(root.textContent).toContain('Rule-based autopilot, not a trained AI');
  expect(mock.start).not.toHaveBeenCalled(); expect(callbacks.size).toBe(0); expect(root.dataset.phase).toBe('ready');
});
it('runs a complete autonomous mission, releases resources and starts the detour', () => {
  click('[data-pointer]'); click('[data-auto]'); advance(3000);
  expect(root.dataset.phase).toBe('complete'); expect(root.querySelector('[data-count]')!.textContent).toBe('3');
  expect(callbacks.size).toBe(0); expect(root.textContent).toContain('The station is back online!');
  click('[data-next]'); expect(root.dataset.phase).toBe('playing'); expect(root.querySelector<HTMLSelectElement>('#robot-level')!.value).toBe('2');
  click('[data-auto]'); advance(600); expect(root.classList.contains('robot-blocked')).toBe(true);
  click('[data-manual]'); expect(root.dataset.control).toBe('manual'); expect(root.querySelector('[data-interventions]')!.textContent).toBe('1');
});
it('pauses on backgrounding without auto-resuming, and keeps progress on explicit resume', () => {
  click('[data-pointer]'); click('[data-auto]'); advance(400); const count = root.querySelector('[data-count]')!.textContent;
  window.dispatchEvent(new Event('pagehide')); expect(root.dataset.phase).toBe('paused'); expect(callbacks.size).toBe(0);
  window.dispatchEvent(new Event('pageshow')); expect(callbacks.size).toBe(0);
  click('[data-resume]'); expect(root.dataset.phase).toBe('playing'); expect(root.querySelector('[data-count]')!.textContent).toBe(count);
});
it('cancels a late camera start after switching to pointer and offers fallback on error', async () => {
  let finish!: (ready: boolean) => void; mock.start.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  click('[data-camera]'); expect(root.dataset.phase).toBe('loading'); click('[data-pointer]'); finish(true); await settle();
  expect(root.dataset.phase).toBe('playing'); expect(root.querySelector<HTMLVideoElement>('video')!.hidden).toBe(true);
  click('[data-camera]'); await settle(); expect(root.dataset.phase).toBe('paused'); expect(callbacks.size).toBe(0);
  expect(root.textContent).toContain('The camera could not start'); click('[data-pointer]'); expect(root.dataset.phase).toBe('playing');
});
it('waits for a fresh camera wrist and stops the stream on pause', async () => {
  mock.start.mockImplementationOnce(async () => { mock.running = true; return true; }); click('[data-camera]'); await settle();
  advance(100); expect(root.querySelector('[data-clock]')!.textContent).toBe('00:00');
  for (let i = 0; i < 75; i++) { mock.emit!({ timestampMs: clock, imageAspectRatio: 4 / 3, hands: [{ id: 'right', x: .5, y: .5 }] }); advance(1); }
  expect(root.querySelector('[data-clock]')!.textContent).toBe('00:01');
  mock.emit!(null); advance(100); expect(root.querySelector('[data-clock]')!.textContent).toBe('00:01');
  click('[data-pause]'); expect(mock.running).toBe(false); expect(callbacks.size).toBe(0);
});
it('renders Hungarian and German mission controls', () => {
  for (const [language, text] of [['hu', 'Én vezetem'], ['de', 'Ich steuere']] as const) {
    app.dispose(); setLanguage(language); app = new RobotApp(root); expect(root.textContent).toContain(text);
  }
});

it('keeps camera control for the next mission and shows a completed status', async () => {
  mock.start.mockImplementation(async () => { mock.running = true; return true; });
  click('[data-camera]'); await settle(); click('[data-auto]'); advance(3000);
  expect(root.dataset.phase).toBe('complete'); expect(root.querySelector('[data-control-status]')!.textContent).toBe('All three cells are docked!');
  expect(mock.running).toBe(false); click('[data-next]'); await settle();
  expect(mock.start).toHaveBeenCalledTimes(2); expect(root.dataset.phase).toBe('playing');
  expect(root.querySelector<HTMLVideoElement>('video')!.hidden).toBe(false);
});

it('switches 2D/3D without resetting progress or camera ownership', async () => {
  click('[data-pointer]'); click('[data-auto]'); advance(400);
  const count = root.querySelector('[data-count]')!.textContent;
  click('[data-view="3d"]'); await vi.dynamicImportSettled();
  expect(root.querySelector('[data-view="3d"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-count]')!.textContent).toBe(count); expect(root.dataset.control).toBe('auto');
  expect(root.querySelector<HTMLCanvasElement>('canvas')!.hidden).toBe(true);
  click('[data-view="2d"]'); expect(root.querySelector<HTMLCanvasElement>('canvas')!.hidden).toBe(false);
  expect(root.querySelector('[data-count]')!.textContent).toBe(count); expect(mock.start).not.toHaveBeenCalled();
});

it('keeps the working 2D game when WebGL initialization fails', async () => {
  mock.viewError = true; click('[data-pointer]'); click('[data-view="3d"]'); await vi.dynamicImportSettled();
  expect(root.dataset.phase).toBe('playing'); expect(root.querySelector('[data-view="2d"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector<HTMLCanvasElement>('canvas')!.hidden).toBe(false); expect(root.querySelectorAll('canvas')).toHaveLength(1);
  expect(root.textContent).toContain('3D acceleration is unavailable.');
});
