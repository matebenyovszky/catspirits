import { getLanguage, initializeLanguage, isLanguage, LANGUAGE_KEY, localizedHtml } from './i18n';
import { HandNavigation } from './ui/hand/HandNavigation';
import type { GameId } from './ui/shell/GameHeader';
import { GameFullscreen } from './ui/shell/GameFullscreen';
import './ui/jumper/jumper.css';

const root = document.querySelector<HTMLElement>('#jumper')!;
const loaders = {
  arcade: () => import('./ui/festival/FestivalApp').then(({ FestivalApp }) => FestivalApp),
  jumper: () => import('./ui/jumper/JumperApp').then(({ JumperApp }) => JumperApp),
  blade: () => import('./ui/blade/BladeApp').then(({ BladeApp }) => BladeApp),
  pop: () => import('./ui/pop/PopApp').then(({ PopApp }) => PopApp),
  galaxy: () => import('./ui/galaxy/GalaxyApp').then(({ GalaxyApp }) => GalaxyApp),
  robot: () => import('./ui/robot/RobotApp').then(({ RobotApp }) => RobotApp),
};
let active: { dispose(): void } | undefined;
initializeLanguage();
const navigation = new HandNavigation(root);
const fullscreen = new GameFullscreen(root, frame => navigation.setFullscreenFrame(frame));
let revision = 0;

async function renderRoute(focus = false): Promise<void> {
  const current = ++revision;
  const name = new URLSearchParams(location.search).get('game');
  const game: GameId = name === 'arcade' || name === 'blade' || name === 'pop' || name === 'robot' || name === 'galaxy' ? name : 'jumper';
  // Load the selected module before replacing a working screen. A rapid click
  // or history traversal can overtake an earlier import.
  try {
    const App = await loaders[game]();
    if (current !== revision) return;
    fullscreen.beforeRouteChange();
    navigation.beforeRouteChange();
    active?.dispose();
    active = undefined;
    for (const attr of root.getAttributeNames()) if (attr.startsWith('data-')) root.removeAttribute(attr);
    root.className = '';
    initializeLanguage();
    active = new App(root);
    root.scrollTop = 0;
    if (focus) {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
  } catch (error) {
    if (current !== revision) return;
    console.error('Catspirits startup failed', error);
    root.innerHTML = localizedHtml('<section class="jumper-fallback"><h1>Catspirits</h1><p>A játék nem töltődött be. Próbáld újra.</p><button type="button">Újrapróbálás</button></section>');
    root.querySelector('button')?.addEventListener('click', () => void renderRoute());
  }
  fullscreen.refresh();
  navigation.refreshLanguage();
}

function navigate(url: URL): void {
  if (url.href === location.href) return;
  history.pushState(null, '', url.href);
  void renderRoute(true);
}

root.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[data-route]');
  if (!link || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  event.preventDefault();
  navigate(url);
});
root.addEventListener('change', event => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || !select.matches('[data-language]')) return;
  const language = select.value;
  if (!isLanguage(language) || language === getLanguage()) return;
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* URL retains the choice. */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', language);
  navigate(url);
});
window.addEventListener('popstate', () => void renderRoute(true));

await renderRoute();
