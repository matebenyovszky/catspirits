import { getLanguage, LANGUAGES, t } from '../../i18n';
import './shell.css';

export type GameId = 'jumper' | 'blade' | 'pop' | 'robot' | 'arcade' | 'galaxy';

const games: Record<GameId, string> = {
  jumper: 'Cyber Jumper', blade: 'Neon Blade', pop: 'Neon Pop', robot: 'Bit Rescue', arcade: 'Arcade', galaxy: 'Galaxisfa',
};

export function gameHeader(current: GameId, controls = '<button class="shell-sound" data-sound aria-pressed="true">Hang: be</button>'): string {
  const lang = getLanguage();
  const links = Object.entries(games).map(([id, name]) => {
    const href = id === 'jumper' ? `?lang=${lang}` : `?game=${id}&lang=${lang}`;
    return `<a href="${href}" data-route${id === current ? ' aria-current="page"' : ''}>${t(name)}</a>`;
  }).join('');
  const mark = '<span class="shell-mark" aria-hidden="true">✦</span><span>CATSPIRITS</span>';
  const brand = current === 'jumper'
    ? `<button class="shell-brand" data-home aria-label="Cyber Jumper kezdőlap">${mark}</button>`
    : `<a class="shell-brand" href="?lang=${lang}" data-route>${mark}</a>`;
  return `<header class="shell-header ${current === 'jumper' ? 'jumper-header' : ''}">
    ${brand}
    <nav class="shell-games" aria-label="Játékválasztó">${links}</nav>
    <div class="shell-tools">${controls}<select class="shell-language" data-language aria-label="Nyelv">
      ${LANGUAGES.map(language => `<option lang="${language}" value="${language}"${language === lang ? ' selected' : ''}>${language.toUpperCase()}</option>`).join('')}
    </select><button type="button" class="shell-fullscreen" data-game-fullscreen aria-label="Teljes képernyő" title="Teljes képernyő">
      <svg viewBox="0 0 24 24" aria-hidden="true" class="fullscreen-enter"><path d="M8 4H4v4m12-4h4v4m0 8v4h-4M4 16v4h4"/></svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" class="fullscreen-exit"><path d="M4 8h4V4m12 4h-4V4m0 16v-4h4M8 20v-4H4"/></svg>
    </button></div>
  </header>`;
}
