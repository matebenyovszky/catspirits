// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JumperApp } from './JumperApp';
import { setLanguage } from '../../i18n';
import { freshSave } from '../../core/jumper/JumperSimulation';

vi.mock('../../core/jumper/JumperView', () => ({ JumperView: class {
  reducedMotion = false;
  setSuit() {} resize() {} update() {} event() {} dispose() {} snapshot() { return {}; }
} }));
vi.mock('../../core/jumper/JumperAudio', () => ({ JumperAudio: class {
  async unlock() {} setVolumes() {} play() {} stop() {} event() {} dispose() {} snapshot() { return {}; }
} }));
const cameraStart = vi.hoisted(() => vi.fn());
vi.mock('../../core/jumper/JumperCamera', () => ({ JumperCamera: class {
  constructor(_video: unknown, _jump: unknown, private status: (message: string, state: string) => void) {}
  async start() { cameraStart(); this.status('Nem található kamera. Csatlakoztass egy kamerát, majd próbáld újra.', 'error'); return false; }
  input() { return { tracked: false, calibrated: false, calibrationProgress: 0, runSpeed: 0, jump: false, crouch: false, lane: 0 }; }
  setResponse() {} stop() {}
} }));

let root: HTMLElement;
let frame: FrameRequestCallback;
let time: number;
const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();
const text = (selector: string) => root.querySelector<HTMLElement>(selector)!.textContent ?? '';
function chooseKeys() {
  const option = root.querySelector<HTMLInputElement>('[value="keys"]')!;
  option.checked = true; option.dispatchEvent(new Event('change'));
}
async function settle() { await Promise.resolve(); await Promise.resolve(); }
function advance(seconds: number) { for (let i = 0; i < seconds * 20; i++) { time += 50; frame(time); if(root.dataset.phase==='game-over')break; } }

beforeEach(() => {
  cameraStart.mockClear();
  setLanguage('en'); localStorage.clear();
  document.body.innerHTML = '<main id="jumper"></main>';
  root = document.querySelector('main')!; time = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); setLanguage('hu');
});

describe('standalone multilingual interface', () => {
  it('renders German menus, controls, camera errors and course previews', async () => {
    setLanguage('de');
    const save = freshSave(); save.stars = [3, 3, 0, 0, 0];
    localStorage.setItem('catspirits.cyber-jumper.v1', JSON.stringify(save));
    new JumperApp(root);
    expect(text('h1')).toBe('BEWEG DICHIN DIE ZUKUNFT.');
    expect(root.querySelector('[data-language="de"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(text('.language-switch')).toContain('Deutsch');
    expect(root.querySelector('[data-jump]')!.getAttribute('aria-label')).toBe('Springen');
    click('[data-worlds]'); expect(text('.world-list')).toContain('Regenbogenbrücke');
    click('[data-world="2"]');
    click('[data-suits]'); expect(text('.suit-grid')).toContain('Ab 7 ★');
    click('[data-modal-close]'); click('[data-settings]');
    expect(root.querySelector('[data-music]')!.getAttribute('aria-label')).toBe('Musiklautstärke');
    click('[data-modal-close]'); click('[data-help]');
    expect(text('.jumper-modal')).toContain('Ab Welt 3');
    click('[data-modal-close]');
    const option = root.querySelector<HTMLInputElement>('[value="camera"]')!;
    option.checked = true; option.dispatchEvent(new Event('change'));
    click('[data-play]'); await settle();
    expect(text('[data-camera-status]')).toContain('Keine Kamera gefunden');
    click('[data-use-keys]'); advance(1);
    expect(text('[data-level-name]')).toBe('Sternenhafen');
    expect(text('[data-course-preview]')).toContain('↓ DUCKEN');
    expect(root.querySelector('[data-section="2"]')!.getAttribute('aria-label')).toContain('geduckt bleiben');
    click('[data-pause]'); expect(text('#modal-title')).toBe('Pause.');
  });
  it('renders English worlds, suits, settings and help with accessible labels', () => {
    new JumperApp(root);
    expect(text('h1')).toBe('MOVE INTOTHE FUTURE.');
    expect(root.querySelector<HTMLInputElement>('[value="camera"]')!.checked).toBe(true);
    expect(cameraStart).not.toHaveBeenCalled();
    expect(text('[data-play]')).toContain('START CAMERA');
    expect(text('.hero-privacy')).toContain('stay on your device');
    expect(root.querySelector('canvas')!.getAttribute('aria-label')).toContain('With your camera');
    expect(text('.control-hint')).toContain('lean sideways');
    click('[data-worlds]'); expect(text('.world-list')).toContain('Rainbow Bridge');
    expect(root.querySelector('[data-world="1"]')!.hasAttribute('disabled')).toBe(true);
    click('[data-modal-close]'); click('[data-suits]');
    expect(text('.suit-grid')).toContain('After 7 ★'); expect(text('.suit-grid')).toContain('Galaxy');
    click('[data-modal-close]'); click('[data-settings]');
    expect(root.querySelector('[data-music]')!.getAttribute('aria-label')).toBe('Music volume');
    expect(text('.jumper-modal')).toContain('Slower pace, 5 lives.');
    click('[data-modal-close]'); click('[data-help]');
    expect(text('.jumper-modal')).toContain('From world 3, duck under the gold overhead beam');
    expect(text('.help-sword')).toContain('optional');
    expect(text('.help-sword')).toContain('coming soon');
  });
  it('translates camera setup and errors while retaining a working keyboard fallback', async () => {
    new JumperApp(root);
    const option = root.querySelector<HTMLInputElement>('[value="camera"]')!;
    option.checked = true; option.dispatchEvent(new Event('change'));
    click('[data-play]'); await settle();
    expect(text('[data-camera-status]')).toContain('No camera found');
    expect(text('.camera-response')).toContain('Steadier');
    expect(root.querySelector<HTMLButtonElement>('[data-camera-go]')!.disabled).toBe(true);
    click('[data-use-keys]'); advance(1);
    expect(root.dataset.phase).toBe('running');
    expect(text('[data-level-name]')).toBe('Neon City');
    expect(root.querySelector('video')!.closest<HTMLElement>('aside')!.hidden).toBe(true);
  });
  it('keeps progress independent of the old app and translates duck previews, pause and results', async () => {
    const save = freshSave(); save.stars = [3, 3, 0, 0, 0];
    localStorage.setItem('catspirits.cyber-jumper.v1', JSON.stringify(save));
    localStorage.setItem('clubgpt.cyber-jumper.v1', JSON.stringify({ ...save, best: 99999 }));
    new JumperApp(root);
    expect(text('[data-best]')).toBe('0');
    click('[data-worlds]'); click('[data-world="2"]'); chooseKeys();
    expect(text('[data-play]')).toContain('LET’S PLAY!');
    click('[data-play]'); await settle(); advance(1);
    expect(text('[data-level-name]')).toBe('Star Harbour');
    expect(text('[data-course-preview]')).toContain('↓ DUCK');
    expect(root.querySelector('[data-section="2"]')!.getAttribute('aria-label')).toContain('overhead beam, stay ducked');
    click('[data-pause]'); expect(text('#modal-title')).toBe('Paused.'); click('[data-resume]');
    advance(30);
    expect(root.dataset.phase).toBe('game-over');
    expect(text('#modal-title')).toBe('Another adventure?');
    expect(text('.result-stats')).toContain('BEST COMBO');
    expect(JSON.parse(localStorage.getItem('catspirits.cyber-jumper.v1')!).best).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(localStorage.getItem('clubgpt.cyber-jumper.v1')!).best).toBe(99999);
  }, 15000);
  it('retains the Hungarian game interface', () => {
    setLanguage('hu'); new JumperApp(root);
    expect(text('h1')).toBe('MOZDULJ AJÖVŐBE.');
    expect(text('[data-play]')).toContain('KAMERA INDÍTÁSA');
    click('[data-worlds]'); expect(text('.world-list')).toContain('Csillagkikötő');
  });
});
