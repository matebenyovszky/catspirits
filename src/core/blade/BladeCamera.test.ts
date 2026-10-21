import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BladeCamera } from './BladeCamera';
const { started, stopped } = vi.hoisted(() => ({ started: vi.fn(), stopped: vi.fn() }));
vi.mock('../tracking/sword/CameraSwordTracker', () => ({ CameraSwordTracker: class { running = false; start() { started(); this.running = true; } stop() { stopped(); this.running = false; } } }));
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
describe('standalone sword camera ownership', () => {
  let camera: BladeCamera, video: HTMLVideoElement, permission: ReturnType<typeof vi.fn<() => Promise<MediaStream>>>;
  const stream = () => { const track = Object.assign(new EventTarget(), { stop: vi.fn() }); return { track, media: { getTracks: () => [track] } as unknown as MediaStream }; };
  beforeEach(() => {
    started.mockClear(); stopped.mockClear(); permission = vi.fn();
    vi.stubGlobal('document', { hidden: false }); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: permission } });
    video = { play: vi.fn(async () => {}), pause: vi.fn(), srcObject: null } as unknown as HTMLVideoElement;
    camera = new BladeCamera(video, vi.fn());
  });
  afterEach(() => { camera.stop(); vi.unstubAllGlobals(); });
  it('closes a permission grant that arrives after cancel, without starting a worker', async () => {
    const source = stream(); let grant!: (s: MediaStream) => void;
    permission.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const start = camera.start(); camera.stop(); grant(source.media); await start;
    expect(source.track.stop).toHaveBeenCalledOnce(); expect(started).not.toHaveBeenCalled(); expect(video.srcObject).toBeNull();
  });
  it('cannot let an old start replace a new camera and stops on an ended track', async () => {
    const old = stream(), current = stream(); let grant!: (s: MediaStream) => void;
    permission.mockReturnValueOnce(new Promise(resolve => { grant = resolve; })).mockResolvedValueOnce(current.media);
    const first = camera.start(); await camera.start(); grant(old.media); await first;
    expect(video.srcObject).toBe(current.media); expect(old.track.stop).toHaveBeenCalledOnce(); expect(started).toHaveBeenCalledOnce();
    current.track.dispatchEvent(new Event('ended')); expect(camera.running).toBe(false); expect(video.srcObject).toBeNull();
  });
  it('releases the stream when playback fails or the page hides while permission is pending', async () => {
    const source = stream(); permission.mockResolvedValue(source.media); vi.mocked(video.play).mockRejectedValueOnce(new Error('play'));
    await expect(camera.start()).rejects.toThrow('play'); expect(source.track.stop).toHaveBeenCalledOnce();
    let grant!: (s: MediaStream) => void; permission.mockReturnValueOnce(new Promise(resolve => { grant = resolve; }));
    const late = stream(), start = camera.start(); Object.assign(document, { hidden: true }); grant(late.media); await start; await flush();
    expect(late.track.stop).toHaveBeenCalledOnce(); expect(started).not.toHaveBeenCalled();
  });
});
