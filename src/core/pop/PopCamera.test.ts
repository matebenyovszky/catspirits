import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopCamera } from './PopCamera';
const mocks = vi.hoisted(() => ({ poseStart: vi.fn(), poseStop: vi.fn(), swordStart: vi.fn(async () => true), swordStop: vi.fn(), status: null as ((s: {state: string}) => void) | null, width: vi.fn() }));
vi.mock('../tracking/CameraPoseTracker', () => ({ CameraPoseTracker: class {
  constructor(_v: unknown, callbacks: {onStatus: (s: {state: string}) => void}) { mocks.status = callbacks.onStatus; }
  setInputWidth = mocks.width; async start() { await mocks.poseStart(); mocks.status?.({state:'tracking'}); } dispose = mocks.poseStop;
} }));
vi.mock('../blade/BladeCamera', () => ({ BladeCamera: class { running = true; start = mocks.swordStart; stop = mocks.swordStop; } }));
let camera: PopCamera;
beforeEach(() => { vi.stubGlobal('document', { hidden: false }); Object.values(mocks).forEach(m => { if (vi.isMockFunction(m)) m.mockClear(); }); camera = new PopCamera({} as HTMLVideoElement, vi.fn(), vi.fn()); });
afterEach(() => { camera.stop(); vi.unstubAllGlobals(); });
it('loads only the selected tracker, closes it on mode switch and uses modest hand input resolution', async () => {
  await camera.start('sword'); expect(mocks.poseStart).not.toHaveBeenCalled(); expect(camera.running).toBe(true);
  await camera.start('hands'); expect(mocks.swordStop).toHaveBeenCalled(); expect(mocks.width).toHaveBeenCalledWith(320); expect(camera.running).toBe(true);
  camera.stop(); expect(mocks.poseStop).toHaveBeenCalled(); expect(camera.running).toBe(false);
});
it('cannot revive a canceled hand startup or start on a hidden page', async () => {
  let done!: () => void; mocks.poseStart.mockReturnValueOnce(new Promise<void>(r => { done = r; }));
  const pending = camera.start('hands'); for (let i = 0; i < 20 && !done; i++) await Promise.resolve();
  camera.stop(); done(); expect(await pending).toBe(false); expect(camera.running).toBe(false);
  Object.assign(document, { hidden: true }); expect(await camera.start('sword')).toBe(false);
});
