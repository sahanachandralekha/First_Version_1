import { useEffect } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ChevronRight, Eye, Brain, Compass, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContextStore } from "@/stores/context-store";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { ttsService } from "@/services/tts";
import { ModeBadge } from "./ModeBadge";
import { INAIAvatar } from "./INAIAvatar";

const steps: Array<[typeof Eye, string]> = [
  [Eye, "See"],
  [Brain, "Understand"],
  [Compass, "Decide"],
  [Footprints, "Guide"],
];

const directionLabel: Record<string, string> = {
  left: "From your left",
  right: "From your right",
  front: "From in front of you",
  back: "From behind you",
};

/**
 * Global emergency overlay mounted above the router. A critical directive
 * preempts speech, fires the strongest haptic pattern and takes over the
 * screen, so the warning reaches sight, sound and touch at once.
 */
export function AlertOverlayHost() {
  const alertLevel = useContextStore((s) => s.alertLevel);
  const directive = useContextStore((s) => s.criticalDirective);
  const lastGuidance = useContextStore((s) => s.lastGuidance);
  const setContext = useContextStore((s) => s.setContext);
  const hapticEnabled = useAccessibilityStore((s) => s.prefs.hapticEnabled);
  const voiceEnabled = useAccessibilityStore((s) => s.prefs.voiceEnabled);
  const reducedMotion = useAccessibilityStore((s) => s.prefs.reducedMotion);
  const active = alertLevel === "critical";

  const headline = (directive?.message ?? lastGuidance ?? "").toUpperCase() || "IMPORTANT ALERT NEARBY";
  const source = directive?.direction ? directionLabel[directive.direction] ?? "Close to you" : "Close to you";
  const distance = directive?.distance ? `~${Math.round(directive.distance)} m away` : "Very close";

  useEffect(() => {
    if (!active) return;
    if (hapticEnabled && typeof navigator !== "undefined") navigator.vibrate?.([400, 100, 400, 100, 400]);
    if (voiceEnabled) {
      void ttsService.speak(directive?.message ?? lastGuidance ?? "Warning", { priority: "emergency" }).catch(() => undefined);
    }
    const timeout = window.setTimeout(() => {
      setContext({ alertLevel: "info", criticalDirective: null });
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [active, hapticEnabled, voiceEnabled, directive, lastGuidance, setContext]);

  if (!active) return null;

  const dismiss = () => {
    ttsService.cancel();
    setContext({ alertLevel: "info", criticalDirective: null });
  };

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label="Urgent alert from INAI"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, x: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, x: [0, -3, 3, -3, 0] }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
      className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-destructive text-destructive-foreground"
    >
      <p aria-live="assertive" className="sr-only">{`Warning. ${headline}. ${source}. Maintain distance.`}</p>

      <div className="flex flex-1 flex-col items-center gap-4 px-6 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <motion.span
          className="grid size-20 place-items-center rounded-full bg-destructive-foreground/15"
          {...(reducedMotion ? {} : { animate: { scale: [1, 1.08, 1] }, transition: { duration: 1.1, repeat: Infinity } })}
          aria-hidden="true"
        >
          <AlertTriangle className="size-12" />
        </motion.span>
        <p className="text-xl font-extrabold tracking-[0.3em]">WARNING</p>
        <h2 className="text-3xl font-extrabold leading-tight">{headline}</h2>
        <p className="text-base font-bold">{source}</p>
        <p className="text-sm font-semibold opacity-90">Maintain distance</p>

        <div className="w-44">
          <INAIAvatar state="warning" gesture="stop_palm" size="sm" />
        </div>

        <div className="flex w-full items-center gap-3 rounded-card bg-destructive-foreground/15 p-3 text-left">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-control bg-destructive-foreground/20">
            <AlertTriangle className="size-7" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold">{directive?.message ?? "Something is close to you"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-chip bg-destructive-foreground/20 px-2 py-0.5">{distance}</span>
              {directive?.mock && <ModeBadge mode="MOCK" />}
            </p>
          </div>
          <span aria-hidden="true" className="flex">
            <ChevronRight className="size-5 opacity-60" /><ChevronRight className="size-5 -ml-3" />
          </span>
        </div>

        <ol className="flex w-full items-center justify-between gap-1 text-[0.7rem] font-extrabold">
          {steps.map(([Icon, label]) => (
            <li key={label} className="flex flex-1 flex-col items-center gap-1 rounded-control bg-destructive-foreground/10 px-1 py-2">
              <Icon className="size-4" aria-hidden="true" />{label}
            </li>
          ))}
        </ol>
      </div>

      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Button
          className="h-14 w-full rounded-full bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90"
          onClick={dismiss}
        >
          Got it
        </Button>
      </div>
    </motion.div>
  );
}
