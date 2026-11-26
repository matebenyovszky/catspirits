/// <reference types="vite/client" />
import visionRuntimeUrl from "@mediapipe/tasks-vision?url";
import { createPoseImageInput } from './PoseImageInput';
import type { PoseFrame } from "./types";

type Cadence = { handMs: number; bodyMs: number };

export type HandWorkerMessage =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "frame"; id: number; frame: PoseFrame }
  | { type: "input-error"; id: number; message: string }
  | { type: "error"; message: string };

/**
 * The pinned MediaPipe runtime loads its WASM glue with importScripts. A classic
 * worker with a native dynamic import works in both Vite dev and production;
 * a Vite module worker would fail when that WASM loader calls importScripts.
 * All runtime dependencies of this function must stay inside its body because
 * the function is serialized into the worker, never executed on the UI thread.
 */
export function handWorkerMain(loadRuntime: (url: string) => Promise<typeof import("@mediapipe/tasks-vision")>, makeInput: typeof createPoseImageInput) {
  type Vision = typeof import("@mediapipe/tasks-vision");
  type Detector = import("@mediapipe/tasks-vision").HandLandmarker;
  type Request =
    | { type: "init"; runtimeUrl: string; wasmUrl: string; modelUrl: string; poseModelUrl?: string; maxHands?: 2; cadence?: Cadence; delegate: "GPU" | "CPU" }
    | { type: "frame"; id: number; timestampMs: number; bitmap: ImageBitmap; videoFrame?: never }
    | { type: "frame"; id: number; timestampMs: number; videoFrame: VideoFrame; width: number; height: number; bitmap?: never };
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<Request>) => void) | null;
    postMessage(message: unknown): void;
  };
  let detector: Detector | undefined;
  let pose: import('@mediapipe/tasks-vision').PoseLandmarker | undefined;
  let armLandmarks: PoseFrame['landmarks'] = [], armWorldLandmarks: PoseFrame['worldLandmarks'] = [], armTimestampMs = -Infinity;
  const prepareInput = makeInput();
  let maxHands: 1 | 2 = 1;
  let cadence = { handMs: 0, bodyMs: 100 };
  let lastHand = -Infinity;
  let result: ReturnType<Detector['detectForVideo']> | undefined;
  scope.onmessage = async (event) => {
    const request = event.data;
    try {
      if (request.type === "init") {
        const runtime: Vision = await loadRuntime(request.runtimeUrl);
        const files = await runtime.FilesetResolver.forVisionTasks(
          request.wasmUrl
        );
        maxHands = request.maxHands ?? 1;
        cadence = request.cadence ?? cadence;
        detector = await runtime.HandLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: request.modelUrl,
            delegate: request.delegate
          },
          canvas: new OffscreenCanvas(640, 480),
          runningMode: "VIDEO",
          numHands: maxHands,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.6
        });
        if (request.poseModelUrl) pose = await runtime.PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: request.poseModelUrl, delegate: request.delegate },
          canvas: new OffscreenCanvas(640, 480), runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: .55, minPosePresenceConfidence: .55, minTrackingConfidence: .55, outputSegmentationMasks: false
        });
        scope.postMessage({ type: "ready", delegate: request.delegate });
      } else {
        if (!detector) throw new Error("A kézkövető még nem áll készen.");
        const input = request.videoFrame ? prepareInput(request.videoFrame, request.width, request.height).image : request.bitmap;
        const startedAt = performance.now();
        if (!result || request.timestampMs - lastHand >= cadence.handMs) {
          result = detector.detectForVideo(input, request.timestampMs);
          lastHand = request.timestampMs;
        }
        // Shared capture, serial inference, one frame in flight. Body inference
        // runs at its own cadence on the same decoded image.
        if (pose && request.timestampMs - armTimestampMs >= cadence.bodyMs) {
          const body = pose.detectForVideo(input, request.timestampMs);
          armLandmarks = body.landmarks[0] ?? []; armWorldLandmarks = body.worldLandmarks[0] ?? []; armTimestampMs = request.timestampMs;
        }
        const handResult = result;
        scope.postMessage({
          type: "frame", id: request.id,
          frame: {
            timestampMs: request.timestampMs,
            handTimestampMs: lastHand,
            landmarks: handResult.landmarks[0] ?? [],
            worldLandmarks: handResult.worldLandmarks[0] ?? [],
            inferenceMs: performance.now() - startedAt,
            ...(maxHands === 2 ? { hands: handResult.landmarks.flatMap((points, index) => {
              const label = handResult.handedness[index]?.[0];
              return label ? [{ side: label.categoryName, score: label.score, points, worldPoints: handResult.worldLandmarks[index] }] : [];
            }) } : {}),
            handedness: handResult.handedness[0]?.[0]?.categoryName.toLowerCase(),
            handednessScore: handResult.handedness[0]?.[0]?.score,
            ...(pose ? { armLandmarks, armWorldLandmarks, armTimestampMs } : {})
          }
        });
      }
    } catch (error) {
      scope.postMessage({ type: request.type === "frame" && request.videoFrame ? "input-error" : "error",
        ...(request.type === "frame" ? { id: request.id } : {}),
        message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (request.type === "frame") (request.videoFrame ?? request.bitmap).close();
    }
  };
}

export function createHandWorker(delegate: "GPU" | "CPU", withArm = false, maxHands: 1 | 2 = 1, cadence?: Cadence): Worker {
  // Keep the native import in generated worker source: Vite dev otherwise adds
  // an injectQuery helper from the UI module, which does not exist in the worker.
  const source = `(${handWorkerMain.toString()})(url => import(url), ${createPoseImageInput.toString()})`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const worker = new Worker(url, { name: "camera-hand", type: "classic" });
    worker.postMessage({
      type: "init", delegate, ...(maxHands === 2 ? { maxHands } : {}), ...(cadence ? { cadence } : {}), runtimeUrl: new URL(visionRuntimeUrl, document.baseURI).href,
      wasmUrl: new URL(`${import.meta.env.BASE_URL}assets/mediapipe/runtime-0.10.32/`, document.baseURI).href,
      ...(withArm ? { poseModelUrl: new URL(`${import.meta.env.BASE_URL}assets/mediapipe/pose-lite-v1/pose_landmarker_lite.task`, document.baseURI).href } : {}),
      modelUrl: new URL(`${import.meta.env.BASE_URL}assets/mediapipe/hand-full-v1/hand_landmarker.task`, document.baseURI).href,
    });
    return worker;
  } finally {
    URL.revokeObjectURL(url);
  }
}
