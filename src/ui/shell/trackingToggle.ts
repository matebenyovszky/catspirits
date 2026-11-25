import { t } from '../../i18n';
import { onTrackingLinesChange, setTrackingLinesEnabled, trackingLinesEnabled } from '../../core/tracking/overlayPreference';
export const trackingToggle = '<button type="button" class="tracking-toggle" data-tracking-lines aria-label="Követési vonalak" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="m4 8 8 3 8-3M12 11v5m-6 5 6-5 6 5"/><path class="tracking-off" d="m3 3 18 18"/></svg></button>';
export function bindTrackingToggle(root: HTMLElement, signal: AbortSignal): () => void {
  const render = () => {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tracking-lines]')) {
      button.setAttribute('aria-pressed', String(trackingLinesEnabled()));
      button.setAttribute('aria-label', t('Követési vonalak'));
      button.title = t(trackingLinesEnabled() ? 'Követési vonalak elrejtése' : 'Követési vonalak megjelenítése');
    }
  };
  root.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-tracking-lines]')) return;
    // In fullscreen the cursor panel can be nested in another bound control surface.
    event.stopPropagation();
    setTrackingLinesEnabled(!trackingLinesEnabled());
  }, { signal });
  const unsubscribe = onTrackingLinesChange(render);
  signal.addEventListener('abort', unsubscribe, { once: true });
  render();
  return render;
}
