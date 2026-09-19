import type { ServiceDescriptor } from "./types";
import { eventBus, nextEventId, type NormalizedEvent } from "./events";

export interface VisionDetection {
  id: string;
  label: string;
  rawClass: string;
  confidence: number;
  /** Approximate — derived from bounding-box height, never measured. */
  approxDistance: number;
  box: { x: number; y: number; width: number; height: number };
  hazard: boolean;
  tone: "primary" | "danger" | "warn";
}

/** Calibration constant: an average person (~1.7 m) fills the frame height at ~1 m. */
const CALIBRATION = 1.6;
const FRIENDLY: Record<string, string> = {
  person: "Person", car: "Vehicle", bus: "Bus", truck: "Truck", motorcycle: "Motorbike",
  bicycle: "Bicycle", chair: "Chair", bench: "Bench", "dining table": "Table",
  "traffic light": "Traffic light", "stop sign": "Stop sign", dog: "Dog", cat: "Cat",
  backpack: "Bag", handbag: "Bag", suitcase: "Suitcase", bottle: "Bottle", cup: "Cup",
  laptop: "Laptop", "cell phone": "Phone", tv: "Screen", door: "Door",
};
const HAZARDS = new Set(["car", "bus", "truck", "motorcycle", "bicycle", "stairs", "dog"]);

export function approximateDistance(boxHeight: number, frameHeight: number) {
  const ratio = Math.max(0.02, boxHeight / Math.max(1, frameHeight));
  return Math.max(0.5, Math.round((CALIBRATION / ratio) * 10) / 10);
}

export function friendlyLabel(rawClass: string) {
  return FRIENDLY[rawClass] ?? rawClass.charAt(0).toUpperCase() + rawClass.slice(1);
}

/** Geometry-only pseudo classes. When the geometry is not confident, nothing is added. */
export function inferPseudoClasses(detections: VisionDetection[], frame: { width: number; height: number }): VisionDetection[] {
  const extra: VisionDetection[] = [];
  const occupied = detections.filter((d) => d.box.y + d.box.height > frame.height * 0.55);
  const centreClear = !occupied.some((d) => d.box.x < frame.width * 0.66 && d.box.x + d.box.width > frame.width * 0.33);
  if (centreClear && detections.length > 0) {
    extra.push({
      id: nextEventId("pathway"), label: "Pathway", rawClass: "pathway", confidence: 0.6,
      approxDistance: 2, hazard: false, tone: "primary",
      box: { x: frame.width * 0.33, y: frame.height * 0.6, width: frame.width * 0.34, height: frame.height * 0.35 },
    });
  }
  return extra;
}

type DetectionListener = (detections: VisionDetection[]) => void;
type StatusListener = (status: VisionStatus) => void;
export type VisionStatus = "idle" | "requesting-camera" | "loading-model" | "running" | "error";

export class BrowserVisionDetectionService implements ServiceDescriptor {
  readonly name = "Vision detection"; readonly mode = "REAL" as const;
  readonly description = "Rear camera with on-device object detection at about four frames a second.";
  private stream: MediaStream | undefined;
  private model: undefined | { detect(input: HTMLVideoElement): Promise<Array<{ class: string; score: number; bbox: [number, number, number, number] }>> };
  private timer: number | undefined;
  private detectionListeners = new Set<DetectionListener>();
  private statusListeners = new Set<StatusListener>();
  status: VisionStatus = "idle";

  onDetections(listener: DetectionListener) { this.detectionListeners.add(listener); return () => { this.detectionListeners.delete(listener); }; }
  onStatus(listener: StatusListener) { this.statusListeners.add(listener); return () => { this.statusListeners.delete(listener); }; }
  private setStatus(status: VisionStatus) { this.status = status; this.statusListeners.forEach((listener) => listener(status)); }

  async start(video: HTMLVideoElement) {
    this.setStatus("requesting-camera");
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = this.stream;
    await video.play();
    this.setStatus("loading-model");
    const [{ load }] = await Promise.all([import("@tensorflow-models/coco-ssd"), import("@tensorflow/tfjs")]);
    this.model = await load({ base: "lite_mobilenet_v2" });
    this.setStatus("running");
    this.timer = window.setInterval(() => void this.tick(video), 250); // ~4 fps
  }

  private async tick(video: HTMLVideoElement) {
    if (!this.model || video.readyState < 2) return;
    const frame = { width: video.videoWidth || video.clientWidth, height: video.videoHeight || video.clientHeight };
    const raw = await this.model.detect(video).catch(() => []);
    const detections: VisionDetection[] = raw
      .filter((item) => item.score > 0.5)
      .map((item) => {
        const [x, y, width, height] = item.bbox;
        const approxDistance = approximateDistance(height, frame.height);
        const hazard = HAZARDS.has(item.class);
        return {
          id: `${item.class}-${Math.round(x)}-${Math.round(y)}`,
          label: friendlyLabel(item.class), rawClass: item.class, confidence: item.score,
          approxDistance, box: { x, y, width, height }, hazard,
          tone: hazard && approxDistance < 4 ? "danger" : hazard ? "warn" : "primary",
        } satisfies VisionDetection;
      });
    const all = [...detections, ...inferPseudoClasses(detections, frame)];
    this.detectionListeners.forEach((listener) => listener(all));
    const nearest = detections.filter((d) => d.hazard).sort((a, b) => a.approxDistance - b.approxDistance)[0];
    if (nearest) eventBus.emit(this.toEvent(nearest));
  }

  private toEvent(detection: VisionDetection): NormalizedEvent {
    const severity = detection.approxDistance < 2 ? "critical" : detection.approxDistance < 5 ? "warn" : "notice";
    return {
      id: nextEventId("vision"), source: "vision", type: "detection", subtype: detection.rawClass,
      label: detection.label, confidence: detection.confidence, severity,
      message: `${detection.label} about ${Math.round(detection.approxDistance)} metres ahead.`,
      distance: detection.approxDistance, proximity: detection.approxDistance,
      relevantNeeds: ["visual"], timestamp: Date.now(),
    };
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.model = undefined;
    this.setStatus("idle");
  }
}

export const visionService = new BrowserVisionDetectionService();

export const cameraUnavailableError = {
  title: "Camera is not available",
  whatHappened: "INAI could not open the camera, so live detection is paused.",
  whatYouCanDo: "Allow camera access for this site in your browser settings, then tap Try again. The rest of this screen still works.",
};
