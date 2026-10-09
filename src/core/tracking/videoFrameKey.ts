/** A playing file's currentTime advances between decoded frames. Prefer the
 * decoded-frame counter so a 30Hz source cannot masquerade as 60 new images. */
export function videoFrameKey(video:HTMLVideoElement):number{
  // WebKit's playback-quality counters are not reliable for MediaStream
  // playback on all shipped Safari versions. They can freeze above zero even
  // while the camera/clock advances, making every later image look duplicated.
  if (video.srcObject) return video.currentTime;
  const quality=video.getVideoPlaybackQuality?.();
  return quality && quality.totalVideoFrames>0 ? quality.totalVideoFrames-quality.droppedVideoFrames : video.currentTime;
}
