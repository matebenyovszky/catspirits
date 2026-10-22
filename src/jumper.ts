import { initializeLanguage, localizedHtml } from './i18n';
import './ui/jumper/jumper.css';

initializeLanguage();

const root = document.querySelector<HTMLElement>('#jumper')!;
try {
  if (new URLSearchParams(location.search).get("game") === "blade") {
    const { BladeApp } = await import("./ui/blade/BladeApp");
    new BladeApp(root);
  } else if (new URLSearchParams(location.search).get("game") === "pop") {
    const { PopApp } = await import("./ui/pop/PopApp");
    new PopApp(root);
  } else {
    const { JumperApp } = await import("./ui/jumper/JumperApp");
    new JumperApp(root);
  }
} catch (error) {
  console.error('Catspirits startup failed', error);
  root.innerHTML = localizedHtml(`<section class="jumper-fallback"><h1>Cyber Jumper</h1><p>A 3D játék nem indult el. Frissítsd a böngészőt, és kapcsold be a hardveres gyorsítást.</p><button type="button">Újrapróbálás</button></section>`);
  root.querySelector('button')?.addEventListener('click', () => location.reload());
}
