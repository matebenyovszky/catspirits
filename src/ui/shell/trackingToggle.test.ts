// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { bindTrackingToggle, trackingToggle } from './trackingToggle';
import { OVERLAY_KEY, setTrackingLinesEnabled, trackingLinesEnabled } from '../../core/tracking/overlayPreference';
let controller: AbortController;
afterEach(()=>{controller?.abort();setTrackingLinesEnabled(true);localStorage.clear();vi.restoreAllMocks();});
it('syncs all toggle buttons, persists the choice, and detaches on game disposal',()=>{
  document.body.innerHTML=trackingToggle+trackingToggle;
  controller=new AbortController();bindTrackingToggle(document.body,controller.signal);
  const buttons=[...document.querySelectorAll('button')];buttons[0].querySelector('svg')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  expect(trackingLinesEnabled()).toBe(false);expect(localStorage.getItem(OVERLAY_KEY)).toBe('off');
  expect(buttons.every(b=>b.getAttribute('aria-pressed')==='false')).toBe(true);
  controller.abort();buttons[1].click();expect(trackingLinesEnabled()).toBe(false);
  controller=new AbortController();bindTrackingToggle(document.body,controller.signal);
  expect(buttons[1].getAttribute('aria-pressed')).toBe('false');buttons[1].click();expect(trackingLinesEnabled()).toBe(true);
});
it('keeps working when browser storage is unavailable',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});
  expect(()=>setTrackingLinesEnabled(false)).not.toThrow();expect(trackingLinesEnabled()).toBe(false);
});
