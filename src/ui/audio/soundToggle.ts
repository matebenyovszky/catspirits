import type { ChipAudio } from '../../core/audio/ChipAudio';
import { t } from '../../i18n';
/** All copies (menu and in-game toolbar) reflect one saved preference. */
export function bindSoundToggle(root: HTMLElement, audio: ChipAudio, signal: AbortSignal): void {
  const render = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound]')) {
      button.textContent = t(audio.enabled ? 'Hang: be' : 'Hang: ki');
      button.setAttribute('aria-pressed', String(audio.enabled));
    }
    const mute = root.querySelector<HTMLInputElement>('[data-mute]'); if (mute) mute.checked = !audio.enabled;
  };
  audio.onEnabledChange = render;
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-sound]')) button.addEventListener('click', () => audio.setEnabled(!audio.enabled), { signal });
  render();
}
