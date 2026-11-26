import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BladeCamera } from './BladeCamera';
import type { SwordFrame } from '../tracking/sword/types';

const mocked = vi.hoisted(() => ({
  ready: vi.fn<() => Promise<boolean>>(), started: vi.fn(), stopped: vi.fn(), released: vi.fn(), publish: vi.fn(),
  video: { pause: vi.fn(), play: vi.fn(), srcObject: {} },
  callback: undefined as ((frame: SwordFrame | null) => void) | undefined,
}));
vi.mock('../tracking/CameraFeed', () => ({
  cameraFeed: { video: mocked.video, running: true, whenReady: mocked.ready, claimInput: () => mocked.released, publishSword: mocked.publish },
}));
vi.mock('../tracking/sword/CameraSwordTracker', () => ({
  CameraSwordTracker: class {
    running = false;
    constructor(video: HTMLVideoElement, receive: (frame: SwordFrame | null) => void) {
      expect(video).toBe(mocked.video);
      mocked.callback = receive;
    }
    start() { mocked.started(); this.running = true; }
    stop() { mocked.stopped(); this.running = false; }
  },
}));

describe('wand consumer of the shared preview', () => {
  let camera: BladeCamera;
  const frame = (): SwordFrame => ({
    timestampMs: performance.now(), base: { x: .16, y: .2 }, tip: { x: .54, y: .25 }, confidence: 1,
    imageAspectRatio: 4 / 3, source: 'four-ring-2d',
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', { hidden: false });
    mocked.ready.mockResolvedValue(true);
    camera = new BladeCamera(vi.fn());
  });
  afterEach(() => { camera.stop(); vi.unstubAllGlobals(); });

  it('publishes valid wand measurements and clears only its layer on stop', async () => {
    expect(await camera.start()).toBe(true);
    mocked.callback?.(frame());
    expect(mocked.publish).toHaveBeenCalledWith(expect.objectContaining({ source: 'four-ring-2d' }));
    camera.stop();
    expect(mocked.stopped).toHaveBeenCalledOnce();
    expect(mocked.released).toHaveBeenCalledOnce();
    expect(mocked.publish).toHaveBeenLastCalledWith(null);
    expect(mocked.video.pause).not.toHaveBeenCalled();
    expect(mocked.video.play).not.toHaveBeenCalled();
    expect(mocked.video.srcObject).not.toBeNull();
  });

  it('ignores a late ready result after cancellation and does not start in the background', async () => {
    let ready!: (value: boolean) => void;
    mocked.ready.mockReturnValueOnce(new Promise(resolve => { ready = resolve; }));
    const pending = camera.start();
    camera.stop();
    ready(true);
    expect(await pending).toBe(false);
    Object.assign(document, { hidden: true });
    expect(await camera.start()).toBe(false);
    expect(mocked.started).not.toHaveBeenCalled();
  });
});
