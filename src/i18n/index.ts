import { english } from './en';

export type Language = 'hu' | 'en';
export const LANGUAGE_KEY = 'catspirits.language.v1';
let language: Language = 'hu';

export function resolveLanguage(query: string, saved: string | null, browser: string): Language {
  const explicit = new URLSearchParams(query).get('lang');
  if (explicit === 'hu' || explicit === 'en') return explicit;
  if (saved === 'hu' || saved === 'en') return saved;
  return /^hu(?:-|$)/i.test(browser) ? 'hu' : 'en';
}
export function getLanguage(): Language { return language; }
export function setLanguage(value: Language): void { language = value; }
export function initializeLanguage(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch { /* Storage is optional. */ }
  setLanguage(resolveLanguage(location.search, saved, navigator.language));
  document.documentElement.lang = language;
  document.title = `Catspirits · ${t('Cyber Jumper · Ugorj a jövőbe!')}`;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t('Cyber Jumper: neon robotkaland öt világon át. Ugorj, gyűjts kristályokat, fedezz fel új robotruhákat! Billentyűvel, érintéssel vagy kamerával.');
}

const patterns = Object.entries(english).filter(([source]) => source.includes('{')).map(([source, target]) => {
  const names: string[] = [];
  const regex = source.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { regex: new RegExp(`^${regex}$`), names, target };
});

/** Translate authored phrases or named placeholders, preserving surrounding spaces. */
export function t(source: string, values?: Record<string, string | number>): string {
  if (values) source = source.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
  if (language === 'hu') return source;
  const text = source.trim();
  let translated = english[text];
  if (translated === undefined) {
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (!match) continue;
      const params = Object.fromEntries(pattern.names.map((name, index) => [name, t(match[index + 1])]));
      translated = pattern.target.replace(/\{(\w+)\}/g, (token, name: string) => params[name] ?? token);
      if (params.count === '1') translated = translated.replace(/\b1 stars\b/, '1 star').replace(/\b1 lives\b/, '1 life');
      break;
    }
  }
  if (translated === undefined) return source; // Symbols, numbers, and device labels remain intact.
  return source.slice(0, source.indexOf(text)) + translated + source.slice(source.indexOf(text) + text.length);
}

/** Only translate text and accessible labels in markup authored by the game. */
export function localizedHtml(source: string): string {
  if (language === 'hu') return source;
  const template = document.createElement('template');
  template.innerHTML = source;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) walker.currentNode.textContent = t(walker.currentNode.textContent ?? '');
  for (const element of template.content.querySelectorAll('[aria-label], [title]')) {
    for (const name of ['aria-label', 'title']) {
      const value = element.getAttribute(name);
      if (value !== null) element.setAttribute(name, t(value));
    }
  }
  return template.innerHTML;
}
