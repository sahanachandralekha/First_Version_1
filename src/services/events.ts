import type { Need } from "@/stores/accessibility-store";

export type Severity = "info" | "notice" | "warn" | "critical";
export type Modality = "visual" | "caption" | "speech" | "haptic" | "sign";
export interface NormalizedEvent {
  id: string; source: "vision" | "audio" | "speech" | "location" | "emergency" | "demo";
  type: string; message: string; severity: Severity; proximity?: number; novelty?: number;
  relevantNeeds?: Need[]; timestamp: number;
}
export interface AssistanceDirective {
  eventId: string; message: string; severity: Severity; modalities: Modality[];
  avatarState: "idle" | "listening" | "thinking" | "speaking" | "warning" | "emergency" | "signing" | "guiding";
  gesture?: string;
}

type Listener = (event: NormalizedEvent) => void;
export class EventBus {
  private listeners = new Set<Listener>();
  emit(event: NormalizedEvent) { this.listeners.forEach((listener) => listener(event)); }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
export const eventBus = new EventBus();
