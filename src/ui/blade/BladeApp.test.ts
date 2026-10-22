// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BladeApp } from './BladeApp';
import type { SwordFrame } from '../../core/tracking/sword/types';
import { setLanguage } from '../../i18n';
const { start, stop, camera } = vi.hoisted(() => ({ start: vi.fn(async () => false), stop: vi.fn(), camera: { running: false, emit: null as ((frame: SwordFrame | null) => void) | null } }));
vi.mock('../../core/blade/BladeCamera', () => ({ BladeCamera: class { constructor(_video: unknown, callback: (frame: SwordFrame | null) => void) { camera.emit = callback; } get running() { return camera.running; } start = start; stop() { camera.running = false; camera.emit?.(null); stop(); } } }));
vi.mock('./BladeView', () => ({ BladeView: class { reset() {} resize() {} draw() {} } }));
let app: BladeApp, root: HTMLElement, callbacks: Map<number, FrameRequestCallback>, id: number, clock: number;
beforeEach(() => {
  localStorage.clear(); setLanguage('en'); start.mockReset(); start.mockResolvedValue(false); stop.mockClear(); camera.running = false; callbacks = new Map(); id = 0; clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { callbacks.set(++id, cb); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => callbacks.delete(id)));
  root = document.createElement('div'); document.body.replaceChildren(root); app = new BladeApp(root);
});
afterEach(() => { app.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const click = (selector: string) => (root.querySelector(selector) as HTMLElement).click();
function advance(from: number, count: number) { for (let i = 0; i < count; i++) { const entry = callbacks.entries().next().value; if (!entry) break; callbacks.delete(entry[0]); clock = from + i * 20; entry[1](clock); } }
describe('Neon Blade interface and lifecycle', () => {
  it('offers the camera first, with no camera access or rendering in the menu', () => {
    expect(root.textContent).toContain('Camera & marker wand'); expect(root.querySelector('.wand-diagram')!.getAttribute('aria-label')).toContain('two pink and two green');
    expect(start).not.toHaveBeenCalled(); expect(callbacks.size).toBe(0);
    expect(root.querySelector<HTMLAnchorElement>('.blade-games a')!.href).toContain('?lang=en');
  });
  it('starts touch practice without a camera and resumes the same round after pause', () => {
    click('[data-practice]'); advance(20, 120);
    const time = root.querySelector('[data-time]')!.textContent; expect(Number(time)).toBeLessThan(60);
    click('[data-pause]'); expect(callbacks.size).toBe(0); expect(root.textContent).toContain('Take a breather.');
    click('[data-begin]'); advance(3000, 10); expect(Number(root.querySelector('[data-time]')!.textContent)).toBeLessThanOrEqual(Number(time));
    expect(start).not.toHaveBeenCalled();
    click('[data-home]'); expect(callbacks.size).toBe(0); expect(root.querySelector<HTMLElement>('.blade-menu')!.hidden).toBe(false);
  });
  it('ignores a canceled pending start and never opens a camera on page return', async () => {
    let resolve!: (ready: boolean) => void; start.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    click('[data-camera]'); expect(start).toHaveBeenCalledOnce(); click('[data-exit]'); resolve(true);
    await Promise.resolve(); await Promise.resolve();
    expect(root.querySelector<HTMLElement>('.blade-menu')!.hidden).toBe(false); expect(callbacks.size).toBe(0);
    window.dispatchEvent(new Event('pageshow')); expect(start).toHaveBeenCalledOnce();
  });
  it('pauses and releases resources when the page is hidden', () => {
    click('[data-practice]'); advance(20, 10); window.dispatchEvent(new Event('pagehide'));
    expect(callbacks.size).toBe(0); expect(stop).toHaveBeenCalled(); expect(root.textContent).toContain('Your round will wait.');
  });
  it('flushes the zero timer at round end and starts a fresh replay', () => {
    click('[data-practice]'); advance(20, 3100);
    expect(root.querySelector('[data-time]')!.textContent).toBe('00');
    expect(root.textContent).toContain('That was a bright round!'); expect(callbacks.size).toBe(0);
    click('[data-begin]'); advance(70000, 2);
    expect(root.querySelector('[data-time]')!.textContent).toBe('60');
    expect(root.querySelector<HTMLElement>('.blade-overlay')!.hidden).toBe(true);
  });
  it('renders German and Hungarian camera instructions with working mode links', () => {
    for (const [language, label] of [['de', 'Kamera & Markierungsstab'], ['hu', 'Kamera és jelölőbot']] as const) {
      app.dispose(); setLanguage(language); app = new BladeApp(root); expect(root.textContent).toContain(label);
      expect(root.querySelector<HTMLAnchorElement>('.blade-games a')!.getAttribute('href')).toBe(`?lang=${language}`);
    }
  });
});

it('keeps a scored round moving through brief null samples, then pauses genuine loss and resumes without phantom hits', async () => {
  start.mockImplementationOnce(async () => { camera.running = true; return true; });
  click('[data-camera]'); await Promise.resolve(); await Promise.resolve();
  const frame = (x: number): SwordFrame => ({ timestampMs: clock, base: { x: 1-x, y: .35 }, tip: { x: 1-x, y: .8 }, confidence: 1, source: 'four-ring-2d', imageAspectRatio: 4/3, supportMask: 15 });
  camera.emit!(frame(.1)); advance(20, 1); click('[data-begin]');
  // Keep real observations arriving while the first crystal travels into view.
  for (let i = 1; i <= 70; i++) { clock = i * 20; camera.emit!(frame(.1)); advance(clock, 1); }
  clock = 1433; camera.emit!(frame(.6));
  clock = 1450; camera.emit!(null); advance(1460, 8);
  expect(root.querySelector('[data-score]')!.textContent).toBe('10');
  expect(root.querySelector<HTMLElement>('.blade-tracking')!.hidden).toBe(true);
  advance(1700, 10); expect(root.querySelector<HTMLElement>('.blade-tracking')!.hidden).toBe(false);
  const time = root.querySelector('[data-time]')!.textContent;
  advance(2000, 60); expect(root.querySelector('[data-time]')!.textContent).toBe(time);
  clock = 3300; camera.emit!(frame(.2)); advance(3320, 2);
  expect(root.querySelector<HTMLElement>('.blade-tracking')!.hidden).toBe(true);
  expect(root.querySelector('[data-score]')!.textContent).toBe('10');
  camera.running = false; advance(3400, 1);
  expect(root.textContent).toContain('The camera stopped. Restart it to continue.'); expect(callbacks.size).toBe(0);
});

it('selects level two and saves its record separately from the free-slicing level', () => {
  const radio = root.querySelector<HTMLInputElement>('input[value="2"]')!; radio.checked = true; radio.dispatchEvent(new Event('change'));
  click('[data-practice]'); expect(root.querySelector('[data-mode-label]')!.textContent).toContain('LEVEL 2');
  expect(root.querySelector<HTMLElement>('[data-hazard-rule]')!.hidden).toBe(false); advance(20, 3100);
  expect(localStorage.getItem('catspirits.neon-blade.best.v2')).not.toBeNull(); expect(localStorage.getItem('catspirits.neon-blade.best.v1')).toBeNull();
  click('[data-home]'); const easy = root.querySelector<HTMLInputElement>('input[value="1"]')!; easy.checked = true; easy.dispatchEvent(new Event('change')); click('[data-practice]');
  expect(root.querySelector<HTMLElement>('[data-hazard-rule]')!.hidden).toBe(true); expect(root.querySelector('[data-rule]')!.textContent).toBe('Slice in any direction!');
});
