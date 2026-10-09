import {it,expect} from 'vitest';
import {videoFrameKey} from './videoFrameKey';
it('deduplicates decoded frames even if the playback clock moves',()=>{
  const video={currentTime:1,getVideoPlaybackQuality:()=>({totalVideoFrames:30,droppedVideoFrames:2})};
  const a=videoFrameKey(video as HTMLVideoElement);video.currentTime=1.0167;
  expect(videoFrameKey(video as HTMLVideoElement)).toBe(a);expect(a).toBe(28);
});
it('does not treat a stalled live-camera playback counter as a frozen stream',()=>{
  const video={srcObject:{},currentTime:1,getVideoPlaybackQuality:()=>({totalVideoFrames:1,droppedVideoFrames:0})};
  const first=videoFrameKey(video as HTMLVideoElement);video.currentTime=1.033;
  expect(videoFrameKey(video as HTMLVideoElement)).toBe(1.033);
  expect(videoFrameKey(video as HTMLVideoElement)).not.toBe(first);
});
