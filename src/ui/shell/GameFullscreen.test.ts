// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLanguage } from '../../i18n';
import { GameFullscreen } from './GameFullscreen';

let root: HTMLElement;
let frame: HTMLElement;
let button: HTMLButtonElement;
let tools: HTMLElement;
let controller: GameFullscreen;
let nativeFrame: Element | null;
let nativeEnabled: boolean;
const frameChanged = vi.fn();
const exitNative = vi.fn(async () => {
  nativeFrame = null;
  document.dispatchEvent(new Event('fullscreenchange'));
});

beforeEach(() => {
  vi.clearAllMocks();
  setLanguage('en');
  nativeFrame = null;
  nativeEnabled = false;
  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, get: () => nativeEnabled },
    fullscreenElement: { configurable: true, get: () => nativeFrame },
    exitFullscreen: { configurable: true, value: exitNative },
  });
  document.body.innerHTML = `<main><header><div class="shell-tools"><button data-game-fullscreen></button></div></header>
    <section><div data-game-frame hidden><canvas tabindex="0"></canvas></div><aside id="journal"></aside></section></main>`;
  root = document.querySelector('main')!;
  frame = root.querySelector('[data-game-frame]')!;
  button = root.querySelector('[data-game-fullscreen]')!;
  tools = root.querySelector('.shell-tools')!;
  controller = new GameFullscreen(root, frameChanged);
  controller.refresh();
});

afterEach(() => {
  controller.dispose();
  for (const property of ['fullscreenElement', 'fullscreenEnabled', 'exitFullscreen']) Reflect.deleteProperty(document, property);
  setLanguage('hu');
});

it('expands only the available play frame and returns its single button with Escape', async () => {
  expect(button.disabled).toBe(true);
  frame.hidden = false;
  await Promise.resolve();
  expect(button.disabled).toBe(false);
  button.click();
  expect(frameChanged).toHaveBeenLastCalledWith(frame);
  expect(frame.hasAttribute('data-game-expanded')).toBe(true);
  expect(root.querySelector('header')!.hasAttribute('data-fullscreen-background')).toBe(true);
  expect(root.querySelector('#journal')!.hasAttribute('data-fullscreen-background')).toBe(true);
  expect(button.parentElement).toBe(frame);
  expect(button.getAttribute('aria-label')).toBe('Exit full screen');
  expect(document.activeElement).toBe(frame.querySelector('canvas'));

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect(frame.hasAttribute('data-game-expanded')).toBe(false);
  expect(root.querySelector('[data-fullscreen-background]')).toBeNull();
  expect(frameChanged).toHaveBeenLastCalledWith(undefined);
  expect(button.parentElement).toBe(tools);
  expect(button.getAttribute('aria-label')).toBe('Full screen');
});

it('follows native fullscreen exit and otherwise keeps the expanded layout on API rejection', async () => {
  frame.hidden = false;
  await Promise.resolve();
  nativeEnabled = true;
  frame.requestFullscreen = vi.fn().mockImplementationOnce(async () => {
    nativeFrame = frame;
    document.dispatchEvent(new Event('fullscreenchange'));
  }).mockRejectedValueOnce(new DOMException('Unavailable', 'NotAllowedError'));

  button.click();
  await Promise.resolve();
  expect(frame.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  expect(document.fullscreenElement).toBe(frame);
  await exitNative();
  expect(button.parentElement).toBe(tools);
  expect(frame.hasAttribute('data-game-expanded')).toBe(false);

  button.click();
  await Promise.resolve();
  expect(document.fullscreenElement).toBeNull();
  expect(frame.hasAttribute('data-game-expanded')).toBe(true);
  frame.hidden = true;
  await Promise.resolve();
  expect(button.parentElement).toBe(tools);
  expect(button.disabled).toBe(true);
});
