import { createPoseWorker, type PoseWorkerMessage } from "./pose.worker";
import type { PoseFrame } from "./types";
import { videoFrameKey } from './videoFrameKey';

export type TrackingStatus = {
  state: "idle" | "loading" | "tracking" | "error";
  message: string;
  delegate?: "GPU" | "CPU";
  fps?: number;
  inferenceMs?: number;
  latencyMs?: number;
  captureMs?: number;
  inputSize?: string;
  fallbackReason?: string;
  warmingUp?: boolean;
  cameraFps?: number;
  cameraLabel?: string;
};

type Callbacks = {
  onFrame(frame: PoseFrame): void;
  onStatus(status: TrackingStatus): void;
};

type Session = {
  abort: AbortController;
  stream?: MediaStream;
  worker?: Worker;
  raf?: number;
  videoCallback?: number;
  lastVideoCallbackAt: number;
  useVideoCallbacks: boolean;
  watchdog?: ReturnType<typeof setInterval>;
  running: boolean;
  inFlight: boolean;
  pendingId: number;
  delegate: "GPU" | "CPU";
  recovering: boolean;
  lastCaptureAt: number;
  lastVideoTime: number;
  decodedVideoTime?: number;
  lastResultAt: number;
  lastVideoAt: number;
  lastStatusAt: number;
  lastFrameTimestamp: number;
  fpsStartedAt: number;
  frameCount: number;
  fps: number;
  clearedStalePose: boolean;
  fallbackReason?: string;
  hasResult: boolean;
  captureMs: number;
  inputSize: string;
  cameraLabel: string;
};

const STALE_POSE_MS = 600;
const INFERENCE_TIMEOUT_MS = 5000;
const FIRST_GPU_FRAME_TIMEOUT_MS = 15000;
const INITIALIZATION_TIMEOUT_MS = 45000;

function abortError(): DOMException { return new DOMException("A kamerakövetés leállt.", "AbortError"); }

/** Stop can settle startup even while the browser's permission prompt is open. */
function cancellable<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs?: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { signal.removeEventListener("abort", aborted); clearTimeout(timeout); };
    const aborted = () => { cleanup(); reject(abortError()); };
    if (signal.aborted) { reject(abortError()); return; }
    signal.addEventListener("abort", aborted, { once: true });
    if (timeoutMs) timeout = setTimeout(() => {
      cleanup(); reject(new Error("A kamera vagy a testkövető nem válaszol. Ellenőrizd a kapcsolatot, majd indítsd újra a kamerát."));
    }, timeoutMs);
    promise.then((result) => { cleanup(); resolve(result); }, (error) => { cleanup(); reject(error); });
  });
}

function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "A kamera nincs engedélyezve. Engedélyezd a böngésző címsoránál és a rendszer adatvédelmi beállításaiban, majd indítsd újra.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Nem található kamera. Csatlakoztass egy kamerát, majd próbáld újra.";
  if (name === "NotReadableError" || name === "TrackStartError") return "A kamera nem érhető el. Zárd be a kamerát használó többi alkalmazást, majd próbáld újra.";
  if (name === "OverconstrainedError") return "A kamera nem támogatja a kért képbeállítást. Próbálj másik kamerát.";
  if (error instanceof Error && error.message.startsWith("A ")) return error.message;
  return "A testkövetőt nem sikerült elindítani. Ellenőrizd az internetkapcsolatot a modell letöltéséhez, és használj friss Safari vagy Chrome böngészőt, bekapcsolt hardveres gyorsítással.";
}

/** Local-only camera input; inference runs in a dedicated worker with no frame queue. */
export class CameraPoseTracker {
  private session?: Session;
  private disposed = false;
  private inputWidth: 320 | 480 | 640 = 640;

  setInputWidth(width: 320 | 480 | 640): void {
    if ([320, 480, 640].includes(width)) this.inputWidth = width;
  }
  private readonly onVisibility = () => {
    if (document.hidden && this.session) {
      this.stop();
      this.callbacks.onStatus({ state: "idle", message: "A kamera leállt, mert az oldal háttérbe került. Az indításhoz kapcsold vissza." });
    }
  };
  private readonly onPageHide = () => this.stop();

  constructor(private readonly video: HTMLVideoElement, private readonly callbacks: Callbacks) {}

  private async acquireCamera(session:Session):Promise<MediaStream> {
    const video:MediaTrackConstraints={facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:60}};
    // macOS may keep a disconnected Continuity Camera as the browser default.
    // Once labels are available, prefer the built-in camera when there are
    // multiple inputs; it is also the lower-latency choice for this local mode.
    try {
      const devices=await navigator.mediaDevices.enumerateDevices?.();
      const cameras=devices?.filter(d=>d.kind==='videoinput')??[];
      const builtIn=cameras.find(d=>/MacBook|FaceTime|Built.in/i.test(d.label));
      if(cameras.length>1 && builtIn?.deviceId && this.isCurrent(session)) {
        try { return await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:60},deviceId:{exact:builtIn.deviceId}}}); }
        catch { /* Fall through to the browser default, then preserve its error. */ }
      }
    } catch { /* Device enumeration is optional until camera permission exists. */ }
    try {return await navigator.mediaDevices.getUserMedia({audio:false,video});}
    catch(error){
      // A disconnected Continuity camera can be the browser's default while
      // the built-in Mac camera is available. Retry that explicit local device
      // once; never change permissions or stop another application's capture.
      if(!(error instanceof Error) || error.name!=='NotReadableError' || !this.isCurrent(session))throw error;
      const devices=await navigator.mediaDevices.enumerateDevices?.();
      const builtIn=devices?.find(d=>d.kind==='videoinput' && /MacBook|FaceTime|Built.in/i.test(d.label));
      if(!builtIn?.deviceId || !this.isCurrent(session))throw error;
      return navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:60},deviceId:{exact:builtIn.deviceId}}});
    }
  }

  /** Optional owned stream is for reproducible, local video/canvas benchmarks. */
  async start(source?: MediaStream): Promise<void> {
    if (this.disposed) return;
    this.cleanup();
    const now = performance.now();
    const session: Session = {
      abort: new AbortController(), running: false, inFlight: false, pendingId: 0,
      lastVideoCallbackAt: now, useVideoCallbacks: true,
      delegate: "GPU", recovering: false, lastCaptureAt: -Infinity, lastVideoTime: -1,
      lastResultAt: now, lastVideoAt: now, lastStatusAt: 0, lastFrameTimestamp: -1,
      fpsStartedAt: now, frameCount: 0, fps: 0, clearedStalePose: false, hasResult: false,
      captureMs: 0, inputSize: "", cameraLabel: "", 
      
    };
    this.session = session;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    this.callbacks.onStatus({ state: "loading", message: "Kamera engedélyezése…" });
    try {
      if (!globalThis.isSecureContext || (!source && !navigator.mediaDevices?.getUserMedia)) throw new Error("A kamerához HTTPS-kapcsolat vagy localhost szükséges. Nyisd meg az oldalt biztonságos címen.");
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("A böngésző nem támogatja a háttérben futó kamerakövetést. Frissítsd a Safari vagy Chrome böngészőt.");
      if (document.hidden) throw new Error("A kamera indításához hozd előtérbe ezt az oldalt.");
      const acquisition = (source ? Promise.resolve(source) : this.acquireCamera(session)).then((stream) => {
        // A cancelled permission request may resolve after a new session starts.
        if (!this.isCurrent(session)) { stream.getTracks().forEach((track) => track.stop()); throw abortError(); }
        session.stream = stream;
        return stream;
      });
      session.stream = await cancellable(acquisition, session.abort.signal);
      if (!this.isCurrent(session)) return;
      session.cameraLabel = session.stream.getVideoTracks?.()[0]?.label ?? "ismeretlen kamera";
      for (const track of session.stream.getTracks()) {
        track.addEventListener("ended", () => {
          if (this.isCurrent(session)) this.fail(session, "A kamera kapcsolata megszakadt. Csatlakoztasd újra, majd kapcsold be a kamerakövetést.");
        }, { signal: session.abort.signal });
      }
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = session.stream;
      await cancellable(this.video.play(), session.abort.signal, 15000);
      if (!this.isCurrent(session)) return;
      this.callbacks.onStatus({ state: "loading", message: `${session.cameraLabel} megnyitva. Testkövető modell betöltése…`, cameraLabel: session.cameraLabel });
      try { await this.initializeWorker(session, "GPU"); }
      catch (error) {
        if (!this.isCurrent(session)) return;
        session.fallbackReason = error instanceof Error ? error.message : String(error);
        console.warn("Camera tracking: GPU initialization failed; using CPU.", error);
        this.callbacks.onStatus({ state: "loading", message: "A GPU-s követés nem indult el; CPU-mód betöltése…", delegate: "CPU" });
        await this.initializeWorker(session, "CPU");
      }
      if (!this.isCurrent(session)) return;
      session.running = true;
      session.lastResultAt = session.lastVideoAt = performance.now();
      session.fpsStartedAt = session.lastResultAt;
      session.watchdog = setInterval(() => this.watchdog(session), 250);
      this.callbacks.onStatus({ state: "tracking", message: "A testkövető bemelegszik…", delegate: session.delegate, warmingUp: true });
      this.schedule(session);
    } catch (error) {
      if (this.isCurrent(session)) this.fail(session, cameraError(error));
    }
  }

  stop(): void {
    this.cleanup();
    this.callbacks.onStatus({ state: "idle", message: "A kamera ki van kapcsolva." });
  }

  dispose(): void { this.stop(); this.disposed = true; }

  private isCurrent(session: Session): boolean { return this.session === session && !session.abort.signal.aborted; }

  private async initializeWorker(session: Session, delegate: "GPU" | "CPU"): Promise<void> {
    session.worker?.terminate();
    session.inFlight = false;
    session.hasResult = false;
    const worker = createPoseWorker(delegate);
    session.worker = worker;
    session.delegate = delegate;
    let ready = false;
    const initialized = new Promise<void>((resolve, reject) => {
      const failed = (error: unknown) => {
        if (!ready) reject(error);
        else if (this.isCurrent(session) && session.worker === worker) {
          console.warn("Camera tracking: worker failed.", error);
          void this.recover(session, error instanceof Error ? error.message : String(error));
        }
      };
      worker.onerror = (event) => { event.preventDefault(); failed(new Error(event.message)); };
      worker.onmessageerror = () => failed(new Error("A testkövető üzenete nem olvasható."));
      worker.onmessage = (event: MessageEvent<PoseWorkerMessage>) => {
        if (!this.isCurrent(session) || session.worker !== worker) return;
        const result = event.data;
        if (result.type === "ready") { ready = true; resolve(); }
        else if (result.type === "error") failed(new Error(result.message));
        else if (result.type === "frame" && result.id === session.pendingId) this.receiveFrame(session, result.frame);
      };
    });
    try { await cancellable(initialized, session.abort.signal, INITIALIZATION_TIMEOUT_MS); }
    catch (error) { worker.terminate(); throw error; }
  }

  private schedule(session: Session): void {
    if (!this.isCurrent(session)) return;
    const nextFrame = (now: number, metadata?: VideoFrameCallbackMetadata) => {
      session.raf = session.videoCallback = undefined;
      session.decodedVideoTime = metadata?.mediaTime;
      if (metadata) session.lastVideoCallbackAt = performance.now();
      this.schedule(session);
      this.captureLatest(session, now);
    };
    // Wake only for decoded camera frames, not every 3D render. Keep rAF as a
    // compatibility path, still skipping duplicates and allowing one in-flight frame.
    if (session.useVideoCallbacks && typeof this.video.requestVideoFrameCallback === "function" && this.video.getClientRects().length > 0) {
      session.videoCallback = this.video.requestVideoFrameCallback(nextFrame);
    } else {
      session.raf = requestAnimationFrame(nextFrame);
    }
  }

  private captureLatest(session: Session, now: number): void {
    // Process only a fresh decoded frame, with one inference in flight.
    if (!this.isCurrent(session) || !session.running || session.inFlight
      || this.video.readyState < 2 || !this.video.videoWidth) return;
    const key = session.decodedVideoTime ?? videoFrameKey(this.video);
    if (key === session.lastVideoTime) return;
    session.lastVideoTime = key;
    session.lastVideoAt = session.lastCaptureAt = now;
    session.inFlight = true;
    void this.capture(session, now);
  }

  private async capture(session: Session, timestampMs: number): Promise<void> {
    const worker = session.worker;
    try {
      const scale = Math.min(1, this.inputWidth / this.video.videoWidth, this.inputWidth * 0.75 / this.video.videoHeight);
      const bitmap = scale === 1 ? await createImageBitmap(this.video) : await createImageBitmap(this.video, {
        resizeWidth: Math.max(1, Math.round(this.video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(this.video.videoHeight * scale)), resizeQuality: "low"
      });
      if (!this.isCurrent(session) || session.worker !== worker || !session.running) { bitmap.close(); return; }
      if (performance.now() - timestampMs > STALE_POSE_MS) { bitmap.close(); session.inFlight = false; return; }
      session.captureMs = performance.now() - timestampMs;
      session.inputSize = `${Math.round(this.video.videoWidth * scale)}×${Math.round(this.video.videoHeight * scale)}`;
      try {
        worker!.postMessage({ type: "frame", id: ++session.pendingId, timestampMs, bitmap }, [bitmap]);
      } catch (error) { bitmap.close(); throw error; }
    } catch (error) {
      if (this.isCurrent(session) && session.worker === worker) this.fail(session, cameraError(error));
    }
  }

  private receiveFrame(session: Session, frame: PoseFrame): void {
    session.inFlight = false;
    // Even a stale first result proves the GPU finished its cold-start work.
    session.hasResult = true;
    const now = performance.now();
    if (frame.timestampMs <= session.lastFrameTimestamp || now - frame.timestampMs > STALE_POSE_MS) {
      this.captureLatest(session, now);
      return;
    }
    session.lastResultAt = now;
    session.lastFrameTimestamp = frame.timestampMs;
    session.clearedStalePose = false;
    session.frameCount++;
    if (now - session.fpsStartedAt >= 1000) {
      session.fps = session.frameCount * 1000 / (now - session.fpsStartedAt);
      session.frameCount = 0;
      session.fpsStartedAt = now;
    }
    frame.imageAspectRatio = this.video.videoWidth / this.video.videoHeight;
    this.callbacks.onFrame(frame);
    if (now - session.lastStatusAt >= 500) {
      session.lastStatusAt = now;
      this.callbacks.onStatus({
        state: "tracking", delegate: session.delegate, fps: session.fps, inferenceMs: frame.inferenceMs,
        latencyMs: now - frame.timestampMs, fallbackReason: session.fallbackReason,
        captureMs: session.captureMs, inputSize: session.inputSize,
        cameraFps: session.stream?.getVideoTracks?.()[0]?.getSettings?.().frameRate,
        cameraLabel: session.cameraLabel,
        warmingUp: false,
        message: frame.landmarks.length ? "A kamera követi a mozgásodat." : "Nem látok követhető testpontokat. Nézz a kamerába, és ellenőrizd a megvilágítást."
      });
    }
    // If inference took >33 ms, a newer video frame may already be decoded.
    // Consume that latest frame now instead of waiting another camera tick
    // (which otherwise quantizes ~40 ms inference down to ~15 FPS at 30 Hz).
    // Still one in-flight frame, no queue, and no duplicate video timestamps.
    this.captureLatest(session, now);
  }

  private watchdog(session: Session): void {
    if (!this.isCurrent(session) || !session.running) return;
    const now = performance.now();
    // Some browsers throttle compositor callbacks for display:none video.
    // Hiding the preview must not pause camera processing or trip the watchdog.
    if (session.videoCallback !== undefined && (this.video.getClientRects().length === 0 || now - session.lastVideoCallbackAt >= 500)) {
      this.video.cancelVideoFrameCallback(session.videoCallback);
      session.videoCallback = undefined;
      // An offscreen/clipped preview can have a layout box but no compositor
      // callbacks. Fall back for this session; decoded-frame dedup stays active.
      if (now - session.lastVideoCallbackAt >= 500) session.useVideoCallbacks = false;
      this.schedule(session);
    }
    if (now - session.lastResultAt > STALE_POSE_MS && !session.clearedStalePose) {
      this.clearPose(session);
      this.callbacks.onStatus({ state: "tracking", delegate: session.delegate, warmingUp: !session.hasResult,
        message: session.hasResult ? "Nincs friss kamerakép; a mozgásvezérlés szünetel." : "A testkövető bemelegszik…" });
    }
    // Initial GPU shader/model setup can exceed the steady-state watchdog.
    // Give only the first GPU frame extra time; never apply that old pose.
    const timeout = session.delegate === "GPU" && !session.hasResult ? FIRST_GPU_FRAME_TIMEOUT_MS : INFERENCE_TIMEOUT_MS;
    if (session.inFlight && now - session.lastCaptureAt > timeout) void this.recover(session, `GPU inference did not respond within ${timeout / 1000} seconds.`);
    else if (!session.inFlight && now - session.lastVideoAt > INFERENCE_TIMEOUT_MS) this.fail(session, `${session.cameraLabel || "A kamera"} nem küld friss képet. Ellenőrizd a kamerát, majd indítsd újra a követést.`);
  }

  private async recover(session: Session, reason = "GPU inference did not respond within 5 seconds."): Promise<void> {
    if (!this.isCurrent(session) || session.recovering) return;
    if (session.delegate === "CPU") {
      this.fail(session, "A testkövetés leállt. Indítsd újra a kamerát; ha ismétlődik, frissítsd a böngészőt és kapcsold be a hardveres gyorsítást.");
      return;
    }
    session.recovering = true;
    session.fallbackReason = reason;
    session.running = false;
    this.clearPose(session);
    this.callbacks.onStatus({ state: "loading", delegate: "CPU", message: "A GPU-s követés megszakadt; újraindítás CPU-módban…" });
    try {
      await this.initializeWorker(session, "CPU");
      if (!this.isCurrent(session)) return;
      session.lastResultAt = session.lastVideoAt = performance.now();
      session.fpsStartedAt = session.lastResultAt;
      session.frameCount = session.fps = 0;
      session.running = true;
      session.recovering = false;
      this.callbacks.onStatus({ state: "tracking", delegate: "CPU", warmingUp: true, message: "A kamerakövetés CPU-módban folytatódik." });
    } catch (error) { if (this.isCurrent(session)) this.fail(session, cameraError(error)); }
  }

  private clearPose(session: Session): void {
    session.clearedStalePose = true;
    this.callbacks.onFrame({ timestampMs: performance.now(), landmarks: [], worldLandmarks: [], inferenceMs: 0 });
  }

  private fail(session: Session, message: string): void {
    if (!this.isCurrent(session)) return;
    this.cleanup();
    this.callbacks.onStatus({ state: "error", message });
  }

  private cleanup(): void {
    const session = this.session;
    this.session = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    if (!session) return;
    session.abort.abort();
    if (session.raf !== undefined) cancelAnimationFrame(session.raf);
    if (session.videoCallback !== undefined) this.video.cancelVideoFrameCallback(session.videoCallback);
    clearInterval(session.watchdog);
    session.worker?.terminate();
    session.stream?.getTracks().forEach((track) => track.stop());
    this.video.pause();
    this.video.srcObject = null;
    this.clearPose(session);
  }
}
