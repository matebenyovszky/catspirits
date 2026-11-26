import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopCamera } from './PopCamera';
const mocks = vi.hoisted(() => ({
  ready: vi.fn<() => Promise<boolean>>(), body: vi.fn(), detach: vi.fn(), release: vi.fn(),
  swordStart: vi.fn(async () => true), swordStop: vi.fn(),
}));
vi.mock('../tracking/CameraFeed', () => ({
  cameraFeed: { whenReady: mocks.ready, running: true, onBody: mocks.body, claimInput: () => mocks.release },
}));
vi.mock('../blade/BladeCamera', () => ({
  BladeCamera: class { running = true; start = mocks.swordStart; stop = mocks.swordStop; },
}));
let camera: PopCamera;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', { hidden: false });
  mocks.ready.mockResolvedValue(true);
  mocks.body.mockReturnValue(mocks.detach);
  camera = new PopCamera(vi.fn(), vi.fn());
});
afterEach(() => { camera.stop(); vi.unstubAllGlobals(); });

it('uses the shared body feed for hands and detaches the wand on a mode switch', async () => {
  await camera.start('sword');
  expect(mocks.body).not.toHaveBeenCalled();
  expect(camera.running).toBe(true);
  await camera.start('hands');
  expect(mocks.swordStop).toHaveBeenCalledOnce();
  expect(mocks.body).toHaveBeenCalledOnce();
  expect(camera.running).toBe(true);
  camera.stop();
  expect(mocks.detach).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(camera.running).toBe(false);
});
it('cannot revive a canceled subscription after the shared feed becomes ready', async () => {
  let done!: (yes: boolean) => void;
  mocks.ready.mockReturnValueOnce(new Promise(resolve => { done = resolve; }));
  const pending = camera.start('hands');
  camera.stop();
  done(true);
  expect(await pending).toBe(false);
  expect(camera.running).toBe(false);
  Object.assign(document, { hidden: true });
  expect(await camera.start('sword')).toBe(false);
  expect(mocks.swordStart).not.toHaveBeenCalled();
});
