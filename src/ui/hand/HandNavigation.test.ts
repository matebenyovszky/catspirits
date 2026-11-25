// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HandNavigation } from './HandNavigation';
import { handFixture } from '../../core/robot/handFixture';
import { setTrackingLinesEnabled, trackingLinesEnabled } from '../../core/tracking/overlayPreference';
import { bindTrackingToggle, trackingToggle } from '../shell/trackingToggle';
import { setLanguage } from '../../i18n';
import { sharedCamera } from '../../core/tracking/SharedCamera';
import type { PoseFrame } from '../../core/tracking/types';
const { trackers }=vi.hoisted(()=>({trackers:[] as {callbacks:{onFrame:(frame:PoseFrame)=>void};start:ReturnType<typeof vi.fn>;dispose:ReturnType<typeof vi.fn>}[]}));
vi.mock('../../core/tracking/CameraPoseTracker',()=>({CameraPoseTracker:class {
  start=vi.fn(async()=>{});dispose=vi.fn();setInputWidth=vi.fn();
  constructor(_video:HTMLVideoElement,public callbacks:{onFrame:(frame:PoseFrame)=>void}){trackers.push(this);}
}}));
vi.mock('../../core/tracking/hand.worker',()=>({createHandWorker:vi.fn()}));
let navigation:HandNavigation,hit:Element|null,release:(()=>void)|undefined;
const track = Object.assign(new EventTarget(), { stop: vi.fn() });
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = vi.fn(async () => stream);
const permission = vi.fn(async () => ({ state: 'granted' }));
beforeEach(()=>{document.body.innerHTML='';sessionStorage.clear();trackers.length=0;
  setTrackingLinesEnabled(true);setLanguage('en');
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
  track.stop.mockClear();getUserMedia.mockClear();permission.mockReset().mockResolvedValue({state:'granted'});
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia},permissions:{query:permission}});hit=null;vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('PointerEvent',MouseEvent);vi.spyOn(document,'hidden','get').mockReturnValue(false);Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>hit});navigation=new HandNavigation();});
afterEach(()=>{navigation.dispose();release?.();release=undefined;setTrackingLinesEnabled(true);setLanguage('en');vi.unstubAllGlobals();vi.restoreAllMocks();});
const settle=async()=>{await vi.dynamicImportSettled();for(let i=0;i<10;i++)await Promise.resolve();};
const toggle=()=>document.querySelector<HTMLButtonElement>('.hand-navigation button')!;
it('does not start a model or camera until opt-in; stops immediately and clears session opt-in',async()=>{
  await settle();expect(trackers).toHaveLength(0);toggle().click();await settle();expect(trackers).toHaveLength(1);expect(trackers[0].start).toHaveBeenCalledOnce();expect(toggle().getAttribute('aria-pressed')).toBe('true');
  toggle().click();expect(trackers[0].dispose).toHaveBeenCalledOnce();expect(sessionStorage.getItem('catspirits.hand-navigation.session.v1')).toBeNull();
});
it('reuses robot hand frames, then restarts cursor inference when the robot releases its camera',async()=>{
  miniature();toggle().click();await settle();
  const robot=sharedCamera.claim('game-hand');release=robot.release;await robot.ready;
  expect(trackers[0].dispose).toHaveBeenCalledOnce();expect(trackers).toHaveLength(1);
  await settle();sharedCamera.publishHand(handFixture(performance.now()));expectHandSkeleton();
  const sharedSkeleton = skeleton();
  robot.release();await settle();expect(trackers).toHaveLength(2);expect(trackers[1].start).toHaveBeenCalledOnce();
  expect(sharedSkeleton.isConnected).toBe(false);
  const blade=sharedCamera.claim('game');expect(await blade.ready).toBe(stream);blade.release();
  expect(getUserMedia).toHaveBeenCalledOnce();expect(track.stop).not.toHaveBeenCalled();
  toggle().click();expect(track.stop).toHaveBeenCalledOnce();
});
it('cannot resurrect on pagehide from a late game release; resumes on pageshow',async()=>{
  toggle().click();await settle();window.dispatchEvent(new Event('pagehide'));expect(trackers[0].dispose).toHaveBeenCalledOnce();
  const lease=sharedCamera.claim('game');await lease.ready;lease.release();await settle();expect(trackers).toHaveLength(1);
  window.dispatchEvent(new Event('pageshow'));await settle();expect(trackers).toHaveLength(2);
});
it('cancels a late lazy import if disabled before initialization',async()=>{
  toggle().click();toggle().click();await settle();expect(trackers).toHaveLength(0);
});

it('sleeps the cursor render loop while no hand is visible, then wakes on a fresh hand',async()=>{
  toggle().click();await settle();expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  vi.mocked(requestAnimationFrame).mock.calls[0][0](performance.now()+500);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  const landmarks=Array.from({length:21},()=>({x:.5,y:.5,z:0}));landmarks[5].x=.43;landmarks[17].x=.57;landmarks[4].x=.38;
  trackers[0].callbacks.onFrame({timestampMs:performance.now(),landmarks,worldLandmarks:[],inferenceMs:1});
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});

it('does not re-prompt on return to the page when the browser requires permission again', async () => {
  toggle().click(); await settle();
  window.dispatchEvent(new Event('pagehide'));
  expect(track.stop).toHaveBeenCalledOnce();
  permission.mockResolvedValue({ state: 'prompt' });
  window.dispatchEvent(new Event('pageshow')); await settle();
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  toggle().click(); await settle();
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});

function miniature() {
  const video = document.querySelector<HTMLVideoElement>('.hand-navigation video')!;
  // jsdom has no layout engine. Give the miniature the same 4:3 mirrored box
  // it has in the page so the actual SVG overlay can project the measured hand.
  Object.defineProperties(video, { clientWidth: { value: 76 }, clientHeight: { value: 57 } });
  video.style.transform = 'scaleX(-1)';
  video.style.objectFit = 'contain';
  video.getClientRects = () => [{}] as unknown as DOMRectList;
  return video;
}
const panelLines = () => document.querySelector<HTMLButtonElement>('.hand-navigation [data-tracking-lines]')!;
const skeleton = () => document.querySelector<SVGSVGElement>('.hand-navigation .tracking-overlay')!;
function expectHandSkeleton() {
  const svg = skeleton();
  expect(svg.style.display).toBe('block');
  expect(svg.style.transform).toBe('scaleX(-1)');
  const handPaths = [...svg.querySelectorAll('path')].map(path => path.getAttribute('d') ?? '');
  expect(handPaths.some(path => (path.match(/L/g) ?? []).length === 21)).toBe(true);
  expect(handPaths.some(path => (path.match(/h\.01/g) ?? []).length === 21)).toBe(true);
}

it('toggles the fullscreen panel and game toolbar once per click with the existing cursor detector', async () => {
  const fullscreenRoot = document.createElement('section');
  fullscreenRoot.innerHTML = `<header>${trackingToggle}</header>`;
  document.body.append(fullscreenRoot);
  const events = new AbortController();
  bindTrackingToggle(fullscreenRoot, events.signal);
  const globalLines = fullscreenRoot.querySelector<HTMLButtonElement>('header button')!;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: fullscreenRoot });
  try {
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(fullscreenRoot.contains(panelLines())).toBe(true);
    toggle().click(); await settle();
    const cursorTracker = trackers[0];
    panelLines().querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(trackingLinesEnabled()).toBe(false);
    expect(globalLines.getAttribute('aria-pressed')).toBe('false');
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    setLanguage('de'); navigation.refreshLanguage();
    expect(panelLines().getAttribute('aria-pressed')).toBe('false');
    expect(panelLines().getAttribute('aria-label')).toBe('Tracking-Linien');
    expect(panelLines().title).toBe('Tracking-Linien einblenden');
    globalLines.click();
    expect(panelLines().getAttribute('aria-pressed')).toBe('true');
    expect(panelLines().title).toBe('Tracking-Linien ausblenden');
    expect(trackers).toHaveLength(1); expect(getUserMedia).toHaveBeenCalledOnce();
    expect(cursorTracker.dispose).not.toHaveBeenCalled();
    toggle().click();
    expect(cursorTracker.dispose).toHaveBeenCalledOnce();
  } finally {
    events.abort();
    Reflect.deleteProperty(document, 'fullscreenElement');
  }
});

it('shows the game hand stream in the mirrored cursor preview without opening another camera or hand detector', async () => {
  const robot = sharedCamera.claim('game-hand');
  release = robot.release;
  await robot.ready;
  const video = miniature();
  toggle().click(); await settle();
  expect(video.srcObject).toBe(stream);
  expect(video.hidden).toBe(false);
  expect(video.closest('[hidden]')).toBeNull();
  sharedCamera.publishHand(handFixture(performance.now(), false, .3, .55));
  expectHandSkeleton();
  panelLines().click();
  expect(skeleton().style.display).toBe('none');
  sharedCamera.publishHand(handFixture(performance.now(), true));
  expect(skeleton().style.display).toBe('none');
  panelLines().click();
  sharedCamera.publishHand(handFixture(performance.now()));
  expectHandSkeleton();
  expect(trackers).toHaveLength(0); expect(getUserMedia).toHaveBeenCalledOnce();

  navigation.dispose();
  expect(video.srcObject).toBeNull();
  expect(document.querySelector('.hand-navigation')).toBeNull();
  expect(track.stop).not.toHaveBeenCalled();
  sharedCamera.publishHand(handFixture(performance.now()));
  expect(document.querySelector('.tracking-overlay')).toBeNull(); expect(trackers).toHaveLength(0);
  robot.release();
  expect(track.stop).toHaveBeenCalledOnce();
});
