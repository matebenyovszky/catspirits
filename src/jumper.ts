import { initializeLanguage, localizedHtml } from './i18n';
import { JumperApp } from './ui/jumper/JumperApp';
import './ui/jumper/jumper.css';

initializeLanguage();

const root = document.querySelector<HTMLElement>('#jumper')!;
try {
  new JumperApp(root);
} catch (error) {
  console.error('Catspirits startup failed', error);
  root.innerHTML = localizedHtml(`<section class="jumper-fallback"><h1>Cyber Jumper</h1><p>A 3D játék nem indult el. Frissítsd a böngészőt, és kapcsold be a hardveres gyorsítást.</p><button type="button">Újrapróbálás</button></section>`);
  root.querySelector('button')?.addEventListener('click', () => location.reload());
}
