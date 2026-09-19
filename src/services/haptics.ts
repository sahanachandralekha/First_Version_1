import type { ServiceDescriptor } from "./types";
import { useAccessibilityStore } from "@/stores/accessibility-store";

type Severity = "info" | "notice" | "warn" | "critical";

const basePatterns: Record<Severity, number[]> = {
  info: [],
  notice: [40],
  warn: [80, 60, 80],
  critical: [200, 100, 200, 100, 200],
};

const intensityScale: Record<string, number> = { low: 0.6, medium: 1, high: 1.35 };

/** Scales every segment of a vibration pattern, keeping the pauses intact. */
function scalePattern(pattern: number[], factor: number) {
  return pattern.map((value, index) => Math.round(value * (index % 2 === 0 ? factor : 1)));
}

/**
 * Device vibration per severity, scaled by the alert-intensity setting and
 * silently skipped wherever vibration is unsupported or switched off.
 */
export class HapticService implements ServiceDescriptor {
  readonly name = "Haptic alerts"; readonly mode = "REAL" as const;
  readonly description = "Device vibration patterns scaled by your alert intensity.";

  pulse(severity: Severity) {
    const { hapticEnabled, alertIntensity } = useAccessibilityStore.getState().prefs;
    if (!hapticEnabled || typeof navigator === "undefined") return;
    const pattern = basePatterns[severity];
    if (!pattern.length || typeof navigator.vibrate !== "function") return;
    try { navigator.vibrate(scalePattern(pattern, intensityScale[alertIntensity] ?? 1)); } catch { /* unsupported */ }
  }

  pattern(values: number[]) {
    const { hapticEnabled } = useAccessibilityStore.getState().prefs;
    if (!hapticEnabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try { navigator.vibrate(values); } catch { /* unsupported */ }
  }

  stop() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(0);
  }
}

export const hapticService = new HapticService();
