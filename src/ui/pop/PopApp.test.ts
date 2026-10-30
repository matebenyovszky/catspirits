// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopApp } from './PopApp';
import { setLanguage } from '../../i18n';
import type { HandFrame } from '../../core/pop/HandInput';
const mock = vi.hoisted(() => ({ start: vi.fn(async () => false), stop: vi.fn(), running: false, emit: null as ((f: HandFrame|null) => void)|null }));
vi.mock('../../core/pop/PopCamera', () => ({ PopCamera: class {
  constructor(_v: unknown, emit: (f: HandFrame|null) => void) { mock.emit = emit; }
  get running() { return mock.running; } loading = false; start = mock.start; stop() { mock.running = false; mock.emit?.(null); mock.stop(); }
} }));
vi.mock('./PopView', () => ({ PopView: class { resize() {} draw() {} } }));
let app: PopApp, root: HTMLElement, callbacks: Map<number, FrameRequestCallback>, clock: number, sequence: number;
beforeEach(() => {
  localStorage.clear(); setLanguage('en'); mock.start.mockReset(); mock.start.mockResolvedValue(false); mock.stop.mockClear(); mock.running = false;
  callbacks = new Map(); sequence = clock = 0; vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  root = document.createElement('div'); document.body.replaceChildren(root); app = new PopApp(root);
});
afterEach(() => { app.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const click = (selector: string) => (root.querySelector(selector) as HTMLElement).click();
function advance(from: number, count: number) { for (let i = 0; i < count; i++) { const entry = callbacks.entries().next().value; if (!entry) break; callbacks.delete(entry[0]); clock = from+i*20; entry[1](clock); } }
it('offers hands, wand and touch with no camera or render loop on the menu', () => {
  expect(root.textContent).toContain('Camera · hands'); expect(root.textContent).toContain('Camera · marker wand');
  expect(mock.start).not.toHaveBeenCalled(); expect(callbacks.size).toBe(0);
  expect(root.querySelector('a[href="?game=blade&lang=en"]')).not.toBeNull();
});
it('limits level 2 to hands and restores all controls for level 1', () => {
  const two = root.querySelector<HTMLInputElement>('input[name=level][value="2"]')!;
  two.checked = true; two.dispatchEvent(new Event('change', { bubbles: true }));
  expect(root.querySelector<HTMLButtonElement>('[data-sword]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLButtonElement>('[data-touch]')!.disabled).toBe(true);
  expect(root.querySelector<HTMLElement>('[data-level-note]')!.hidden).toBe(false);
  const one = root.querySelector<HTMLInputElement>('input[name=level][value="1"]')!;
  one.checked = true; one.dispatchEvent(new Event('change', { bubbles: true }));
  expect(root.querySelector<HTMLButtonElement>('[data-sword]')!.disabled).toBe(false);
  expect(root.querySelector<HTMLButtonElement>('[data-touch]')!.disabled).toBe(false);
});
it('scores a direct touch once, stops on pause, finishes in 45 seconds and replays', () => {
  click('[data-touch]'); advance(20, 20);
  const canvas = root.querySelector('canvas')!; vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
  const tap = () => canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 72, clientY: 66 }));
  tap(); tap(); advance(420, 8); expect(root.querySelector('[data-score]')!.textContent).toBe('10');
  click('[data-pause]'); expect(callbacks.size).toBe(0); click('[data-begin]'); advance(1000, 2300);
  expect(root.querySelector('[data-time]')!.textContent).toBe('00'); expect(callbacks.size).toBe(0); expect(root.textContent).toContain('Nice aim!');
  expect(JSON.parse(localStorage.getItem('catspirits.neon-pop.best.v1')!).touch).toBe(10);
  click('[data-begin]'); advance(50000, 2); expect(root.querySelector('[data-time]')!.textContent).toBe('45'); expect(mock.start).not.toHaveBeenCalled();
});
it('ignores a canceled camera start and never restarts on return from a hidden page', async () => {
  let done!: (ready: boolean) => void; mock.start.mockReturnValueOnce(new Promise(r => { done = r; }));
  click('[data-hands]'); click('[data-exit]'); done(true); await Promise.resolve(); await Promise.resolve();
  expect(root.querySelector<HTMLElement>('.blade-menu')!.hidden).toBe(false); expect(callbacks.size).toBe(0);
  click('[data-touch]'); window.dispatchEvent(new Event('pagehide')); expect(callbacks.size).toBe(0); expect(mock.stop).toHaveBeenCalled();
  window.dispatchEvent(new Event('pageshow')); expect(mock.start).toHaveBeenCalledOnce();
});
it('uses fresh hand observations to start and pauses a genuine loss without restarting the camera', async () => {
  mock.start.mockImplementationOnce(async () => { mock.running = true; return true; });
  click('[data-hands]'); await Promise.resolve(); await Promise.resolve();
  mock.emit!({ timestampMs: 0, imageAspectRatio: 4/3, hands: [{ id: 'left', x: .2, y: .5 }] }); advance(20, 1); click('[data-begin]');
  advance(40, 8); mock.emit!(null); advance(200, 4); expect(root.querySelector<HTMLElement>('.blade-tracking')!.hidden).toBe(true);
  advance(400, 30); expect(root.querySelector<HTMLElement>('.blade-tracking')!.hidden).toBe(false);
  const time = root.querySelector('[data-time]')!.textContent; advance(1100, 60); expect(root.querySelector('[data-time]')!.textContent).toBe(time);
  mock.running = false; advance(2500, 1); expect(callbacks.size).toBe(0); expect(root.textContent).toContain('The camera stopped.');
});
it('shows the controls and rules in Hungarian and German', () => {
  for (const [language, label, rule] of [['hu', 'Kamera · kézzel', 'Minden célpont aktív.'], ['de', 'Kamera · Hände', 'Jedes Ziel ist aktiv.']] as const) {
    app.dispose(); setLanguage(language); app = new PopApp(root); expect(root.textContent).toContain(label); expect(root.textContent).toContain(rule);
  }
});
