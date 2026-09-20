import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AlertTriangle, Volume2 } from "lucide-react";
import { AppShell, InaiSparkles, ScriptNote } from "@/components/layout/primitives";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { CaptionRegion } from "@/components/inai/CaptionRegion";
import { ModeBadge } from "@/components/inai/ModeBadge";
import { Button } from "@/components/ui/button";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { ttsService } from "@/services/tts";
import { hapticService } from "@/services/haptics";
import { AccessibilityStartupFlow } from "@/components/inai/AccessibilityStartupFlow";

const footer = <p className="py-5 text-center text-[10px] font-bold uppercase text-muted-foreground">People · Access · Opportunities · Together</p>;

export function SplashScreen() {
  const navigate = useNavigate();
  const reducedMotion = useAccessibilityStore((state) => state.prefs.reducedMotion);

  useEffect(() => {
    void Promise.resolve(useAccessibilityStore.persist.rehydrate());
  }, []);

  return (
    <AppShell>
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6 text-center">
        <h1 className="sr-only">INAI accessibility companion</h1>
        <ScriptNote className="left-8 top-12 text-3xl">Hi! I’m INAI</ScriptNote>
        <ScriptNote className="right-8 top-20 text-xl">Here for you, always</ScriptNote>
        <InaiSparkles className="right-10 top-16" />
        <INAIAvatar state="idle" size="full" />
        <p aria-hidden="true" className="text-5xl font-extrabold text-primary">INAI</p>
        <p className="mt-1 text-base text-muted-foreground">Your intelligent accessibility companion</p>
        
        {/* Startup Accessibility Voice Orchestrator Layer */}
        <AccessibilityStartupFlow
          onFlowComplete={() => {
            const onboarded = useAccessibilityStore.getState().onboarded;
            void navigate({ to: onboarded ? "/home" : "/onboarding/intro" });
          }}
        />

        <div className="mt-6 h-2 w-60 overflow-hidden rounded-chip bg-primary-tint" aria-label="Loading INAI">
          <motion.div className="h-full rounded-chip bg-primary" initial={{ width: "8%" }} animate={{ width: "100%" }} transition={{ duration: reducedMotion ? 0 : 2.2, ease: "easeOut" }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Building a more inclusive tomorrow…</p>
      </div>
      {footer}
    </AppShell>
  );
}

export function AlertScreen() {
  const navigate = useNavigate();
  const message = "Warning. A simulated vehicle is approaching from your right. Please maintain distance.";
  useEffect(() => {
    hapticService.pattern([300, 150, 300]);
    void ttsService.speak(message, { priority: "emergency", interrupt: true }).catch(() => undefined);
    return () => { ttsService.cancel(); hapticService.stop(); };
  }, []);
  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col bg-speech-tint px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <div role="alert" className="rounded-control bg-danger px-4 py-3 font-extrabold text-destructive-foreground">SIMULATED ALERT</div>
        <AlertTriangle aria-hidden="true" className="mx-auto mt-5 size-16 text-danger" />
        <h1 className="mt-3 text-3xl font-extrabold text-danger">Vehicle approaching</h1>
        <p className="mt-2 text-xl font-bold text-ink">From your right · approximately 8 m away</p>
        <div className="mx-auto mt-3"><ModeBadge mode="MOCK" /></div>
        <div className="mt-auto grid grid-cols-[8rem_1fr] items-end gap-3 text-left">
          <INAIAvatar state="warning" gesture="stop_palm" size="sm" speech={message} />
          <div className="rounded-card bg-background p-4 shadow-inai"><strong className="text-danger">INAI</strong><p className="mt-2 font-bold">{message}</p></div>
        </div>
        <CaptionRegion message={message} critical />
        <Button className="mt-6 min-h-14 rounded-chip bg-danger text-destructive-foreground" onClick={() => { ttsService.cancel(); void navigate({ to: "/home" }); }}><Volume2 />Got it</Button>
      </div>
    </AppShell>
  );
}