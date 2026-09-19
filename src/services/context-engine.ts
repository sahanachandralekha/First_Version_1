import type { AccessibilityProfile, Need } from "@/stores/accessibility-store";
import type { AssistanceDirective, Modality, NormalizedEvent, Severity } from "./events";

const severityWeight: Record<Severity, number> = { info: 1, notice: 2, warn: 4, critical: 8 };
const defaultNeeds: Need[] = ["visual", "hearing", "speech"];

export class ContextEngine {
  private lastGuidanceAt = 0;
  private recent = new Map<string, number>();
  rank(event: NormalizedEvent, profile: AccessibilityProfile) {
    const proximity = event.proximity ? Math.max(1, 20 - event.proximity) : 1;
    const relevance = (event.relevantNeeds ?? defaultNeeds).some((need) => profile[need]) ? 2 : 1;
    return severityWeight[event.severity] * proximity * (event.novelty ?? 1) * relevance;
  }
  toDirective(event: NormalizedEvent, profile: AccessibilityProfile): AssistanceDirective | null {
    const now = Date.now();
    if (event.severity !== "critical" && now - this.lastGuidanceAt < 4000) return null;
    const previous = this.recent.get(`${event.source}:${event.type}`) ?? 0;
    if (event.severity !== "critical" && now - previous < 15000) return null;
    this.lastGuidanceAt = now;
    this.recent.set(`${event.source}:${event.type}`, now);
    const modalities = new Set<Modality>(["visual", "caption"]);
    if (profile.visual) { modalities.add("speech"); modalities.add("haptic"); }
    if (profile.hearing) { modalities.delete("speech"); modalities.add("haptic"); }
    if (profile.speech) { modalities.add("sign"); modalities.add("haptic"); }
    return {
      eventId: event.id, message: event.message, severity: event.severity,
      modalities: [...modalities],
      avatarState: event.severity === "critical" ? "warning" : event.severity === "warn" ? "guiding" : "speaking",
      gesture: event.severity === "critical" ? "stop_palm" : "open_palms",
    };
  }
}
