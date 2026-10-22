# Neon Blade — optional camera sword game

Open [Neon Blade](https://catspirits.com/?game=blade). The Cyber Jumper home screen links to it; both games retain English, Hungarian and German and browser-language selection. The jumping game does not require a wand.

Neon Blade is a separate, lazy-loaded, 60-second crystal-slicing game. Three increasingly frequent waves, consecutive-hit multipliers up to 4×, and triple-value gold crystals reward moving cuts. Each crystal has a fixed arrow: cut in that direction (within 45 degrees) with a moving blade. A wrong direction or missed crystal resets the combo. Red, spiked X hazards appear from wave two: touching one costs up to 20 points and breaks the combo. Let them pass. Wiggling inside a wrongly struck crystal does not repair the cut; leave it before trying again. There is no damage, account, server leaderboard or network gameplay. Mouse/touch practice has a separate local best score from camera play.

## Camera setup

Use the existing **50 cm, approximately 25 mm diameter, soft-ended pink/green marker wand** from Puppet2. Measured from the bottom of the grip:

| Band | Colour | Start–end | Centre |
| --- | --- | --- | --- |
| 1 | Pink | 12–18 cm | 15 cm |
| 2 | Pink | 22–25 cm | 23.5 cm |
| 3 | Green | 34–37 cm | 35.5 cm |
| 4 | Green | 42–48 cm | 45 cm |

Bands wrap around the wand. Show all four to acquire; three can also acquire a compatible, unambiguous fit. Two fresh identified rings may maintain an existing fit. Diffuse light and a plain background help. Use a soft play wand, leave clear space, and keep the phone stable. Only the section between the outer band centres is the virtual blade. It is a 2D image-plane measurement, not a calibrated 3D sword or a general detector for arbitrary swords.

Press **Camera & marker wand**, allow video access, show the bands, then start. No full-body framing or body-model download is needed. The camera image and arena share the same aspect ratio and mirrored coordinates, without cropping the camera frame. No software zoom or higher camera resolution was added.

Drag while pressed for mouse/touch practice. Pause stops the camera. Resume explicitly restarts it and waits for a fresh measurement. Hidden pages stop camera, audio and animation; returning to the page never silently reacquires the camera. Every rejected/missing observation immediately breaks the collision sweep. The clock and loss notice tolerate gaps up to 240 ms from the last accepted capture, so a single blurred frame does not freeze gameplay. Visible blade freshness and collision input remain limited to 120 ms; a stale or rejected frame never earns points. Longer loss freezes the clock and targets; a stopped camera pauses immediately.

## Ported tracking

- Ordered four-ring geometry, bounded projective fit, partial-occlusion identity, ring-scale diagnostics and ambiguity rejection.
- Native NV12/BGRA pixel input for supported colour metadata and geometry. Other formats use browser RGBA conversion, with ImageBitmap/canvas and pure JavaScript fallbacks.
- A self-hosted 6.27 kB scalar WASM kernel with fixed 7 MiB memory; one frame in flight, reused buffers, ROI search and immediate full-frame reacquisition.
- Impossible single-measurement jumps are rejected; a second nearby sample can confirm a changed position.
- Bounded render-only continuation between measurements (up to 50 ms / .04 image height). No predicted position is passed to scoring.
- Swept, moving-target collisions use fresh measurements only. Stationary blades, duplicate/stale timestamps, changing support rings, aspect changes, loss/reacquisition and offscreen geometry cannot bridge a cut.
- Safari callback serials preserve new frames even when `mediaTime` and playback counters are frozen. Capture-completion callbacks do not process the same decoded frame repeatedly.

The original two-colour detector and camera-sharing `JumperCamera.setSwordEnabled` integration remain for compatibility; the public Neon Blade mode uses the four-ring detector independently of body tracking.

## Budget and privacy

Neon Blade uses Canvas 2D, a fixed ten-target pool and bounded particles. No Three.js, MediaPipe model, AprilTag, native helper, WebGPU neural runtime or new npm runtime dependency is loaded for it. Rendering caps at 60 Hz; idle menus do not animate. Crystal glows and hit-number glyphs are pre-rendered at resize, and the adaptive collision search has a fixed 128-node budget. Unresolved grazing contacts fail closed. Canvas pixels are capped at 1440×1080 / DPR 1.5. Camera frames remain on the device and are neither recorded nor uploaded. The colour kernel is hosted on the same origin, with JavaScript fallback if it cannot load.

Only language and best scores are persisted; the new score key is `catspirits.neon-blade.best.v2` (the direction/hazard rules start a new record; the earlier v1 score is left intact). Cloudflare still handles ordinary hosting/security metadata, as explained in the in-game privacy information and [security review](security-review.md).

## Rebuilding the kernel

Source: `tools/wasm/color-components.ts`, adapted from the current Puppet2 working tree. The committed binary was rebuilt byte-for-byte with AssemblyScript **0.28.20**:

```sh
npm exec --package=assemblyscript@0.28.20 -- asc tools/wasm/color-components.ts -o src/core/tracking/sword/color-components.wasm -O3 --runtime stub --initialMemory 112 --maximumMemory 112 --noAssert
```

AssemblyScript compilation is only needed when changing the kernel, not to install/build/play the game. Its Apache 2.0 licence and upstream NOTICE are included in distributed notices. The game-authored source remains MIT licensed.

Tests cover RGB/YUV parity, colour metadata fallback, projective geometry, every ring-occlusion mask, stale samples, swept hits, lifecycle cancellation, hidden-page shutdown and all three interfaces. Synthetic camera-stream tests exercise the real browser worker. They do not establish real-person accuracy, mobile thermals or real-wand performance on every phone; those need a physical camera/wand trial.
