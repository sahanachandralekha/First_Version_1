import type { ShakeConfig } from "../audio/audioTypes";
import { inaiAudioManager } from "../audio/INAIAudioManager";

export const DEFAULT_SHAKE_CONFIG: ShakeConfig = {
  threshold: 15.0, // m/s^2
  requiredCount: 2, // 2 strong peaks
  windowMs: 1200, // within 1.2 seconds
  cooldownMs: 2500, // 2.5s cooldown to prevent repeated rapid triggers
  debugLogging: import.meta.env.DEV ?? false,
};

export type ShakeListener = (magnitude: number) => void;

export class ShakeDetector {
  private config: ShakeConfig;
  private peakTimestamps: number[] = [];
  private lastTriggerTime = 0;
  private isListening = false;
  private listeners = new Set<ShakeListener>();
  private boundMotionHandler: ((event: DeviceMotionEvent) => void) | null = null;
  private hasReceivedMotionEvent = false;
  private checkTimeout: number | undefined = undefined;

  constructor(customConfig?: Partial<ShakeConfig>) {
    this.config = { ...DEFAULT_SHAKE_CONFIG, ...customConfig };
  }

  public updateConfig(newConfig: Partial<ShakeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): ShakeConfig {
    return { ...this.config };
  }

  /**
   * Request motion permission if required by platform (e.g. iOS / some WebViews).
   * Must be invoked during a user gesture (e.g. button click).
   */
  public async requestPermission(): Promise<"granted" | "denied" | "unsupported"> {
    if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
      inaiAudioManager.setMotionPermission("unsupported");
      inaiAudioManager.setMotionStatus("unsupported");
      return "unsupported";
    }

    const dme = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };

    if (typeof dme.requestPermission === "function") {
      try {
        const response = await dme.requestPermission();
        inaiAudioManager.setMotionPermission(response === "granted" ? "granted" : "denied");
        return response;
      } catch (err) {
        console.warn("[INAI Motion] Permission request error:", err);
        inaiAudioManager.setMotionPermission("denied");
        return "denied";
      }
    }

    // Permission API not needed / not present (standard Android Chrome & standard WebView)
    inaiAudioManager.setMotionPermission("granted");
    return "granted";
  }

  /**
   * Start listening for devicemotion events.
   */
  public start(onShake?: ShakeListener): void {
    if (typeof window === "undefined" || this.isListening) return;

    if (onShake) {
      this.listeners.add(onShake);
    }

    if (!("DeviceMotionEvent" in window)) {
      inaiAudioManager.setMotionStatus("unsupported");
      return;
    }

    this.boundMotionHandler = (event: DeviceMotionEvent) => this.handleDeviceMotion(event);
    window.addEventListener("devicemotion", this.boundMotionHandler, { passive: true });
    this.isListening = true;
    inaiAudioManager.setShakeDetectorActive(true);

    // Verify if events are actually being dispatched by device
    this.hasReceivedMotionEvent = false;
    this.checkTimeout = window.setTimeout(() => {
      if (!this.hasReceivedMotionEvent) {
        inaiAudioManager.setMotionStatus("unavailable");
      }
    }, 1500);
  }

  /**
   * Stop listening and clean up event listeners.
   */
  public stop(): void {
    if (this.boundMotionHandler && typeof window !== "undefined") {
      window.removeEventListener("devicemotion", this.boundMotionHandler);
      this.boundMotionHandler = null;
    }
    if (this.checkTimeout) {
      window.clearTimeout(this.checkTimeout);
      this.checkTimeout = undefined;
    }
    this.isListening = false;
    this.peakTimestamps = [];
    inaiAudioManager.setShakeDetectorActive(false);
  }

  public subscribe(listener: ShakeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleDeviceMotion(event: DeviceMotionEvent): void {
    if (!this.hasReceivedMotionEvent) {
      this.hasReceivedMotionEvent = true;
      inaiAudioManager.setMotionStatus("available");
      if (this.checkTimeout) {
        window.clearTimeout(this.checkTimeout);
        this.checkTimeout = undefined;
      }
    }

    let x = 0;
    let y = 0;
    let z = 0;
    let magnitude = 0;

    const acc = event.acceleration;
    const accGravity = event.accelerationIncludingGravity;

    // Prefer linear acceleration (which already removes gravity)
    if (acc && (acc.x !== null || acc.y !== null || acc.z !== null)) {
      x = acc.x || 0;
      y = acc.y || 0;
      z = acc.z || 0;
      magnitude = Math.sqrt(x * x + y * y + z * z);
    } else if (accGravity) {
      // Fallback: remove standard 1G (9.8 m/s^2) baseline
      x = accGravity.x || 0;
      y = accGravity.y || 0;
      z = accGravity.z || 0;
      const rawMagnitude = Math.sqrt(x * x + y * y + z * z);
      // Delta from earth gravity
      magnitude = Math.max(0, Math.abs(rawMagnitude - 9.80665));
    }

    const now = Date.now();

    // Check cooldown period
    if (now - this.lastTriggerTime < this.config.cooldownMs) {
      return;
    }

    // Check if reading constitutes a peak above threshold
    if (magnitude >= this.config.threshold) {
      // Prune peaks outside time window
      this.peakTimestamps = this.peakTimestamps.filter(
        (ts) => now - ts <= this.config.windowMs
      );
      this.peakTimestamps.push(now);

      if (this.config.debugLogging) {
        console.log(
          `[INAI Motion]\n` +
          `x: ${x.toFixed(2)}\n` +
          `y: ${y.toFixed(2)}\n` +
          `z: ${z.toFixed(2)}\n` +
          `magnitude: ${magnitude.toFixed(2)}\n` +
          `shakeScore: ${this.peakTimestamps.length} / ${this.config.requiredCount}`
        );
      }

      // Check if enough peaks accumulated in window
      if (this.peakTimestamps.length >= this.config.requiredCount) {
        this.lastTriggerTime = now;
        this.peakTimestamps = [];
        inaiAudioManager.recordShake(magnitude);

        console.log(`[INAI Motion] Deliberate shake detected! Magnitude: ${magnitude.toFixed(2)}`);

        // Notify all registered shake callbacks
        for (const listener of this.listeners) {
          try {
            listener(magnitude);
          } catch (err) {
            console.error("[INAI Motion] Shake listener error:", err);
          }
        }
      }
    }
  }
}

export const sharedShakeDetector = new ShakeDetector();
