/** Only controls visualisation; never affects camera capture or inference. */
export const OVERLAY_KEY = 'catspirits-tracking-lines';
const listeners = new Set<() => void>();
let enabled = true;
try { enabled = localStorage.getItem(OVERLAY_KEY) !== 'off'; } catch { /* Private/restricted storage. */ }
export const trackingLinesEnabled = (): boolean => enabled;
export function setTrackingLinesEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  try { localStorage.setItem(OVERLAY_KEY, value ? 'on' : 'off'); } catch { /* Keep the session preference. */ }
  for (const listener of listeners) listener();
}
export function onTrackingLinesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
