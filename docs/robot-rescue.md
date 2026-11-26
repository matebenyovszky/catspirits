# Bit Rescue — virtual robot teleoperation

Open `/?game=robot` (English/Hungarian/German), or choose **Bit Rescue** in any game's navigation. This is a local browser simulation. It does not connect to a physical robot, upload camera images, record demonstrations or train a model.

## Play

Guide three numbered energy cells to matching docks. Choose **Arm and hand tracking** to steer with one tracked hand, or use the hand cursor controls. Show one hand together with its shoulder and elbow. The self-hosted Hand Landmarker and Pose Lite models share the same camera, worker and video preview as the rest of the app. Each body observation retains its own timestamp, so a fresh hand frame leaves the age of cached elbow landmarks unchanged.

- Mouse/touch: click a destination or drag. Keyboard: arrows or WASD.
- Camera: by default open the hand to arm control, close it to grab and open it to release. At least three extended or folded fingers determine the full-hand state; ambiguous shapes do not change it. Optional pinch mode retains thumb/index-distance control. Both modes use hysteresis and at least three measured frames over 100 ms to reject jitter. On tracking loss the arm and held object freeze. Reacquisition while holding requires the closed gesture first, then a new opening to release.
- Mouse/touch: hold the gripper still near a cell for 0.65 seconds to grab; hold it at the matching dock to deliver. The ring indicates progress. **Space** or **Grab / release** operates the gripper explicitly.
- **Bit controls** / **Enter** hands control to the autopilot. **I control** / **M**, a movement key or a pointer press takes control back. Ownership changes preserve the held cell, deliveries, pose and time; stale destinations are flushed.
- **Mission 1: First docking** has a clear workspace. Bit can complete it independently.
- **Mission 2: The detour** has a shield. Bit approaches goals directly and holds at the shield; manually guide the gripper above or below it, then hand back. Articulated links travel above the field. Only the tool has planar collision constraints; this is not a full rigid-body/contact simulation.
- Pause and completion stop arm control. The shared camera preview remains available. Resume to continue a paused mission. Progress exists in the current page session and resets on reload.

The autopilot is **rule-based, not a learned AI**. It selects the next cell or the held cell's dock from the current observation. It intentionally does not plan detours. Interventions do not train or change it.

## Controller boundary and future hardware

`src/core/robot/RobotSimulation.ts` defines `RobotObservation`, `RobotCommand` and `RobotController`. The injected `DirectController` can later be replaced by a learned controller. Observations are detached snapshots of the tool, cells, docks, fields and grip state. Commands request a tool-space target and optional grip action. The simulation applies reach limits, bounded speed and swept tool collision checks regardless of control ownership.

The 3D view uses inverse kinematics for two fixed-length links. A visible body wrist is matched geometrically to the tracked hand, and that arm identity stays locked for the session. Measured shoulder–elbow direction controls the elbow bend plane while the tool retains its bounded table-space mapping. Missing or stale shoulder/elbow/wrist observations stop manual movement and preserve held objects. This is retargeting to robot link lengths and workspace limits, not calibrated one-to-one reconstruction of a human arm. Rendering is capped at 60 updates/s, DPR at 1.25 and HUD at 10 updates/s. The welcome screen has no animation loop. The robot route is lazy-loaded; pointer controls do not start MediaPipe. The robot route loads Three.js and its 3D view automatically. There is no 2D view selector or automatic 2D fallback; WebGL failure stops control and offers retry.

Physical integration is absent. A hardware adapter will need calibrated coordinates, joint/velocity/force limits, collision handling, stale-command timeouts, explicit enable and an independent stop mechanism. Simulation limits are not a hardware safety system. The existing site policy still disables USB. Hardware integration and demonstration collection are separate implementation tasks.

## Validation

Tests cover autonomous completion, a blocked route followed by manual recovery and handback, docking/dwell, ownership continuity, stale camera input, invalid commands, bounded timesteps, swept collisions, inverse kinematics, camera races, pause/resume, fallback, missions and all three languages. The single-hand worker was also checked in a browser with the official public hand test image (GPU delegate and 21 landmarks). Pinch/lift/loss/reacquisition and docking use deterministic injected landmarks. Synthetic hand frames do not establish tracking accuracy on a real person/device.


## 3D robot and gripper

Open `/?game=robot` for the 3D game. Cells rise after grasp and settle before delivery is scored. The default automatically raises a held cell; optional depth control below adds a hand-controlled vertical axis. Pointer clicks are raycast onto the table, and camera/keyboard controls retain that task mapping. Open/closed finger animation follows the commanded gripper even when it holds no cell. The renderer uses no post-processing or shadow maps and releases GPU resources on disposal.

### Experimental depth control

Enable **Spatial hand control · experimental** for a third hand-controlled axis. Hold an open palm still toward the camera: 15 stable observations establish the table-height reference. A larger apparent wrist-to-middle-knuckle distance raises the gripper; a smaller distance lowers it. This is a smoothed relative-size proxy, not measured metric depth. Hand rotation, perspective and occlusion affect accuracy. Recalibrate while not holding a cell. The lift range and speed remain bounded, and grasp requires the tool to be near table height. Shield fields remain forbidden at every height. Turning depth control off restores automatic lifting; autopilot always uses automatic lifting.

The unmodified Hand Landmarker float16 v1 model is self-hosted and SHA-256 checked during build. Its Apache-2.0 model card and credits are in the distributed notices.
