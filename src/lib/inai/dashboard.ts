import type { AccessibilityProfile, Need } from "@/stores/accessibility-store";
export interface DashboardContext { activeAlertModule?: string; now: number; alertStartedAt?: number }
export interface DashboardModule { id: string; title: string; requires: Need[]; basePriority: number; urgencyBoost: (context: DashboardContext) => number; size: "hero" | "standard" | "compact" }
const noBoost = () => 0;
export const dashboardModules: DashboardModule[] = [
  { id: "inaiStatus", title: "INAI status", requires: [], basePriority: 100, urgencyBoost: noBoost, size: "hero" },
  { id: "environment", title: "Environment", requires: ["visual"], basePriority: 70, urgencyBoost: noBoost, size: "standard" },
  { id: "soundAwareness", title: "Sound awareness", requires: ["hearing"], basePriority: 68, urgencyBoost: noBoost, size: "standard" },
  { id: "transcription", title: "Live transcription", requires: ["hearing"], basePriority: 62, urgencyBoost: noBoost, size: "standard" },
  { id: "communication", title: "Communication", requires: ["speech"], basePriority: 66, urgencyBoost: noBoost, size: "standard" },
  { id: "signQuick", title: "Quick signs", requires: ["speech"], basePriority: 58, urgencyBoost: noBoost, size: "compact" },
  { id: "location", title: "Location", requires: [], basePriority: 40, urgencyBoost: noBoost, size: "compact" },
  { id: "recentEvents", title: "Recent events", requires: [], basePriority: 30, urgencyBoost: noBoost, size: "compact" },
];
export function resolveDashboard(profile: AccessibilityProfile, context: DashboardContext) {
  const withinPromotion = Boolean(context.activeAlertModule && context.alertStartedAt && context.now - context.alertStartedAt < 30000);
  return dashboardModules.filter((module) => module.requires.every((need) => profile[need]))
    .map((module) => ({ ...module, score: module.basePriority + module.urgencyBoost(context) + (withinPromotion && module.id === context.activeAlertModule ? 1000 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((module, index) => ({ ...module, size: index === 0 ? "hero" as const : index < 3 ? "standard" as const : "compact" as const }));
}
