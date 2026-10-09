/** Detector-neutral input: image landmarks are unmirrored; world landmarks are in metres. */
export type PoseLandmark = { x: number; y: number; z: number; visibility?: number };
export type PoseFrame = {
  timestampMs: number;
  /** Present only on display estimates; original measured image timestamp. */
  observationTimestampMs?: number;
  source?: 'vision-2d+mediapipe-depth';
  depthTimestampMs?: number;
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  inferenceMs: number;
  /** Width/height of the unmirrored camera image, for metric image-plane geometry. */
  imageAspectRatio?: number;
};

/** Game input never contains images or video. Jump is an edge, consumed once. */
export type MotionInput = {
  tracked: boolean;
  calibrated: boolean;
  calibrationProgress: number;
  runSpeed: number;
  /** Alternating foot/knee lifts per minute; optional for other game controllers. */
  cadenceSpm?: number;
  /** Visible knee pair or ankle pair; jumping only needs shoulders and hips. */
  runAvailable?: boolean;
  jump: boolean;
  /** 0..1 take-off strength estimated from torso rise and upward speed. */
  jumpStrength?: number;
  crouch: boolean;
  lane: number;
};

export const emptyMotionInput = (): MotionInput => ({
  tracked: false, calibrated: false, calibrationProgress: 0,
  runSpeed: 0, jump: false, crouch: false, lane: 0
});
