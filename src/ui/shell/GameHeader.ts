import { getLanguage, LANGUAGES } from '../../i18n';
import './shell.css';
import { trackingToggle } from './trackingToggle';

export type GameId = 'jumper' | 'blade' | 'pop' | 'robot' | 'arcade';

const games: Record<GameId, string> = {
  jumper: 'Cyber Jumper', blade: 'Neon Blade', pop: 'Neon Pop', robot: 'Bit Rescue', arcade: 'Arcade',
};

export function gameHeader(current: GameId, controls = '<button class="shell-sound" data-sound aria-pressed="true">Hang: be</button>'): string {
  const lang = getLanguage();
  const links = Object.entries(games).map(([id, name]) => {
    const href = id === 'jumper' ? `?lang=${lang}` : `?game=${id}&lang=${lang}`;
    return `<a href="${href}" data-route${id === current ? ' aria-current="page"' : ''}>${name}</a>`;
  }).join('');
  const mark = '<span class="shell-mark" aria-hidden="true">✦</span><span>CATSPIRITS</span>';
  const brand = current === 'jumper'
    ? `<button class="shell-brand" data-home aria-label="Cyber Jumper kezdőlap">${mark}</button>`
    : `<a class="shell-brand" href="?lang=${lang}" data-route>${mark}</a>`;
  return `<header class="shell-header ${current === 'jumper' ? 'jumper-header' : ''}">
    ${brand}
    <nav class="shell-games" aria-label="Játékválasztó">${links}</nav>
    <div class="shell-tools">${controls}${trackingToggle}<select class="shell-language" data-language aria-label="Nyelv">
      ${LANGUAGES.map(language => `<option lang="${language}" value="${language}"${language === lang ? ' selected' : ''}>${language.toUpperCase()}</option>`).join('')}
    </select></div>
  </header>`;
}
