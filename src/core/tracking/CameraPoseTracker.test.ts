import type { PoseFrame } from './types';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraPoseTracker, type TrackingStatus } from "./CameraPoseTracker";

const { makeWorker } = vi.hoisted(() => ({ makeWorker: vi.fn() }));
vi.mock("./pose.worker", () => ({ createPoseWorker: makeWorker }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function cameraStream() {
  const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
  track.stop = vi.fn();
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

function workerDouble() {
  return {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    onmessageerror: null as (() => void) | null,
    terminate: vi.fn(), postMessage: vi.fn(),
    receive(data: unknown) { this.onmessage?.({ data }); }
  };
}

async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

describe("CameraPoseTracker lifecycle", () => {
  let tracker: CameraPoseTracker;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let video: HTMLVideoElement;
  let statuses: ReturnType<typeof vi.fn<(status: TrackingStatus) => void>>;
  let frames: ReturnType<typeof vi.fn<(frame: PoseFrame) => void>>;
  let workers: ReturnType<typeof workerDouble>[];
  let documentEvents: EventTarget & { hidden: boolean };
  let animationFrames: Map<number, FrameRequestCallback>;
  let nextAnimationId: number;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
    workers = [];
    animationFrames = new Map();
    nextAnimationId = 1;
    getUserMedia = vi.fn();
    statuses = vi.fn();
    frames = vi.fn();
    documentEvents = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("document", documentEvents);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("OffscreenCanvas", class {});
    vi.stubGlobal("createImageBitmap", vi.fn().mockImplementation(() => Promise.resolve({ close: vi.fn() })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationId++; animationFrames.set(id, callback); return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => animationFrames.delete(id)));
    makeWorker.mockReset().mockImplementation(() => {
      const worker = workerDouble(); workers.push(worker); return worker;
    });
    video = {
      srcObject: null, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(),
      getClientRects: vi.fn(() => [{}]),
      videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 0
    } as unknown as HTMLVideoElement;
    tracker = new CameraPoseTracker(video, { onStatus: statuses, onFrame: frames });
  });

  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function startTracking() {
    const camera = cameraStream();
    getUserMedia.mockResolvedValueOnce(camera.stream);
    const started = tracker.start();
    await flush();
    workers[0].receive({ type: "ready", delegate: "GPU" });
    await started;
    return camera;
  }

  function tickFrame(time: number) {
    const entry = animationFrames.entries().next().value!;
    animationFrames.delete(entry[0]);
    video.currentTime = time / 1000;
    entry[1](time);
  }

  it("settles stop during a permission prompt and closes a late camera grant", async () => {
    const permission = deferred<MediaStream>();
    const camera = cameraStream();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const starting = tracker.start();
    tracker.stop();
    await starting;
    permission.resolve(camera.stream);
    await flush();
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(makeWorker).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(statuses.mock.lastCall?.[0].state).toBe("idle");
  });

  it('requests 60Hz without making it mandatory and accepts distinct 60Hz frames', async()=>{
    await startTracking();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({video:expect.objectContaining({frameRate:{ideal:60}})}));
    tickFrame(0);await flush();
    workers[0].receive({type:'frame',id:1,frame:{timestampMs:0,landmarks:[],worldLandmarks:[],inferenceMs:8}});
    await vi.advanceTimersByTimeAsync(16.7);tickFrame(16.7);await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
  });

  it('runs the identical pipeline with an owned video-test stream without opening the camera',async()=>{
    const source=cameraStream();const started=tracker.start(source.stream);await flush();
    workers[0].receive({type:'ready',delegate:'GPU'});await started;
    expect(getUserMedia).not.toHaveBeenCalled();expect(video.srcObject).toBe(source.stream);
    tracker.stop();expect(source.track.stop).toHaveBeenCalledOnce();
  });

  it('retries an unreadable default camera with an explicitly identified built-in camera',async()=>{
    Object.assign(navigator.mediaDevices,{enumerateDevices:vi.fn().mockResolvedValue([{kind:'videoinput',deviceId:'built-in',label:'MacBook Air Camera'}])});
    const error=new DOMException('Unavailable','NotReadableError');const source=cameraStream();
    getUserMedia.mockRejectedValueOnce(error).mockResolvedValueOnce(source.stream);
    const started=tracker.start();await flush();workers[0].receive({type:'ready',delegate:'GPU'});await started;
    expect(getUserMedia).toHaveBeenNthCalledWith(2,expect.objectContaining({video:expect.objectContaining({deviceId:{exact:'built-in'}})}));
  });

  it("an old permission result cannot replace a restarted camera session", async () => {
    const firstPermission = deferred<MediaStream>();
    const oldCamera = cameraStream();
    getUserMedia.mockReturnValueOnce(firstPermission.promise);
    const firstStart = tracker.start();
    const currentCamera = await startTracking();
    firstPermission.resolve(oldCamera.stream);
    await firstStart;
    await flush();
    expect(oldCamera.track.stop).toHaveBeenCalledOnce();
    expect(currentCamera.track.stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(currentCamera.stream);
    expect(workers).toHaveLength(1);
  });

  it("stops an acquired stream even if cancelled in the acquisition microtask", async () => {
    const permission = deferred<MediaStream>();
    const camera = cameraStream();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const starting = tracker.start();
    void permission.promise.then(() => tracker.stop());
    permission.resolve(camera.stream);
    await starting;
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(makeWorker).not.toHaveBeenCalled();
  });

  it("cancels model initialization and ignores messages from the terminated worker", async () => {
    const camera = cameraStream();
    getUserMedia.mockResolvedValueOnce(camera.stream);
    const starting = tracker.start();
    await flush();
    tracker.stop();
    workers[0].receive({ type: "ready", delegate: "GPU" });
    await starting;
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(animationFrames.size).toBe(0);
    expect(statuses.mock.lastCall?.[0].state).toBe("idle");
  });

  it("falls back from GPU initialization to a fresh CPU worker", async () => {
    getUserMedia.mockResolvedValueOnce(cameraStream().stream);
    const starting = tracker.start();
    await flush();
    workers[0].receive({ type: "error", message: "WebGL context unavailable" });
    await flush();
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(makeWorker).toHaveBeenNthCalledWith(2, "CPU");
    workers[1].receive({ type: "ready", delegate: "CPU" });
    await starting;
    expect(statuses.mock.lastCall?.[0]).toMatchObject({ state: "tracking", delegate: "CPU" });
  });

  it("transfers only one frame at a time and discards results older than the freshness limit", async () => {
    await startTracking();
    tickFrame(0);
    await flush();
    tickFrame(40);
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(video, { resizeWidth: 640, resizeHeight: 360, resizeQuality: "low" });
    await vi.advanceTimersByTimeAsync(700);
    workers[0].receive({ type: "frame", id: 1, frame: { timestampMs: 0, landmarks: [{ x: 1, y: 1, z: 1 }], worldLandmarks: [], inferenceMs: 700 } });
    expect(frames).not.toHaveBeenCalledWith(expect.objectContaining({ landmarks: [{ x: 1, y: 1, z: 1 }] }));
    tickFrame(720);
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
  });

  it("recovers a hung GPU once, then closes the camera if CPU also hangs", async () => {
    const camera = await startTracking();
    tickFrame(0);
    await flush();
    await vi.advanceTimersByTimeAsync(15250);
    expect(makeWorker).toHaveBeenNthCalledWith(2, "CPU");
    expect(frames).toHaveBeenCalledWith(expect.objectContaining({ landmarks: [], worldLandmarks: [] }));
    workers[1].receive({ type: "ready", delegate: "CPU" });
    await flush();
    tickFrame(15300);
    await flush();
    await vi.advanceTimersByTimeAsync(5500);
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(statuses.mock.lastCall?.[0].state).toBe("error");
    expect(animationFrames.size).toBe(0);
  });

  it('allows a slow first GPU result, discards its stale pose, then accepts fresh results', async () => {
    await startTracking();
    tickFrame(0);
    await flush();
    await vi.advanceTimersByTimeAsync(6000);
    expect(workers).toHaveLength(1);
    workers[0].receive({ type: 'frame', id: 1, frame: { timestampMs: 0, landmarks: [], worldLandmarks: [], inferenceMs: 6000 } });
    expect(frames).not.toHaveBeenCalledWith(expect.objectContaining({ inferenceMs: 6000 }));
    tickFrame(6000);
    await flush();
    await vi.advanceTimersByTimeAsync(40);
    workers[0].receive({ type: 'frame', id: 2, frame: { timestampMs: 6000, landmarks: [], worldLandmarks: [], inferenceMs: 40 } });
    expect(frames).toHaveBeenCalledWith(expect.objectContaining({ timestampMs: 6000 }));
    expect(statuses.mock.lastCall?.[0]).toMatchObject({ delegate: 'GPU', warmingUp: false });
    tickFrame(6040);
    await flush();
    await vi.advanceTimersByTimeAsync(5500);
    expect(makeWorker).toHaveBeenNthCalledWith(2, 'CPU');
  });

  it('uses camera frame callbacks, accepts jitter around 30 FPS, and cancels them on stop', async () => {
    const callbacks = new Map<number, VideoFrameRequestCallback>();
    let id = 1;
    video.requestVideoFrameCallback = vi.fn(callback => { const next = id++; callbacks.set(next, callback); return next; });
    video.cancelVideoFrameCallback = vi.fn(callbackId => { callbacks.delete(callbackId); });
    Object.assign(video, { videoWidth: 640, videoHeight: 480 });
    await startTracking();
    const tick = (now: number) => {
      const [key, callback] = callbacks.entries().next().value!;
      callbacks.delete(key);
      video.currentTime = now / 1000;
      callback(now, {} as VideoFrameCallbackMetadata);
    };
    tick(0);
    await flush();
    expect(createImageBitmap).toHaveBeenCalledWith(video);
    expect(animationFrames.size).toBe(0);
    workers[0].receive({ type: 'frame', id: 1, frame: { timestampMs: 0, landmarks: [], worldLandmarks: [], inferenceMs: 10 } });
    tick(33);
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    tick(66); // Result still in flight: no queuing.
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    vi.mocked(video.getClientRects).mockReturnValue([] as unknown as DOMRectList);
    await vi.advanceTimersByTimeAsync(250);
    expect(callbacks.size).toBe(0);
    expect(animationFrames.size).toBe(1);
    workers[0].receive({ type: 'frame', id: 2, frame: { timestampMs: 33, landmarks: [], worldLandmarks: [], inferenceMs: 10 } });
    tickFrame(250);
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(3);
    tracker.stop();
    expect(callbacks.size).toBe(0);
    expect(animationFrames.size).toBe(0);
  });

  it('falls back when an offscreen preview has layout but no video callbacks', async () => {
    video.requestVideoFrameCallback=vi.fn(()=>123);
    video.cancelVideoFrameCallback=vi.fn();
    await startTracking();expect(animationFrames.size).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(123);
    tickFrame(500);await flush();
    expect(workers[0].postMessage).toHaveBeenCalledOnce();
    expect(animationFrames.size).toBe(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
  });

  it("closes a bitmap that finishes capture after stop without posting it", async () => {
    await startTracking();
    const capture = deferred<ImageBitmap>();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(createImageBitmap).mockReturnValueOnce(capture.promise);
    tickFrame(0);
    tracker.stop();
    capture.resolve(bitmap);
    await flush();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(workers[0].postMessage).not.toHaveBeenCalled();
  });

  it("starts the latest decoded frame immediately after a slow result, without queuing duplicates", async () => {
    await startTracking();
    tickFrame(0);
    await flush();
    await vi.advanceTimersByTimeAsync(33);
    tickFrame(33); // new video is decoded while frame 1 is still in flight
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9);
    workers[0].receive({ type: "frame", id: 1, frame: { timestampMs: 0, landmarks: [], worldLandmarks: [], inferenceMs: 42 } });
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2); // no wait for the 66 ms camera tick
    expect(workers[0].postMessage.mock.lastCall?.[0]).toMatchObject({ timestampMs: 42, id: 2 });
    await vi.advanceTimersByTimeAsync(42);
    workers[0].receive({ type: "frame", id: 2, frame: { timestampMs: 42, landmarks: [], worldLandmarks: [], inferenceMs: 42 } });
    await flush();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2); // no newly decoded video
  });

  it.each([320, 480, 640] as const)("caps capture to %s pixels, preserving the video aspect ratio", async (width) => {
    tracker.setInputWidth(width);
    await startTracking();
    tickFrame(0);
    await flush();
    expect(createImageBitmap).toHaveBeenCalledWith(video, {
      resizeWidth: width, resizeHeight: Math.round(width * 720 / 1280), resizeQuality: "low"
    });
  });

  it("turns off tracks, worker and frame callbacks when the page is hidden", async () => {
    const camera = await startTracking();
    documentEvents.hidden = true;
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(animationFrames.size).toBe(0);
    expect(video.srcObject).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(statuses.mock.lastCall?.[0].state).toBe("idle");
  });

  it("reports camera removal and releases resources", async () => {
    const camera = await startTracking();
    camera.track.dispatchEvent(new Event("ended"));
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(statuses.mock.lastCall?.[0].state).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });
});
