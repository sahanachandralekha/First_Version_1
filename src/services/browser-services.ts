import type { AccessiblePlace, EmergencyService, HapticService, LocationService, VisionService } from "./contracts";

export class BrowserVisionService implements VisionService {
  readonly name = "Vision"; readonly mode = "REAL" as const;
  readonly description = "Camera access with local object detection.";
  private stream: MediaStream | undefined;
  async start(video: HTMLVideoElement) {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = this.stream; await video.play();
  }
  stop() { this.stream?.getTracks().forEach((track) => track.stop()); this.stream = undefined; }
}

const seededPlaces: AccessiblePlace[] = [
  { id: "exit-main", name: "Main accessible exit", category: "exit", distanceMetres: 80, simulated: true },
  { id: "restroom-a", name: "Accessible restroom", category: "restroom", distanceMetres: 110, simulated: true },
  { id: "medical", name: "Campus medical room", category: "hospital", distanceMetres: 240, simulated: true },
];
export class BrowserLocationService implements LocationService {
  readonly name = "Location"; readonly mode = "REAL" as const;
  readonly description = "Device location with simulated indoor places.";
  locate() { return new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)); }
  async listAccessiblePlaces() { return seededPlaces; }
}
export class MockEmergencyService implements EmergencyService {
  readonly name = "Emergency timeline"; readonly mode = "MOCK" as const;
  readonly description = "A simulated safety flow; it never contacts emergency services.";
  async activate() { return { simulated: true as const, timeline: ["Emergency detected", "Location prepared", "Help request simulated", "INAI guidance started"] }; }
}
export class BrowserHapticService implements HapticService {
  readonly name = "Haptic alerts"; readonly mode = "REAL" as const;
  readonly description = "Device vibration when the browser supports it.";
  pulse(severity: "info" | "notice" | "warn" | "critical") {
    const patterns = { info: [80], notice: [120], warn: [160, 80, 160], critical: [240, 80, 240, 80, 240] };
    navigator.vibrate?.(patterns[severity]);
  }
}
