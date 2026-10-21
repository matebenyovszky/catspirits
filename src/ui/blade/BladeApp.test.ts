// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BladeApp } from './BladeApp';
import { setLanguage } from '../../i18n';
const { start, stop } = vi.hoisted(() => ({ start: vi.fn(async () => false), stop: vi.fn() }));
vi.mock('../../core/blade/BladeCamera', () => ({ BladeCamera: class { running = false; start = start; stop = stop; } }));
vi.mock('./BladeView', () => ({ BladeView: class { reset() {} resize() {} draw() {} } }));
let app: BladeApp, root: HTMLElement, callbacks: Map<number, FrameRequestCallback>, id: number;
beforeEach(() => {
  localStorage.clear(); setLanguage('en'); start.mockClear(); stop.mockClear(); callbacks = new Map(); id = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { callbacks.set(++id, cb); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => callbacks.delete(id)));
  root = document.createElement('div'); document.body.replaceChildren(root); app = new BladeApp(root);
});
afterEach(() => { app.dispose(); vi.unstubAllGlobals(); });
const click = (selector: string) => (root.querySelector(selector) as HTMLElement).click();
function advance(from: number, count: number) { for (let i = 0; i < count; i++) { const entry = callbacks.entries().next().value; if (!entry) break; callbacks.delete(entry[0]); entry[1](from + i * 20); } }
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
  it('renders German and Hungarian camera instructions with working mode links', () => {
    for (const [language, label] of [['de', 'Kamera & Markierungsstab'], ['hu', 'Kamera és jelölőbot']] as const) {
      app.dispose(); setLanguage(language); app = new BladeApp(root); expect(root.textContent).toContain(label);
      expect(root.querySelector<HTMLAnchorElement>('.blade-games a')!.getAttribute('href')).toBe(`?lang=${language}`);
    }
  });
});
