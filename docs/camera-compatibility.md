# Camera frame freshness on Safari

Verified on a connected iPhone running iOS 26.6.2 on 2026-10-09, with the production game and the front-facing camera.

The device's `requestVideoFrameCallback` metadata reported `mediaTime: 0` on consecutive new camera frames while `presentedFrames` increased. The video's `currentTime` also advanced, but `getVideoPlaybackQuality()` reported zero total/dropped frames.

Previously, the tracker deduplicated callback frames using `mediaTime`. This accepted the first image, rejected every subsequent image as a duplicate, and eventually triggered the five-second no-fresh-camera-frame watchdog. Cleanup then removed the video stream, explaining why the preview briefly appeared before disappearing.

The tracker now counts actual video-frame callbacks instead of using their media timestamps. A worker result can consume a newer callback frame immediately, but cannot resend the same frame. Only one image is in flight. The animation-frame compatibility path uses `currentTime` for live streams rather than relying on playback-quality counters; file playback retains decoded-frame deduplication. Background-page cleanup and real stream/worker failure handling remain active.

Validation: 157 passing tests; a regression with unchanged media timestamps/counters lasting longer than the watchdog; a real browser pipeline processing 204 synthetic frames over eight seconds under the site's headers; and the connected iPhone showing a live, unmuted front camera, advancing playback beyond two minutes, a running game and fresh calibrated body tracking. The iPhone inspection read metadata and interface state, without recording or uploading camera images. This is a device-specific functional check, not an exhaustive mobile compatibility or sustained thermal benchmark.
