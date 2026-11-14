// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChipAudio, AUDIO_THEMES } from './ChipAudio';
import { bindSoundToggle } from '../../ui/audio/soundToggle';
import { setLanguage } from '../../i18n';
let contexts: FakeContext[], sources: FakeNode[];
class FakeNode extends EventTarget {
  connect = vi.fn(() => this); disconnect = vi.fn(); start = vi.fn();
  stop = vi.fn(() => this.dispatchEvent(new Event('ended')));
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() };
  frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  threshold = { value: 0 }; ratio = { value: 0 }; fftSize = 256;
  getByteTimeDomainData(a: Uint8Array) { a.fill(128); }
}
class FakeContext {
  state = 'suspended'; currentTime = 0; sampleRate = 8000; destination = new FakeNode();
  constructor() { contexts.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createGain = () => new FakeNode(); createDynamicsCompressor = () => new FakeNode(); createAnalyser = () => new FakeNode(); createBiquadFilter = () => new FakeNode();
  createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
  createOscillator = () => { const n = new FakeNode(); sources.push(n); return n; };
  createBufferSource = this.createOscillator;
}
beforeEach(() => { contexts=[]; sources=[]; localStorage.clear(); vi.useFakeTimers(); vi.stubGlobal('AudioContext', FakeContext); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('is silent on arrival, creates one lazy context, and stops all voices and timers on mute', async () => {
  const audio=new ChipAudio(); audio.play(); expect(contexts).toHaveLength(0);
  await audio.unlock(); expect(audio.snapshot().active).toBe(true); expect(vi.getTimerCount()).toBe(1);
  audio.play(); await audio.unlock(); expect(contexts).toHaveLength(1); expect(vi.getTimerCount()).toBe(1);
  audio.setEnabled(false); expect(audio.snapshot().voices).toBe(0); expect(audio.snapshot().active).toBe(false); expect(vi.getTimerCount()).toBe(0);
  const count=sources.length; audio.cue('pop'); vi.advanceTimersByTime(5000); expect(sources).toHaveLength(count);
  expect(new ChipAudio('robot').enabled).toBe(false); audio.dispose();
});
it('never starts a late resume after pause or disposal', async () => {
  const audio=new ChipAudio(); await audio.unlock();
  let done!: () => void; contexts[0].resume.mockImplementationOnce(() => new Promise<void>(r=>{done=()=>{contexts[0].state='running';r();};}));
  audio.play(); const pending=audio.unlock(); audio.sleep(); done(); await pending;
  expect(audio.snapshot().active).toBe(false); expect(contexts[0].state).toBe('suspended'); expect(vi.getTimerCount()).toBe(0);
  audio.dispose(); await audio.unlock(); expect(contexts).toHaveLength(1); expect(audio.snapshot().active).toBe(false);
});
it('ignores unavailable or rejected audio and keeps the game callable', async () => {
  vi.stubGlobal('AudioContext', undefined); const absent=new ChipAudio(); await absent.unlock(); absent.play(); absent.cue('wrong'); absent.dispose();
  vi.stubGlobal('AudioContext', FakeContext); const audio=new ChipAudio(); await audio.unlock(); contexts[0].resume.mockRejectedValueOnce(new Error('blocked'));
  await expect(audio.unlock()).resolves.toBeUndefined(); audio.dispose();
});
it('varies pop pitches, distinguishes feedback and bounds overlapping voices', async () => {
  const audio=new ChipAudio(); await audio.unlock();
  const starts:number[]=[];
  for(let i=0;i<4;i++){contexts[0].currentTime=i*.2; const start=sources.length; audio.cue('pop'); starts.push(sources[start].frequency.setValueAtTime.mock.calls[0][0]);}
  expect(new Set(starts).size).toBe(4);
  contexts[0].currentTime=1; let start=sources.length; audio.cue('wrong');
  const wrong=sources.slice(start).map(n=>n.frequency.setValueAtTime.mock.calls[0][0]); expect(wrong[0]).toBeGreaterThan(wrong[2]);
  contexts[0].currentTime=2; start=sources.length; audio.cue('correct');
  const correct=sources.slice(start,start+4).map(n=>n.frequency.setValueAtTime.mock.calls[0][0]); expect(correct[0]).toBeLessThan(correct[3]);
  for(let i=0;i<100;i++){contexts[0].currentTime+=.1; audio.cue('pop');}
  expect(audio.snapshot().voices).toBeLessThanOrEqual(48); audio.sleep(); expect(audio.snapshot().voices).toBe(0);
});
it('does not replay an effect on repeated render ticks and releases ended sources', async () => {
  const audio=new ChipAudio(); await audio.unlock(); audio.cue('pop'); const count=sources.length;
  audio.cue('pop'); expect(sources).toHaveLength(count);
  for(const node of sources)node.dispatchEvent(new Event('ended'));
  expect(audio.snapshot().voices).toBe(0); expect(sources.every(n=>n.disconnect.mock.calls.length)).toBe(true); audio.dispose();
});
it('suspends scheduling on a hidden document', async () => {
  const audio=new ChipAudio('blade'); await audio.unlock(); audio.play();
  vi.spyOn(document,'hidden','get').mockReturnValue(true); vi.advanceTimersByTime(25);
  expect(audio.snapshot().active).toBe(false); expect(vi.getTimerCount()).toBe(0); expect(contexts[0].state).toBe('suspended'); audio.dispose();
});
it('synchronizes menu and game buttons, persists mute across games and works without storage', async () => {
  setLanguage('en'); const root=document.createElement('div');root.innerHTML='<button data-sound></button><button data-sound></button><input data-mute type="checkbox">';
  const abort=new AbortController(), audio=new ChipAudio();bindSoundToggle(root,audio,abort.signal);
  root.querySelector<HTMLButtonElement>('button')!.click();
  expect([...root.querySelectorAll('button')].every(b=>b.getAttribute('aria-label')==='Sound: off' && !!b.querySelector('svg')&&b.getAttribute('aria-pressed')==='false')).toBe(true);
  expect(root.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  expect(new ChipAudio('blade').enabled).toBe(false);
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('private');});
  root.querySelector<HTMLButtonElement>('button')!.click(); await Promise.resolve(); expect(audio.enabled).toBe(true); abort.abort(); audio.dispose();
});

it('can restart music after a temporary tracking stop without a new user gesture', async () => {
  const audio=new ChipAudio(); await audio.unlock(); audio.play(); audio.stop();
  for(const node of sources)node.dispatchEvent(new Event('ended'));
  expect(audio.snapshot().active).toBe(false); expect(contexts[0].state).toBe('running');
  audio.play(); expect(audio.snapshot().active).toBe(true); expect(vi.getTimerCount()).toBe(1); audio.dispose();
});

it('gives each game a distinct upbeat arrangement with bounded voices', async () => {
  expect(new Set(Object.values(AUDIO_THEMES).map(t=>JSON.stringify(t.melody))).size).toBe(4);
  expect(Object.values(AUDIO_THEMES).every(t=>t.bpm>=128 && t.bpm<=148)).toBe(true);
  for (const theme of ['jumper','pop','blade','robot'] as const) {
    const audio=new ChipAudio(theme);await audio.unlock();audio.play(3);
    const context=contexts[contexts.length-1];
    for(let i=0;i<300;i++){context.currentTime=i*.05;vi.advanceTimersByTime(50);expect(audio.snapshot().voices).toBeLessThanOrEqual(48);for(const node of sources.splice(0))node.dispatchEvent(new Event('ended'));}
    expect(audio.snapshot().scheduledNotes).toBeGreaterThan(100);audio.dispose();expect(vi.getTimerCount()).toBe(0);
  }
});
