// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLanguage, initializeLanguage, LANGUAGE_KEY, localizedHtml, resolveLanguage, setLanguage, t } from './index';
import { english } from './en';
import { german } from './de';

beforeEach(() => { setLanguage('en'); localStorage.clear(); history.replaceState(null, '', '/'); });
afterEach(() => { setLanguage('hu'); vi.unstubAllGlobals(); });

describe('language choice', () => {
  it('prefers an explicit shareable URL, then a saved choice, then the browser language', () => {
    expect(resolveLanguage('?lang=en', 'hu', 'hu-HU')).toBe('en');
    expect(resolveLanguage('?lang=hu', 'en', 'en-GB')).toBe('hu');
    expect(resolveLanguage('?lang=invalid', 'en', 'hu-HU')).toBe('en');
    expect(resolveLanguage('', null, 'hu-HU')).toBe('hu');
    expect(resolveLanguage('', null, 'de-DE')).toBe('de');
    expect(resolveLanguage('', 'unknown', 'en-US')).toBe('en');
  });
  it('uses the first supported browser preference and defaults to English', () => {
    expect(resolveLanguage('', null, ['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(resolveLanguage('', null, ['en-US', 'hu-HU'])).toBe('en');
    expect(resolveLanguage('', null, ['HU-hu', 'de-DE'])).toBe('hu');
    expect(resolveLanguage('', null, ['de-CH'])).toBe('de');
    expect(resolveLanguage('', null, ['fr', 'es'])).toBe('en');
    expect(resolveLanguage('', null, [])).toBe('en');
    expect(resolveLanguage('?lang=de', 'hu', ['en-US'])).toBe('de');
    expect(resolveLanguage('', 'de', ['hu-HU'])).toBe('de');
  });
  it('initializes German metadata from the browser preference list', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR', 'de-DE', 'en'] });
    document.head.innerHTML = '<meta name="description" content="">';
    initializeLanguage();
    expect(getLanguage()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(document.title).toContain('Beweg dich und spiel');
    expect(document.querySelector('meta')!.content).toContain('Kamerasteuerung');
  });
  it('sets document metadata and honours the stored choice', () => {
    localStorage.setItem(LANGUAGE_KEY, 'en');
    document.head.innerHTML = '<meta name="description" content="Cyber Jumper: neon robotkaland öt világon át. Ugorj, gyűjts kristályokat, fedezz fel új robotruhákat! Billentyűvel, érintéssel vagy kamerával.">';
    initializeLanguage();
    expect(getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toContain('Move and play');
    expect(document.querySelector('meta')!.content).toContain('camera-controlled');
  });
  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    history.replaceState(null, '', '/?lang=hu');
    initializeLanguage();
    expect(getLanguage()).toBe('hu');
    expect(document.documentElement.lang).toBe('hu');
    vi.restoreAllMocks();
  });
});

describe('translated game output', () => {
  it('provides complete German phrases with matching interpolation fields', () => {
    expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
    for (const [source, target] of Object.entries(german)) {
      expect(target.trim(), source).not.toBe('');
      expect(target.match(/\{\w+\}/g) ?? [], source).toEqual(source.match(/\{\w+\}/g) ?? []);
    }
  });
  it('translates German counts, nested lane labels and camera messages', () => {
    setLanguage('de');
    expect(t('1 csillag')).toBe('1 Stern');
    expect(t('3 csillag')).toBe('3 Sterne');
    expect(t('1 élet')).toBe('1 Leben');
    expect(t('{count} ★ után', { count: 7 })).toBe('Ab 7 ★');
    expect(t(', kristályok: {lane} sáv', { lane: 'BAL' })).toBe(', Kristalle: Spur LINKS');
    expect(t('FaceTime HD megnyitva. Testkövető modell betöltése…')).toBe('FaceTime HD geöffnet. Modell zur Bewegungserkennung wird geladen…');
    expect(localizedHtml('<button aria-label="Ugrás"> UGRÁS </button>')).toContain('aria-label="Springen"> SPRINGEN </button>');
  });
  it('translates counts, combos and camera labels while preserving values', () => {
    expect(t('1 csillag')).toBe('1 star');
    expect(t('3 élet')).toBe('3 lives');
    expect(t('{count} ★ után', { count: 7 })).toBe('After 7 ★');
    expect(t('4× KOMBO! +175')).toBe('4× COMBO! +175');
    expect(t('BIT RUHATÁRA · 11 / 15 ★')).toBe('BIT’S WARDROBE · 11 / 15 ★');
    expect(t('FaceTime HD megnyitva. Testkövető modell betöltése…')).toBe('FaceTime HD opened. Loading body tracking model…');
    expect(t('STAR HARBOUR · TELJESÍTVE')).toBe('STAR HARBOUR · COMPLETE');
  });
  it('translates text and accessible labels without altering game markup or SVG', () => {
    const markup = localizedHtml('<button data-jump style="--color:purple" aria-label="Ugrás"><svg viewBox="0 0 24 24"><path d="M9 5l11 7"></path></svg> UGRÁS </button><div aria-label="2 csillag">★ ★</div>');
    const template = document.createElement('template'); template.innerHTML = markup;
    const button = template.content.querySelector('button')!;
    expect(button.textContent).toBe(' JUMP ');
    expect(button.getAttribute('aria-label')).toBe('Jump');
    expect(button.hasAttribute('data-jump')).toBe(true);
    expect(button.style.getPropertyValue('--color')).toBe('purple');
    expect(button.querySelector('path')!.getAttribute('d')).toBe('M9 5l11 7');
    expect(template.content.querySelector('div')!.getAttribute('aria-label')).toBe('2 stars');
  });
  it('keeps Hungarian output, device names, symbols and numbers unchanged', () => {
    const markup = '<button aria-label="Ugrás">UGRÁS</button>';
    setLanguage('hu');
    expect(localizedHtml(markup)).toBe(markup);
    expect(t('{count} élet', { count: 1 })).toBe('1 élet');
    setLanguage('en');
    expect(t('FaceTime HD')).toBe('FaceTime HD');
    expect(t('◆ 125')).toBe('◆ 125');
  });
});
