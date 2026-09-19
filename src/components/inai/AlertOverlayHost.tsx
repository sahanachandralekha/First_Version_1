import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { AlertTriangle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContextStore } from "@/stores/context-store";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { INAIAvatar } from "./INAIAvatar";

/**
 * Global emergency overlay mounted above the router. When the context store
 * escalates to a critical alert, INAI takes over the screen multimodally.
 */
export function AlertOverlayHost() {
  const alertLevel = useContextStore((s) => s.alertLevel);
  const lastGuidance = useContextStore((s) => s.lastGuidance);
  const setContext = useContextStore((s) => s.setContext);
  const hapticEnabled = useAccessibilityStore((s) => s.prefs.hapticEnabled);
  const navigate = useNavigate();
  const active = alertLevel === "critical";

  useEffect(() => {
    if (active && hapticEnabled && navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }, [active, hapticEnabled]);

  if (!active) return null;
  const dismiss = () => {
    setContext({ alertLevel: "info" });
    void navigate({ to: "/emergency" });
  };
  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergency alert from INAI"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[90] flex flex-col bg-destructive text-destructive-foreground"
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="grid size-24 place-items-center rounded-full bg-destructive-foreground/15">
          <AlertTriangle className="size-14" aria-hidden="true" />
        </span>
        <p className="mt-4 text-2xl font-extrabold tracking-wide">WARNING</p>
        <h2 className="text-4xl font-extrabold leading-tight">{lastGuidance || "Important alert nearby"}</h2>
        <div className="mt-8 w-52">
          <INAIAvatar state="emergency" size="sm" speech={lastGuidance} />
        </div>
      </div>
      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Button
          className="h-14 w-full rounded-full bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90"
          onClick={dismiss}
        >
          <Volume2 /> Got it
        </Button>
      </div>
    </motion.div>
  );
}
