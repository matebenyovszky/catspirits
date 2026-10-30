# Neon Pop — camera target-practice test game

[Play](https://catspirits.com/?game=pop). Neon Pop is the third Catspirits game and is labelled as a test game while camera feel is being refined. It is available in English, Hungarian and German.

Choose one input in the menu:

- **Camera · hands:** the existing local pose model follows each visible wrist. Keep shoulders, elbows and hands in view. Move either coloured wrist circle through a target. Both hands can hit at once; one disappearing hand does not replace the other hand's identity. This is wrist tracking, not finger/gesture recognition.
- **Camera · marker wand:** use the [four-band soft wand](sword-tracking.md). Sweep the glowing section through a target in any direction. No body model is loaded in this mode.
- **Mouse/touch:** tap a visible target. No camera starts.

Rounds last 45 active seconds across three waves. A target's outer ring shows how long it remains available. Every visible target is active; one sweep can clear several. Gold is worth three times as much and consecutive hits build a multiplier up to 4×. Letting a target expire resets the combo. A stationary hand or blade does not automatically collect newly appearing targets.

The game measures contacts between fresh observations rather than scoring render predictions. Hand measurements are limited to 200 ms age and 160 ms inter-frame gaps; wand measurements retain the existing 120 ms bound and ring-support continuity. A lost observation breaks hit history. The clock tolerates a short gap (360 ms from the last hand capture, 240 ms for a wand), then pauses. Pause, hidden pages, cancellation and round end stop the stream. Returning to a hidden page does not restart the camera automatically.

Input is processed on the device. There is no recording, image upload, account or remote inference. Only the selected tracker runs. The body model/runtime and colour kernel are hosted by this site, with no new dependencies or permissions. Best scores are stored locally under `catspirits.neon-pop.best.v1`, separately for hands, wand and touch.

Tests cover both hand identities, five-target blade sweeps, missing/stale/implausible input, targets that appear between observations, camera cancellation and shutdown, touch scoring and all three UI languages. Synthetic wrist input verifies the control pipeline; it is not evidence of real-hand recognition quality on every phone. Physical trials with different lighting, framing and devices are still needed.

Level 1 accepts either hand, the marker wand or touch. Level 2 is a camera-and-hands colour-matching challenge: the turquoise, one-dot hand circle hits turquoise, one-dot targets; the pink, two-dot hand circle hits pink, two-dot targets. A wrong hand does not score and the target remains available for the matching hand. A small gold diamond marks a triple-point target without replacing its hand colour. Level 2 scores are stored separately under `catspirits.neon-pop.best.v2`. As with level 1, the pose model must see the player's wrists and elbows; colour matching is based on each tracked hand identity, not position on the mirrored screen.
