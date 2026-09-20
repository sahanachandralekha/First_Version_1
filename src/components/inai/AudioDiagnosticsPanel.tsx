import { useState } from "react";
import { Bug, Activity, Check, X, Smartphone, RefreshCw, Volume2 } from "lucide-react";
import { useINAIAudio } from "@/audio/useINAIAudio";
import { inaiAudioManager } from "@/audio/INAIAudioManager";
import { sharedShakeDetector } from "@/motion/ShakeDetector";
import { ttsService } from "@/services/tts";
import { Button } from "@/components/ui/button";

export function AudioDiagnosticsPanel() {
  const isDev = import.meta.env.DEV;
  const [isOpen, setIsOpen] = useState(false);
  const { diagnostics, unlockAudio } = useINAIAudio();

  if (!isDev) {
    return null;
  }

  const handleSimulateShake = async () => {
    // Record synthetic shake magnitude 18.5
    inaiAudioManager.recordShake(18.5);
    console.log("[Diagnostics] Triggering synthetic shake activation");
    await unlockAudio("shake");
  };

  const handleTestChime = () => {
    inaiAudioManager.playConfirmationChime();
  };

  const handleTestSpeak = () => {
    void ttsService.speak("INAI voice diagnostic test. System is operational.", {
      priority: "alert",
      interrupt: true,
    });
  };

  return (
    <aside
      aria-label="INAI Audio Diagnostics (Development Only)"
      className="fixed bottom-3 right-3 z-50 max-w-sm rounded-xl border border-border bg-card/95 p-3 text-xs shadow-2xl backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 font-mono font-bold text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5 text-primary">
          <Bug className="size-3.5" />
          <span>INAI Audio Diagnostics</span>
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2.5 space-y-2 font-mono border-t border-border pt-2 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">AudioContext:</span>
            <span
              className={`font-bold ${
                diagnostics.audioContextState === "running"
                  ? "text-emerald-500"
                  : "text-amber-500"
              }`}
            >
              {diagnostics.audioContextState}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Audio Status:</span>
            <span
              className={`font-bold ${
                diagnostics.audioStatus === "ready"
                  ? "text-emerald-500"
                  : diagnostics.audioStatus === "blocked"
                  ? "text-destructive"
                  : "text-amber-500"
              }`}
            >
              {diagnostics.audioStatus} ({diagnostics.isUnlocked ? "unlocked" : "locked"})
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Environment:</span>
            <span className="font-bold text-foreground">
              {diagnostics.isWebView ? "Android WebView / Appilix" : "Standard Browser"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Motion Sensor:</span>
            <span className="font-bold text-foreground">
              {diagnostics.motionStatus}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Motion Permission:</span>
            <span className="font-bold text-foreground">
              {diagnostics.motionPermission}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Shake Detector:</span>
            <span
              className={`font-bold ${
                diagnostics.shakeDetectorActive ? "text-emerald-500" : "text-muted-foreground"
              }`}
            >
              {diagnostics.shakeDetectorActive ? "active" : "inactive"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">TTS Engine:</span>
            <span
              className={`font-bold ${
                diagnostics.ttsStatus === "ready" ? "text-emerald-500" : "text-foreground"
              }`}
            >
              {diagnostics.ttsStatus}
            </span>
          </div>

          {diagnostics.lastShake && (
            <div className="rounded bg-muted/60 p-1.5 text-[10px]">
              <span className="text-muted-foreground">Last Shake: </span>
              <strong>{diagnostics.lastShake.magnitude} m/s²</strong> (
              {new Date(diagnostics.lastShake.timestamp).toLocaleTimeString()})
            </div>
          )}

          {diagnostics.lastAudioError && (
            <div className="rounded bg-destructive/15 p-1.5 text-[10px] text-destructive">
              <strong>Last Error: </strong>
              {diagnostics.lastAudioError}
            </div>
          )}

          {/* Development Action Helpers */}
          <div className="pt-2 grid grid-cols-3 gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSimulateShake}
              className="h-7 text-[10px] px-1"
            >
              <Smartphone className="size-3 mr-1" />
              Sim Shake
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestChime}
              className="h-7 text-[10px] px-1"
            >
              <Activity className="size-3 mr-1" />
              Chime
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestSpeak}
              className="h-7 text-[10px] px-1"
            >
              <Volume2 className="size-3 mr-1" />
              Speak
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
