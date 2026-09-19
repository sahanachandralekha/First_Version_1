import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ServiceMode } from "@/services/types";

type PermissionState = "prompt" | "granted" | "denied" | "unavailable";
interface SessionState {
  permissions: Record<"camera" | "microphone" | "location" | "notifications", PermissionState>;
  serviceHealth: Record<string, "ready" | "degraded" | "offline">;
  serviceModes: Record<string, ServiceMode>;
  demoMode: boolean;
  setPermission: (name: keyof SessionState["permissions"], value: PermissionState) => void;
  setServiceHealth: (name: string, value: "ready" | "degraded" | "offline") => void;
  setDemoMode: (enabled: boolean) => void;
}

export const useSessionStore = create<SessionState>()(persist((set) => ({
  permissions: { camera: "prompt", microphone: "prompt", location: "prompt", notifications: "prompt" },
  serviceHealth: {},
  serviceModes: {},
  demoMode: false,
  setPermission: (name, value) => set((state) => ({ permissions: { ...state.permissions, [name]: value } })),
  setServiceHealth: (name, value) => set((state) => ({ serviceHealth: { ...state.serviceHealth, [name]: value } })),
  setDemoMode: (demoMode) => set({ demoMode }),
}), { name: "inai-session", skipHydration: true }));
