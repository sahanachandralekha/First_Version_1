import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, FlaskConical, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "./StatusPill";
import { useSessionStore } from "@/stores/session-store";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { useContextStore } from "@/stores/context-store";
import { contextEngine } from "@/services/context-engine";
import { routeDirective } from "@/services/output-router";
import { ttsService } from "@/services/tts";
import { hapticService } from "@/services/haptics";
import { visionService } from "@/services/vision";
import { audioEventService } from "@/services/audio-events";
import { sttService } from "@/services/stt";
import type { NormalizedEvent } from "@/services/events";

const demoSteps: Array<{ label: string; event: Omit<NormalizedEvent, "id" | "timestamp">; path?: "/communicate/sign" }> = [
  { label: "Stairs detection", event: { source: "vision", type: "stairs", message: "Stairs are about three metres ahead.", severity: "warn", distance: 3, direction: "front", mock: true, relevantNeeds: ["visual"] } },
  { label: "Siren detection", event: { source: "audio", type: "siren", message: "A simulated siren is approaching from your left, about twenty metres away.", severity: "critical", distance: 20, direction: "left", mock: true, relevantNeeds: ["hearing"] } },
  { label: "Classroom transcript", event: { source: "speech", type: "transcript", message: "Your classroom has been moved to Block B.", severity: "notice", mock: true, relevantNeeds: ["hearing"] } },
  { label: "Communication request", event: { source: "speech", type: "communication-request", message: "Communication support is ready.", severity: "notice", mock: true, relevantNeeds: ["speech"] } },
  { label: "Sign demonstration", path: "/communicate/sign", event: { source: "demo", type: "sign-demonstration", message: "Showing the reviewed sign for I need medical assistance.", severity: "notice", mock: true, relevantNeeds: ["speech"] } },
  { label: "Emergency", event: { source: "emergency", type: "simulated-emergency", message: "Simulated emergency support has been activated.", severity: "critical", mock: true } },
];

export function stopActiveServices() {
  ttsService.cancel();
  visionService.stop();
  audioEventService.stop();
  sttService.stop();
  hapticService.stop();
}

export function DemoControls() {
  const enabled = useSessionStore((state) => state.demoMode);
  const setDemoMode = useSessionStore((state) => state.setDemoMode);
  const resetSession = useSessionStore((state) => state.resetSession);
  const profile = useAccessibilityStore((state) => state.profile);
  const prefs = useAccessibilityStore((state) => state.prefs);
  const resetAccessibility = useAccessibilityStore((state) => state.reset);
  const resetContext = useContextStore((state) => state.reset);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setRunning(false);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const trigger = useCallback((index: number) => {
    const step = demoSteps[index];
    if (!step) return;
    if (step.path) void navigate({ to: step.path });
    const event: NormalizedEvent = { ...step.event, id: `demo-${index}-${Date.now()}`, timestamp: Date.now() };
    const directive = contextEngine.toDirective(event, profile);
    if (!directive) return;
    routeDirective(directive, profile, {
      voiceEnabled: prefs.voiceEnabled,
      hapticEnabled: prefs.hapticEnabled,
      signEnabled: prefs.signEnabled,
      onCaption: () => undefined,
    });
  }, [navigate, prefs.hapticEnabled, prefs.signEnabled, prefs.voiceEnabled, profile]);

  const run = () => {
    clearTimers();
    setRunning(true);
    demoSteps.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => {
        trigger(index);
        if (index === demoSteps.length - 1) setRunning(false);
      }, index * 2600));
    });
  };

  const reset = () => {
    clearTimers();
    stopActiveServices();
    resetContext();
    resetAccessibility();
    resetSession();
    setDemoMode(false);
    void navigate({ to: "/splash" });
  };

  if (!enabled) return null;
  return (
    <aside className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] w-[min(calc(100vw-1rem),464px)] -translate-x-1/2" aria-label="Demo controls">
      {open && (
        <div className="mb-2 rounded-card border border-warning/40 bg-background p-4 shadow-inai">
          <div className="flex items-center justify-between gap-3">
            <DemoBadge />
            <Button variant="ghost" size="icon" aria-label="Close demo controls" onClick={() => setOpen(false)}><X /></Button>
          </div>
          <Button className="mt-3 w-full" onClick={run} disabled={running}><Play />{running ? "Running demo sequence" : "Run demo sequence"}</Button>
          <p className="mt-3 text-xs font-bold text-muted-foreground">Manual recovery triggers</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {demoSteps.map((step, index) => <Button key={step.label} variant="outline" className="h-auto min-h-12 whitespace-normal px-3 text-xs" onClick={() => trigger(index)}>{step.label}</Button>)}
          </div>
          <Button variant="outline" className="mt-3 w-full border-danger/40 text-danger" onClick={reset}><RotateCcw />Reset demo</Button>
        </div>
      )}
      <Button className="ml-auto flex shadow-inai" variant="outline" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <FlaskConical /> Demo <ChevronDown className={open ? "rotate-180" : ""} />
      </Button>
    </aside>
  );
}