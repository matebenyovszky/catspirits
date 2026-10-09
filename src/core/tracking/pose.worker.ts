/// <reference types="vite/client" />
import visionRuntimeUrl from "@mediapipe/tasks-vision?url";
import type { PoseFrame } from "./types";

export type PoseWorkerMessage =
  | { type: "ready"; delegate: "GPU" | "CPU" }
  | { type: "frame"; id: number; frame: PoseFrame }
  | { type: "error"; message: string };

/**
 * The pinned MediaPipe runtime loads its WASM glue with importScripts. A classic
 * worker with a native dynamic import works in both Vite dev and production;
 * a Vite module worker would fail when that WASM loader calls importScripts.
 * All runtime dependencies of this function must stay inside its body because
 * the function is serialized into the worker, never executed on the UI thread.
 */
function poseWorkerMain(loadRuntime: (url: string) => Promise<typeof import("@mediapipe/tasks-vision")>) {
  type Vision = typeof import("@mediapipe/tasks-vision");
  type Detector = import("@mediapipe/tasks-vision").PoseLandmarker;
  type Request =
    | { type: "init"; runtimeUrl: string; wasmUrl: string; modelUrl: string; delegate: "GPU" | "CPU" }
    | { type: "frame"; id: number; timestampMs: number; bitmap: ImageBitmap };
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<Request>) => void) | null;
    postMessage(message: unknown): void;
  };
  let detector: Detector | undefined;
  scope.onmessage = async (event) => {
    const request = event.data;
    try {
      if (request.type === "init") {
        const runtime: Vision = await loadRuntime(request.runtimeUrl);
        const files = await runtime.FilesetResolver.forVisionTasks(
          request.wasmUrl
        );
        detector = await runtime.PoseLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: request.modelUrl,
            delegate: request.delegate
          },
          canvas: new OffscreenCanvas(640, 480),
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputSegmentationMasks: false
        });
        scope.postMessage({ type: "ready", delegate: request.delegate });
      } else {
        if (!detector) throw new Error("A testkövető még nem áll készen.");
        const startedAt = performance.now();
        const result = detector.detectForVideo(request.bitmap, request.timestampMs);
        scope.postMessage({
          type: "frame", id: request.id,
          frame: {
            timestampMs: request.timestampMs,
            landmarks: result.landmarks[0] ?? [],
            worldLandmarks: result.worldLandmarks[0] ?? [],
            inferenceMs: performance.now() - startedAt
          }
        });
      }
    } catch (error) {
      scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (request.type === "frame") request.bitmap.close();
    }
  };
}

export function createPoseWorker(delegate: "GPU" | "CPU"): Worker {
  // Keep the native import in generated worker source: Vite dev otherwise adds
  // an injectQuery helper from the UI module, which does not exist in the worker.
  const source = `(${poseWorkerMain.toString()})(url => import(url))`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const worker = new Worker(url, { name: "camera-pose", type: "classic" });
    worker.postMessage({
      type: "init", delegate, runtimeUrl: new URL(visionRuntimeUrl, document.baseURI).href,
      wasmUrl: new URL(`${import.meta.env.BASE_URL}assets/mediapipe/runtime-0.10.32/`, document.baseURI).href,
      modelUrl: new URL(`${import.meta.env.BASE_URL}assets/mediapipe/pose-lite-v1/pose_landmarker_lite.task`, document.baseURI).href,
    });
    return worker;
  } finally {
    URL.revokeObjectURL(url);
  }
}
