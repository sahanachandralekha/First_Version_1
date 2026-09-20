import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { CameraOff, ChevronRight, Maximize2, SwitchCamera } from "lucide-react";
import { ErrorState } from "@/components/shared/states";
import { visionService, cameraUnavailableError, type VisionDetection, type VisionStatus } from "@/services/vision";

const toneClass: Record<VisionDetection["tone"], string> = {
  primary: "border-primary text-primary", danger: "border-danger text-danger", warn: "border-warn text-warn",
};
const toneChip: Record<VisionDetection["tone"], string> = {
  primary: "bg-primary text-primary-foreground", danger: "bg-danger text-destructive-foreground", warn: "bg-warn text-ink",
};

export interface StageBox { width: number; height: number }

export interface CameraStageHandle {
  captureFrame: (quality?: number) => string | null;
  flipCamera: () => Promise<{ facingMode: "user" | "environment"; facingUser: boolean; mirrored: boolean } | undefined>;
  videoElement: HTMLVideoElement | null;
}

export interface CameraStageProps {
  onDetections?: (detections: VisionDetection[], frame: StageBox) => void;
  onFrame?: (frame: StageBox) => void;
  height?: string;
  children?: ReactNode;
  showControls?: boolean;
  initialFacing?: "user" | "environment";
  active?: boolean;
  onStartCamera?: () => void;
}

/**
 * Maps a detection box from video pixels to on-screen pixels.
 *
 * The preview is `object-cover`, so the video is scaled up and cropped. Without
 * this the boxes drift away from what they mark.
 */
function coverRect(box: VisionDetection["box"], frame: StageBox, stage: StageBox, mirrored = false) {
  const scale = Math.max(stage.width / frame.width, stage.height / frame.height);
  const offsetX = (stage.width - frame.width * scale) / 2;
  const offsetY = (stage.height - frame.height * scale) / 2;
  const boxX = mirrored ? frame.width - (box.x + box.width) : box.x;
  return {
    left: boxX * scale + offsetX,
    top: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale,
  };
}

export function DetectionOverlay({ detections, frame, stage, mirrored = false }: { detections: VisionDetection[]; frame: StageBox; stage: StageBox; mirrored?: boolean }) {
  if (!frame.width || !frame.height || !stage.width) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {detections.filter((d) => d.rawClass !== "pathway").map((detection) => {
        const rect = coverRect(detection.box, frame, stage, mirrored);
        return (
          <span
            key={detection.id}
            className={`detection-overlay absolute rounded-control border-[3px] ${toneClass[detection.tone]}`}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          >
            <span className={`absolute -top-3 left-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${toneChip[detection.tone]}`}>
              {detection.label} ~{Math.round(detection.approxDistance)} m
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ClearPathOverlay({ side }: { side: "left" | "right" | "ahead" }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/2 flex-col items-center justify-end pb-4">
      <div aria-hidden="true" className="absolute bottom-0 h-full w-1/3 bg-live/25 [clip-path:polygon(35%_0,65%_0,100%_100%,0_100%)]" />
      <div aria-hidden="true" className="mb-6 flex flex-col items-center text-live">
        {[0, 1, 2].map((index) => <ChevronRight key={index} className="size-6 -rotate-90 opacity-80" />)}
      </div>
      <span className="relative rounded-full bg-live px-3 py-1 text-xs font-extrabold text-primary-foreground">
        Clear Path — {side === "ahead" ? "Continue straight" : `Go ${side}`}
      </span>
    </div>
  );
}

/** Live camera with accessible controls and snapshot capture support. */
export const CameraStage = forwardRef<CameraStageHandle, CameraStageProps>(function CameraStage(
  {
    onDetections,
    onFrame,
    height = "h-72",
    children,
    showControls = true,
    initialFacing = "environment",
    active = true,
    onStartCamera,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState<StageBox>({ width: 0, height: 0 });
  const [stage, setStage] = useState<StageBox>({ width: 0, height: 0 });
  const [mirrored, setMirrored] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [flipping, setFlipping] = useState(false);

  // Expose captureFrame and camera controls via ref
  useImperativeHandle(ref, () => ({
    captureFrame: (quality = 0.75) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 640;
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", quality);
      } catch (err) {
        console.error("Frame capture error:", err);
        return null;
      }
    },
    flipCamera: async () => {
      const video = videoRef.current;
      if (!video || flipping) return undefined;
      setFlipping(true);
      try {
        const res = await visionService.flipCamera(video);
        setFacing(res.facingMode);
        setMirrored(res.mirrored);
        return res;
      } catch (err) {
        console.error("Camera flip error:", err);
        return undefined;
      } finally {
        setFlipping(false);
      }
    },
    videoElement: videoRef.current,
  }), [flipping]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setStage({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setStage({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const onDetectionsRef = useRef(onDetections);
  useEffect(() => {
    onDetectionsRef.current = onDetections;
  }, [onDetections]);

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    if (!active) {
      visionService.stop();
      setDetections([]);
      setStatus("idle");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let retryTimer: number | undefined;

    const offStatus = visionService.onStatus(setStatus);
    const offDetections = visionService.onDetections((next) => {
      if (cancelled) return;
      const nextFrame = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
      setDetections(next);
      setFrame(nextFrame);
      onFrameRef.current?.(nextFrame);
      onDetectionsRef.current?.(next, nextFrame);
    });

    setFailed(false);

    const startCameraWithRetry = async (retries = 2) => {
      try {
        await visionService.start(video, { facingMode: facing });
        if (cancelled) return;
        setMirrored(visionService.mirrored);
        setFacing(visionService.facingMode);
        setFailed(false);
      } catch (err) {
        if (cancelled) return;
        console.warn("Camera auto-start attempt error:", err);
        if (retries > 0) {
          retryTimer = window.setTimeout(() => {
            if (!cancelled) {
              void startCameraWithRetry(retries - 1);
            }
          }, 300);
        } else {
          setFailed(true);
        }
      }
    };

    void startCameraWithRetry();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      offStatus();
      offDetections();
      visionService.stop();
    };
  }, [attempt, active, facing]);

  const handleFlip = async () => {
    const video = videoRef.current;
    if (!video || flipping) return;
    setFlipping(true);
    try {
      const res = await visionService.flipCamera(video);
      setFacing(res.facingMode);
      setMirrored(res.mirrored);
    } catch (err) {
      console.error("Camera flip error:", err);
    } finally {
      setFlipping(false);
    }
  };

  const clearSide = detections.some((d) => d.rawClass === "pathway") ? "ahead" : undefined;

  return (
    <div ref={stageRef} className={`relative w-full overflow-hidden rounded-card bg-ink ${height}`}>
      {active ? (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
            className="size-full object-cover transition-transform duration-300"
            aria-label="Live camera view for visual assistance"
          />
          {!failed && <DetectionOverlay detections={detections} frame={frame} stage={stage} mirrored={mirrored} />}
          {!failed && clearSide && <ClearPathOverlay side={clearSide} />}
          {!failed && (
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span className="rounded-full bg-live px-3 py-1 text-xs font-extrabold text-primary-foreground">
                ● {status === "loading-model" ? "Loading AI Model" : status === "requesting-camera" ? "Opening Camera…" : "Camera Active"}
              </span>
              <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur">
                {facing === "user" ? "Front Camera" : "Rear Camera"}
              </span>
            </div>
          )}
          {!failed && (
            <button
              type="button"
              aria-label="Flip between front and rear camera"
              onClick={handleFlip}
              disabled={flipping}
              className={`absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-extrabold text-ink shadow-md backdrop-blur transition-all active:scale-95 hover:bg-background ${flipping ? "opacity-60" : ""}`}
            >
              <SwitchCamera className={`size-4 text-primary ${flipping ? "animate-spin" : ""}`} />
              <span>Flip</span>
            </button>
          )}
          {showControls && !failed && (
            <>
              <button
                type="button"
                aria-label="Switch camera"
                onClick={handleFlip}
                disabled={flipping}
                className="absolute bottom-3 right-16 grid size-12 place-items-center rounded-full bg-background/90 text-ink shadow-md transition-transform active:scale-90"
              >
                <SwitchCamera className={`size-5 text-primary ${flipping ? "animate-spin" : ""}`} />
              </button>
              <button type="button" aria-label="Fullscreen camera" className="absolute bottom-3 right-3 grid size-12 place-items-center rounded-full bg-background/90 text-ink">
                <Maximize2 className="size-4" />
              </button>
            </>
          )}
          {children}
          {failed && (
            <div className="absolute inset-0 grid place-items-center bg-background p-4 text-center">
              <ErrorState {...cameraUnavailableError} onRetry={() => setAttempt((value) => value + 1)} />
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/95 p-6 text-center" role="status" aria-live="polite">
          <CameraOff className="mb-3 size-12 text-muted-foreground" />
          <p className="text-base font-extrabold text-ink">Camera is paused</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Camera stream is stopped and device battery is saved. Tap Start Camera to resume.
          </p>
          {onStartCamera && (
            <button
              type="button"
              onClick={onStartCamera}
              className="mt-4 rounded-full bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform active:scale-95"
            >
              Start Camera
            </button>
          )}
        </div>
      )}
    </div>
  );
});
