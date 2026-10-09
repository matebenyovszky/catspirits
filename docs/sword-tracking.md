# Optional sword adventure — preparation / Opcionális kardos kaland

The public Catspirits game focuses on body movement tracked by a camera. Sword tracking is an optional extension prepared for the next development session, not an enabled game mode. No wand is needed to jump, duck or lean.

## Already included

- `src/core/tracking/sword/ColorWandDetector.ts`: finds two distinct magenta/cyan bands in measured camera frames. Pure JavaScript, reused buffers, no extra neural model or service.
- `CameraSwordTracker.ts` and `sword.worker.ts`: share the existing authorized video. At most one frame is in flight; frames are not recorded, uploaded or queued. VideoFrame readback has an ImageBitmap/canvas fallback.
- `types.ts`: normalized, unmirrored image-plane endpoints, confidence and timestamps; stale measurements expire after 120 ms.
- `sweep.ts` and `SideGameSimulation.ts`: test a measured blade segment's swept path against moving targets. A stationary, obscured, ambiguous or stale blade cannot award a hit.
- `SwordGameView.ts`: pooled Three.js blade and target rendering for an image-plane game layer.
- The detector, frame transport, worker fallback and collision tests from the original prototype, plus Catspirits camera lifecycle tests.

This code is self-contained in Catspirits. It has no runtime dependency on the original application. No WASM/AprilTag or new package dependency is required by this prepared detector.

## Catspirits integration point

`JumperCamera.setSwordEnabled(true)` lazily imports the tracker after the normal camera has been authorized and started. `swordInput()` exposes only fresh, valid measured endpoints. Passing `false`, stopping the camera or a camera failure terminates the sword worker and clears observations. Canceling an in-progress import cannot restart it. A sword failure leaves body-motion controls usable.

The public UI does not call this method. With the extension off, no sword worker is downloaded or started and no sword frames are processed. The help screen labels the future mode as optional and coming soon.

## Next development session

1. Test a soft marker wand with separate magenta and cyan bands in real camera lighting, including blur, occlusion and losing/reacquiring either band.
2. Add an explicit opt-in mode selector to camera setup, once the playable interaction is ready. Default sword tracking remains off.
3. Connect the measured blade to the renderer and targets, decide how the sword adventure shares the current worlds, and keep the body-only game available.
4. Test body and sword tracking together on desktop/mobile. Measure frame age, CPU use, responsiveness and real hit accuracy; synthetic tests do not establish human performance.
5. Check all three languages, pause, hidden-tab shutdown, tracking loss, keyboard fallback and camera permission failures.

The blade is a 2D measurement on a 2.5D game layer. The prototype does not reconstruct calibrated metric 3D position, depth, axial rotation or wrist IK. Occlusion must stop hit detection; displaying an estimate must never invent a measured cut.

## Magyar összefoglaló

A kardkövetés a Catspirits önálló kódjába került, külön betölthető, kikapcsolt bővítésként. A puha jelölőbot elkülönülő magenta és cián sávját követi, ugyanazt a már engedélyezett kameraképet használja. A mozgásos alapjátékhoz nem kell kard.

A következő alkalom feladata a valódi jelölőbotos próba, az opcionális mód választója és a játékbeli találatok/megjelenítés bekötése. A nyilvános felület addig „hamarosan, opcionális” jelzést mutat. Ez nem kalibrált térbeli kardkövetés; a tesztek szintetikus pontossága nem helyettesíti az emberes próbát.
