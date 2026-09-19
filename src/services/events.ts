import type { Need } from "@/stores/accessibility-store";

export type Severity = "info" | "notice" | "warn" | "critical";
export type Modality = "visual" | "caption" | "speech" | "haptic" | "sign";
export type EventSource = "vision" | "audio" | "speech" | "location" | "emergency" | "demo" | "scene";

export interface NormalizedEvent {
  id: string;
  source: EventSource;
  type: string;
  subtype?: string;
  label?: string;
  /** Plain-language sentence INAI can speak. */
  message: string;
  confidence?: number;
  severity: Severity;
  /** Approximate distance in metres — never presented as a measurement. */
  distance?: number | undefined;
  direction?: "left" | "right" | "front" | "back" | undefined;
  /** Direction and distance are simulated in this prototype. */
  mock?: boolean | undefined;
  proximity?: number;
  novelty?: number;
  relevantNeeds?: Need[];
  ts?: number;
  timestamp: number;
}

export interface AssistanceDirective {
  eventId: string;
  message: string;
  severity: Severity;
  modalities: Modality[];
  avatarState: "idle" | "listening" | "thinking" | "speaking" | "warning" | "emergency" | "signing" | "guiding";
  gesture?: string;
  direction?: NormalizedEvent["direction"] | undefined;
  distance?: number | undefined;
  mock?: boolean | undefined;
}

export interface WorldState {
  detections: NormalizedEvent[];
  sounds: NormalizedEvent[];
  transcript: string;
  lastGuidance: string;
  updatedAt: number;
}

type Listener = (event: NormalizedEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  emit(event: NormalizedEvent) {
    const enriched = { ts: event.timestamp, ...event };
    this.listeners.forEach((listener) => listener(enriched));
  }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}

export const eventBus = new EventBus();

let counter = 0;
export function nextEventId(prefix: string) { counter += 1; return `${prefix}-${counter}`; }
