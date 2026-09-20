import { useState, useCallback } from "react";
import { Volume2, Sparkles, Smartphone, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INAIAvatar } from "./INAIAvatar";
import { useINAIAudio } from "@/audio/useINAIAudio";
import { useShakeToActivate } from "@/motion/useShakeToActivate";

export interface VoiceActivationCardProps {
  onActivated?: () => void;
  className?: string;
  autoFocus?: boolean;
}

export function VoiceActivationCard({
  onActivated,
  className = "",
  autoFocus = false,
}: VoiceActivationCardProps) {
  const { status, isUnlocked, unlockAudio } = useINAIAudio();
  const [isActivating, setIsActivating] = useState(false);

  // Hook up shake to unlock audio
  const { requestMotionPermission } = useShakeToActivate({
    enabled: !isUnlocked,
    onActivated: () => {
      onActivated?.();
    },
  });

  const handleActivate = useCallback(async () => {
    setIsActivating(true);
    try {
      // 1. Concurrently request motion permission on the gesture
      void requestMotionPermission();

      // 2. Unlock Web Audio & media element
      const success = await unlockAudio("button");
      if (success) {
        onActivated?.();
      }
    } finally {
      setIsActivating(false);
    }
  }, [onActivated, requestMotionPermission, unlockAudio]);

  return (
    <section
      aria-labelledby="voice-activation-title"
      className={`relative w-full rounded-2xl border-2 border-primary/40 bg-card p-5 text-center shadow-lg transition-all ${className}`}
    >
      {/* Header with Avatar & Title */}
      <div className="flex items-center justify-center gap-3">
        <INAIAvatar state={isUnlocked ? "speaking" : "idle"} size="sm" />
        <div>
          <h2
            id="voice-activation-title"
            className="text-xl font-extrabold tracking-tight text-foreground"
          >
            Voice Assistance
          </h2>
          <p className="text-xs font-medium text-muted-foreground">
            Spoken alerts, guidance, and environmental safety
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-foreground/90 font-medium">
        INAI can speak alerts, live obstacle warnings, and navigation guidance aloud.
      </p>

      {/* Primary Action: Accessible Big Button */}
      <div className="mt-5">
        <Button
          type="button"
          size="lg"
          autoFocus={autoFocus}
          disabled={isActivating || isUnlocked}
          onClick={handleActivate}
          aria-label={
            isUnlocked
              ? "INAI Voice is enabled and ready"
              : isActivating
              ? "Enabling INAI Voice, please wait"
              : "Enable INAI Voice now"
          }
          className={`min-h-[58px] w-full rounded-xl text-base font-extrabold shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2.5 ${
            isUnlocked
              ? "bg-emerald-600 hover:bg-emerald-600 text-white cursor-default"
              : "bg-primary hover:bg-primary/95 text-primary-foreground"
          }`}
        >
          {isActivating ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span>Enabling INAI Voice...</span>
            </>
          ) : isUnlocked ? (
            <>
              <CheckCircle2 className="size-5" />
              <span>INAI Voice Ready</span>
            </>
          ) : (
            <>
              <Volume2 className="size-5" />
              <span>Enable INAI Voice</span>
            </>
          )}
        </Button>
      </div>

      {/* Alternative Access for Visually Impaired: Physical Shake */}
      {!isUnlocked && (
        <div className="mt-4 pt-3 border-t border-border/60">
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span className="h-px w-8 bg-border" />
            <span>Or Deliberately</span>
            <span className="h-px w-8 bg-border" />
          </div>

          <div
            role="note"
            tabIndex={0}
            aria-label="Alternative activation: Shake your phone firmly to enable voice assistance"
            className="mt-2.5 flex items-center justify-center gap-2.5 rounded-lg bg-primary/10 px-3.5 py-2.5 text-xs font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Smartphone className="size-4 shrink-0 animate-pulse" />
            <span>Shake your phone to activate voice assistance</span>
          </div>
        </div>
      )}

      {/* State Feedback Footer */}
      <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold">
        {isUnlocked ? (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
            🟢 Voice Ready
          </span>
        ) : status === "blocked" ? (
          <span className="flex items-center gap-1.5 text-amber-600">
            <AlertCircle className="size-3.5" />
            Voice setup needed — please tap above
          </span>
        ) : status === "initializing" ? (
          <span className="flex items-center gap-1.5 text-primary">
            <Sparkles className="size-3.5 animate-spin" />
            Preparing voice assistance...
          </span>
        ) : (
          <span className="text-muted-foreground">
            Ready to initialize
          </span>
        )}
      </div>
    </section>
  );
}
