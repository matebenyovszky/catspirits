# Bit Rescue — virtual robot teleoperation

Open `/?game=robot` (English/Hungarian/German), or choose **Bit Rescue** in any game's navigation. This is a local browser simulation. It does not connect to a physical robot, upload camera images, record demonstrations or train a model.

## Play

Guide three numbered energy cells to matching docks. Choose **Start camera** to steer with a tracked wrist, or **Mouse / touch / keyboard**. Keep the controlling wrist and elbow visible. One wrist is locked per camera session so losing it cannot switch control to the other hand. The preview is mirrored. No finger gestures or extra model are required.

- Mouse/touch: click a destination or drag. Keyboard: arrows or WASD.
- Hold the gripper still near a cell for 0.65 seconds to grab; hold it at the matching dock to deliver. The ring indicates progress. **Space** or **Grab / release** operates the gripper explicitly.
- **Bit controls** / **Enter** hands control to the autopilot. **I control** / **M**, a movement key or a pointer press takes control back. Ownership changes preserve the held cell, deliveries, pose and time; stale destinations are flushed.
- **Mission 1: First docking** has a clear workspace. Bit can complete it independently.
- **Mission 2: The detour** has a shield. Bit approaches goals directly and holds at the shield; manually guide the gripper above or below it, then hand back. Articulated links travel above the field. Only the tool has planar collision constraints; this is not a full rigid-body/contact simulation.
- Pause stops rendering and camera. Returning requires explicit resume. Completion stops both too. Progress exists only in the current page session; reload/reset starts again.

The autopilot is **rule-based, not a learned AI**. It selects the next cell or the held cell's dock from the current observation. It intentionally does not plan detours. Interventions do not train or change it.

## Controller boundary and future hardware

`src/core/robot/RobotSimulation.ts` defines `RobotObservation`, `RobotCommand` and `RobotController`. The injected `DirectController` can later be replaced by a learned controller. Observations are detached snapshots of the tool, cells, docks, fields and grip state. Commands request a tool-space target and optional grip action. The simulation applies reach limits, bounded speed and swept tool collision checks regardless of control ownership.

The Canvas view uses inverse kinematics for two fixed-length links. Rendering is capped at 60 updates/s, DPR at 1.5 and HUD at 10 updates/s. The welcome screen has no animation loop. The robot route is lazy-loaded; pointer controls do not start MediaPipe. Three.js loads only when the optional 3D view is selected.

Physical integration is absent. A hardware adapter will need calibrated coordinates, joint/velocity/force limits, collision handling, stale-command timeouts, explicit enable and an independent stop mechanism. Simulation limits are not a hardware safety system. The existing site policy still disables USB. Hardware integration and demonstration collection are separate implementation tasks.

## Validation

Tests cover autonomous completion, a blocked route followed by manual recovery and handback, docking/dwell, ownership continuity, stale camera input, invalid commands, bounded timesteps, swept collisions, inverse kinematics, camera races, pause/resume, fallback, missions and all three languages. Synthetic hand frames do not establish tracking accuracy on a real person/device.


## Optional 3D preview

Select **3D · test** or open `/?game=robot&view=3d`. This is a spatial rendering of the same planar task, not six-degree-of-freedom manipulation: the gripper still moves along the table plane. Pointer clicks are raycast onto that plane; camera and keyboard controls keep their table-space mapping. Switching views preserves mission state and controller ownership. WebGL failure/context loss falls back to 2D. The 3D renderer uses no post-processing or shadow maps, caps DPR at 1.25, shares the existing frame loop and releases GPU resources on disposal. The original 2D renderer remains the default.

Finger/pinch tracking is not implemented in this version. Current camera input uses the body model's wrist; opening/closing still uses dwell, Space or the gripper button. A single-hand model could supply both wrist movement and a debounced, hand-size-normalized thumb/index pinch in a later change.
