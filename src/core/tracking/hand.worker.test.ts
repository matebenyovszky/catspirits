import { afterEach, describe, expect, it, vi } from 'vitest';
import { handWorkerMain } from './hand.worker';
import { createPoseImageInput } from './PoseImageInput';

afterEach(() => vi.unstubAllGlobals());
describe('hand worker image ownership and fallback', () => {
  async function setup(withArm = false, maxHands: 1 | 2 = 1, cadence?: { handMs: number; bodyMs: number }) {
    const scope = { onmessage: null as unknown as (e: {data: unknown}) => Promise<void>, postMessage: vi.fn() };
    vi.stubGlobal('self', scope); vi.stubGlobal('OffscreenCanvas', class {});
    const detectForVideo = vi.fn(() => ({ landmarks: [] as { x: number; y: number; z: number }[][], worldLandmarks: [] as { x: number; y: number; z: number }[][], handedness: [[{categoryName:"Right",score:.98}]] }));
    const detectBody = vi.fn(() => ({ landmarks: [], worldLandmarks: [] }));
    const runtime = { PoseLandmarker: { createFromOptions: vi.fn(async () => ({ detectForVideo: detectBody })) }, FilesetResolver: { forVisionTasks: vi.fn() },
      HandLandmarker: { createFromOptions: vi.fn(async () => ({ detectForVideo })) } };
    handWorkerMain(vi.fn(async () => runtime) as never, createPoseImageInput);
    await scope.onmessage({ data: { type:'init', runtimeUrl:'local-test', delegate:'GPU', maxHands, cadence, ...(withArm ? {poseModelUrl:'local-pose-model'} : {}) } });
    expect(runtime.HandLandmarker.createFromOptions).toHaveBeenCalledWith(undefined, expect.objectContaining({ numHands: maxHands, runningMode: 'VIDEO', baseOptions: expect.objectContaining({ delegate: 'GPU' }) }));
    return { scope, detectForVideo, detectBody };
  }
  it('shares robot hand/body inference and throttles body work without extending its timestamp', async () => {
    const {scope, detectForVideo, detectBody} = await setup(true);
    for (const timestampMs of [100,133,166,233]) {
      const bitmap = {close:vi.fn()};
      await scope.onmessage({data:{type:'frame',id:timestampMs,timestampMs,bitmap}});
      expect(bitmap.close).toHaveBeenCalledOnce();
    }
    expect(detectForVideo).toHaveBeenCalledTimes(4); expect(detectBody).toHaveBeenCalledTimes(2);
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'frame', frame:expect.objectContaining({armTimestampMs:233, armLandmarks:[]})}));
  });
  it('publishes both observations while keeping the first hand for legacy navigation', async () => {
    const { scope, detectForVideo } = await setup(true, 2);
    const first = [{ x: .7, y: .4, z: 0 }];
    const second = [{ x: .28, y: .4, z: 0 }];
    detectForVideo.mockReturnValueOnce({
      landmarks: [first, second], worldLandmarks: [first, second],
      handedness: [[{ categoryName: 'Left', score: .93 }], [{ categoryName: 'Right', score: .86 }]],
    });
    await scope.onmessage({ data: { type: 'frame', id: 1, timestampMs: 200, bitmap: { close: vi.fn() } } });
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      frame: expect.objectContaining({ landmarks: first, handedness: 'left', hands: [
        { side: 'Left', score: .93, points: first, worldPoints: first },
        { side: 'Right', score: .86, points: second, worldPoints: second },
      ] }),
    }));
  });
  it('keeps a cached hand sample at its original time on a fresh body frame', async () => {
    const { scope, detectForVideo, detectBody } = await setup(true, 2, { handMs: 40, bodyMs: 31 });
    for (const timestampMs of [100, 133, 166]) {
      await scope.onmessage({ data: { type: 'frame', id: timestampMs, timestampMs, bitmap: { close: vi.fn() } } });
    }
    expect(detectForVideo).toHaveBeenCalledTimes(2);
    expect(detectBody).toHaveBeenCalledTimes(3);
    expect(scope.postMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({
      id: 133, frame: expect.objectContaining({ timestampMs: 133, handTimestampMs: 100, armTimestampMs: 133 }),
    }));
  });
  it('uses direct native frames and always closes transferred ownership, including failed inference', async () => {
    const {scope,detectForVideo} = await setup();
    const videoFrame = {displayWidth:640,displayHeight:480,format:'NV12',close:vi.fn()};
    const data = {type:'frame',id:1,timestampMs:10,videoFrame,width:640,height:480};
    await scope.onmessage({data});
    expect(detectForVideo).toHaveBeenCalledWith(videoFrame,10);
    expect(videoFrame.close).toHaveBeenCalledTimes(1);
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'frame'}));
    detectForVideo.mockImplementationOnce(() => { throw new Error('GPU source unsupported'); });
    await scope.onmessage({data:{...data,id:2,timestampMs:43}});
    expect(videoFrame.close).toHaveBeenCalledTimes(2);
    expect(scope.postMessage).toHaveBeenLastCalledWith({type:'input-error',id:2,message:'GPU source unsupported'});
    const bitmap = {close:vi.fn()};
    await scope.onmessage({data:{type:'frame',id:3,timestampMs:76,bitmap}});
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type:'frame'}));
  });
  it('keeps model errors on the established bitmap GPU/CPU recovery path', async () => {
    const {scope,detectForVideo} = await setup();
    detectForVideo.mockImplementationOnce(() => {throw new Error('model failed');});
    const bitmap = {close:vi.fn()};
    await scope.onmessage({data:{type:'frame',id:1,timestampMs:0,bitmap}});
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(scope.postMessage).toHaveBeenLastCalledWith({type:'error',id:1,message:'model failed'});
  });
});
