/** A playing file's currentTime advances between decoded frames. Prefer the
 * decoded-frame counter so a 30Hz source cannot masquerade as 60 new images. */
export function videoFrameKey(video:HTMLVideoElement):number{
  const quality=video.getVideoPlaybackQuality?.();
  return quality && quality.totalVideoFrames>0 ? quality.totalVideoFrames-quality.droppedVideoFrames : video.currentTime;
}
