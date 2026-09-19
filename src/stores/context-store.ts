import { create } from "zustand";
import type { NormalizedEvent } from "@/services/events";

export interface Detection { id: string; label: string; confidence: number; distanceMetres?: number }
export interface AudioEvent { id: string; label: string; confidence: number; direction?: string; distanceMetres?: number }
export interface ConversationMessage { id: string; author: "user" | "inai"; text: string; createdAt: string }

interface ContextState {
  detections: Detection[];
  audioEvents: AudioEvent[];
  transcript: string;
  location: { latitude: number; longitude: number; label?: string } | null;
  alertLevel: NormalizedEvent["severity"];
  lastGuidance: string;
  conversation: ConversationMessage[];
  setContext: (patch: Partial<Omit<ContextState, "setContext">>) => void;
  reset: () => void;
}

const initial = {
  detections: [], audioEvents: [], transcript: "", location: null,
  alertLevel: "info" as const, lastGuidance: "", conversation: [],
};

export const useContextStore = create<ContextState>((set) => ({
  ...initial,
  setContext: (patch) => set(patch),
  reset: () => set(initial),
}));
