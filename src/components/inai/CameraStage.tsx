import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Maximize2 } from "lucide-react";
import { ErrorState } from "@/components/shared/states";
import { visionService, cameraUnavailableError, type VisionDetection, type VisionStatus } from "@/services/vision";

const toneClass: Record<VisionDetection["tone"], string> = {
  primary: "border-primary text-primary", danger: "border-danger text-danger", warn: "border-warn text-warn",
};
const toneChip: Record<VisionDetection["tone"], string> = {
  primary: "bg-primary text-primary-foreground", danger: "bg-danger text-destructive-foreground", warn: "bg-warn text-ink",
};

export function DetectionOverlay({ detections, frame }: { detections: VisionDetection[]; frame: { width: number; height: number } }) {
  if (!frame.width || !frame.height) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {detections.filter((d) => d.rawClass !== "pathway").map((detection) => (
        <span
          key={detection.id}
          className={`detection-overlay absolute rounded-control border-[3px] ${toneClass[detection.tone]}`}
          style={{
            left: `${(detection.box.x / frame.width) * 100}%`,
            top: `${(detection.box.y / frame.height) * 100}%`,
            width: `${(detection.box.width / frame.width) * 100}%`,
            height: `${(detection.box.height / frame.height) * 100}%`,
          }}
        >
          <span className={`absolute -top-3 left-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${toneChip[detection.tone]}`}>
            {detection.label} ~{Math.round(detection.approxDistance)} m
          </span>
        </span>
      ))}
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

/** Live camera with graceful degradation: without camera access the rest of the screen still works. */
export function CameraStage({
  onDetections, height = "h-72", children, showControls = true,
}: { onDetections?: (detections: VisionDetection[]) => void; height?: string; children?: ReactNode; showControls?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [status, setStatus] = useState<VisionStatus>("idle");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const offStatus = visionService.onStatus(setStatus);
    const offDetections = visionService.onDetections((next) => {
      setDetections(next);
      setFrame({ width: video.videoWidth, height: video.videoHeight });
      onDetections?.(next);
    });
    setFailed(false);
    visionService.start(video).catch(() => setFailed(true));
    return () => { offStatus(); offDetections(); visionService.stop(); };
  }, [attempt, onDetections]);

  const clearSide = detections.some((d) => d.rawClass === "pathway") ? "ahead" : undefined;

  return (
    <div className={`relative w-full overflow-hidden rounded-card bg-ink ${height}`}>
      <video ref={videoRef} playsInline muted className="size-full object-cover" aria-label="Live camera view" />
      {!failed && <DetectionOverlay detections={detections} frame={frame} />}
      {!failed && clearSide && <ClearPathOverlay side={clearSide} />}
      {!failed && (
        <span className="absolute left-3 top-3 rounded-full bg-live px-3 py-1 text-xs font-extrabold text-primary-foreground">
          ● {status === "loading-model" ? "Preparing analysis" : status === "requesting-camera" ? "Opening camera" : "Live Analysis"}
        </span>
      )}
      {showControls && !failed && (
        <>
          <button type="button" className="absolute bottom-3 left-3 min-h-12 min-w-12 rounded-full bg-background/90 px-3 text-sm font-extrabold">1x</button>
          <button type="button" aria-label="Fullscreen" className="absolute bottom-3 right-3 grid size-12 place-items-center rounded-full bg-background/90">
            <Maximize2 className="size-4" />
          </button>
        </>
      )}
      {children}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-background p-3">
          <ErrorState {...cameraUnavailableError} onRetry={() => setAttempt((value) => value + 1)} />
        </div>
      )}
    </div>
  );
}
