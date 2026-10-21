import { afterEach, describe, expect, it, vi } from 'vitest';
import { poseWorkerMain } from './pose.worker';
import { createPoseImageInput } from './PoseImageInput';

afterEach(() => vi.unstubAllGlobals());
describe('pose worker image ownership and fallback', () => {
  async function setup() {
    const scope = { onmessage: null as unknown as (e: {data: unknown}) => Promise<void>, postMessage: vi.fn() };
    vi.stubGlobal('self', scope); vi.stubGlobal('OffscreenCanvas', class {});
    const detectForVideo = vi.fn(() => ({ landmarks: [], worldLandmarks: [] }));
    const runtime = { FilesetResolver: { forVisionTasks: vi.fn() },
      PoseLandmarker: { createFromOptions: vi.fn(async () => ({ detectForVideo })) } };
    poseWorkerMain(vi.fn(async () => runtime) as never, createPoseImageInput);
    await scope.onmessage({ data: { type:'init', runtimeUrl:'local-test', delegate:'GPU' } });
    return { scope, detectForVideo };
  }
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
