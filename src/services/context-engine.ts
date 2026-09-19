import type { AccessibilityProfile, Need } from "@/stores/accessibility-store";
import type { AssistanceDirective, Modality, NormalizedEvent, Severity, WorldState } from "./events";

const severityWeight: Record<Severity, number> = { info: 1, notice: 2, warn: 4, critical: 8 };
const defaultNeeds: Need[] = ["visual", "hearing", "speech"];

/**
 * Fuses every normalized event into one world state, ranks by
 * severity x proximity x novelty x profile relevance, rate-limits guidance to
 * one message every four seconds and suppresses repeats for fifteen seconds.
 */
export class ContextEngine {
  private lastGuidanceAt = 0;
  private recent = new Map<string, number>();
  world: WorldState = { detections: [], sounds: [], transcript: "", lastGuidance: "", updatedAt: 0 };

  ingest(event: NormalizedEvent) {
    if (event.source === "vision") this.world.detections = [event, ...this.world.detections].slice(0, 12);
    if (event.source === "audio") this.world.sounds = [event, ...this.world.sounds].slice(0, 12);
    if (event.source === "speech") this.world.transcript = event.message;
    this.world.updatedAt = Date.now();
    return this.world;
  }

  rank(event: NormalizedEvent, profile: AccessibilityProfile) {
    const distance = event.distance ?? event.proximity;
    const proximity = distance ? Math.max(1, 20 - distance) : 1;
    const seenAt = this.recent.get(this.key(event)) ?? 0;
    const novelty = event.novelty ?? (Date.now() - seenAt > 15000 ? 2 : 0.5);
    const relevance = (event.relevantNeeds ?? defaultNeeds).some((need) => profile[need]) ? 2 : 1;
    return severityWeight[event.severity] * proximity * novelty * relevance;
  }

  private key(event: NormalizedEvent) { return `${event.source}:${event.type}:${event.subtype ?? ""}`; }

  toDirective(event: NormalizedEvent, profile: AccessibilityProfile): AssistanceDirective | null {
    this.ingest(event);
    const now = Date.now();
    const critical = event.severity === "critical";
    if (!critical && now - this.lastGuidanceAt < 4000) return null;
    const previous = this.recent.get(this.key(event)) ?? 0;
    if (!critical && now - previous < 15000) return null;
    this.lastGuidanceAt = now;
    this.recent.set(this.key(event), now);
    this.world.lastGuidance = event.message;
    return {
      eventId: event.id, message: event.message, severity: event.severity,
      modalities: resolveModalities(profile),
      avatarState: critical ? "warning" : event.severity === "warn" ? "guiding" : "speaking",
      gesture: critical ? "stop_palm" : event.direction === "right" ? "point_right" : event.direction === "left" ? "point_left" : "open_palms",
      direction: event.direction, distance: event.distance, mock: event.mock,
    };
  }
}

/**
 * Channels are a union across needs, and conflicts resolve to the more
 * accessible option (for example visual output escalates to maximum whenever
 * hearing assistance is active). Every directive reaches at least two channels.
 */
export function resolveModalities(profile: AccessibilityProfile): Modality[] {
  const channels = new Set<Modality>(["visual", "caption"]);
  if (profile.visual) { channels.add("speech"); channels.add("haptic"); }
  if (profile.hearing) { channels.add("haptic"); }
  if (profile.speech) { channels.add("sign"); channels.add("haptic"); }
  if (profile.hearing && !profile.visual) channels.delete("speech");
  return [...channels];
}

export function visualEmphasis(profile: AccessibilityProfile): "standard" | "maximum" {
  return profile.hearing ? "maximum" : "standard";
}

export function hapticStrength(profile: AccessibilityProfile): "medium" | "strong" {
  return profile.visual || profile.hearing ? "strong" : "medium";
}

export const contextEngine = new ContextEngine();
