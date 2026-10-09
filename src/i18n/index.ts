import { english } from './en';
import { german } from './de';

export const LANGUAGES = ['en', 'hu', 'de'] as const;
export type Language = typeof LANGUAGES[number];
export function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.some(language => language === value);
}
export const LANGUAGE_KEY = 'catspirits.language.v1';
let language: Language = 'en';

export function resolveLanguage(query: string, saved: string | null, browser: string | readonly string[]): Language {
  const explicit = new URLSearchParams(query).get('lang');
  if (isLanguage(explicit)) return explicit;
  if (isLanguage(saved)) return saved;
  for (const locale of typeof browser === 'string' ? [browser] : browser) {
    const base = locale.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}
export function getLanguage(): Language { return language; }
export function setLanguage(value: Language): void { language = value; }
export function initializeLanguage(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch { /* Storage is optional. */ }
  setLanguage(resolveLanguage(location.search, saved, navigator.languages?.length ? navigator.languages : navigator.language));
  document.documentElement.lang = language;
  document.title = `Catspirits · ${t('Cyber Jumper · Mozdulj és játssz!')}`;
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description) description.content = t('Catspirits: kamerával vezérelt, mozgásos robotkaland. Ugorj, hajolj le, és dőlj oldalra öt neonvilágon át. A képfeldolgozás a gépeden történik. Billentyűvel és érintéssel is játszható.');
}

const dictionaries = { en: english, de: german };
const makePatterns = (dictionary: Record<string, string>) => Object.entries(dictionary).filter(([source]) => source.includes('{')).map(([source, target]) => {
  const names: string[] = [];
  const regex = source.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { regex: new RegExp(`^${regex}$`), names, target };
});
const patterns = { en: makePatterns(english), de: makePatterns(german) };

/** Translate authored phrases or named placeholders, preserving surrounding spaces. */
export function t(source: string, values?: Record<string, string | number>): string {
  if (values) source = source.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
  if (language === 'hu') return source;
  const text = source.trim();
  let translated = dictionaries[language][text];
  if (translated === undefined) {
    for (const pattern of patterns[language]) {
      const match = text.match(pattern.regex);
      if (!match) continue;
      const params = Object.fromEntries(pattern.names.map((name, index) => [name, t(match[index + 1])]));
      translated = pattern.target.replace(/\{(\w+)\}/g, (token, name: string) => params[name] ?? token);
      if (params.count === '1') translated = language === 'en'
        ? translated.replace(/\b1 stars\b/, '1 star').replace(/\b1 lives\b/, '1 life')
        : translated.replace(/\b1 Sterne\b/, '1 Stern');
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
