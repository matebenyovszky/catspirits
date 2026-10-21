# Puppet2 tracking port — 2026-10-21

This update selectively imports the current Puppet2 working-tree tracking improvements (including changes beyond its committed HEAD). Catspirits remains a complete standalone repository. No local paths, native services, private photographs, recordings or development fixtures from that project are distributed.

## Applied

- Four-ring pink/green wand detector, projective/occlusion handling, scalar WASM/native camera planes and their regression tests. The compiler source is included and the binary was independently rebuilt byte-for-byte.
- Measurement plausibility gate and bounded display-only predictor. New game scoring consumes measured endpoints, never predicted animation.
- Native `VideoFrame` body-input transport with worker-side resize, avoiding the main-thread ImageBitmap resize when supported. The established bitmap path remains the one-time fallback for unsupported native frames; GPU/CPU model fallback remains available.
- Existing self-hosted MediaPipe runtime/model URLs, input resolutions, camera permission lifecycle and Safari callback timestamp fix remain intact. No extra camera is opened and no frame queues are added.
- Separate Neon Blade game with lazy code, local best scores, camera-first UI and mouse/touch practice. The jump game links to it.

## Deliberately not imported

- Experimental LiteRT/WebGPU neural inference: adds a detector/model pipeline and dependencies, has documented accuracy differences, and was not the original default either. Stable mobile inference remains MediaPipe GPU with CPU fallback.
- Apple Vision/native helpers, avatar IK, developer benchmark fixtures, AprilTag experiments and SIMD avatar smoothing: not needed by this self-contained image-plane game.
- BodyMotionInput tuning: it already matches the current Puppet2 implementation; the user's working jump thresholds were not changed.

This is a compatibility and resource-budget decision, not a claim that the new game is faster by the same ratio as Puppet2's desktop benchmarks. Those measurements involved different rendering and device conditions. The code reduces unnecessary downloads/copies; sustained real-device latency and accuracy need fresh measurements.
