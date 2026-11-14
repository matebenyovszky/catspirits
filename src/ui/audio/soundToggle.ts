import type { ChipAudio } from '../../core/audio/ChipAudio';
import { t } from '../../i18n';
import './soundToggle.css';
/** One speaker icon and saved preference for every menu and in-game toolbar. */
export function bindSoundToggle(root: HTMLElement, audio: ChipAudio, signal: AbortSignal): void {
  const render = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound]')) {
      const label=t(audio.enabled?'Hang: be':'Hang: ki');
      button.classList.add('sound-toggle');button.setAttribute('aria-label',label);button.title=label;
      button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="${audio.enabled?'M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14':'m16 9 6 6m0-6-6 6'}"/></svg>`;
      button.setAttribute('aria-pressed', String(audio.enabled));
    }
    const mute = root.querySelector<HTMLInputElement>('[data-mute]'); if (mute) mute.checked = !audio.enabled;
  };
  audio.onEnabledChange = render;
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound]')) button.addEventListener('click', () => audio.setEnabled(!audio.enabled), { signal });
  // The initial physical opt-in gesture can also unlock Safari's audio context.
  window.addEventListener('catspirits-hand-enable',()=>{void audio.unlock();},{signal});
  render();
}
