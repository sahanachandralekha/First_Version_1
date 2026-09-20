import { useEffect, useState, useCallback } from "react";
import { inaiAudioManager } from "./INAIAudioManager";
import type { AudioDiagnostics, AudioStatus } from "./audioTypes";

export function useINAIAudio() {
  const [status, setStatus] = useState<AudioStatus>(() => inaiAudioManager.getStatus());
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics>(() =>
    inaiAudioManager.getDiagnostics()
  );

  useEffect(() => {
    const unsubStatus = inaiAudioManager.subscribe(setStatus);
    const unsubDiag = inaiAudioManager.subscribeDiagnostics(setDiagnostics);
    return () => {
      unsubStatus();
      unsubDiag();
    };
  }, []);

  const unlockAudio = useCallback(async (source: "button" | "shake" = "button") => {
    return inaiAudioManager.unlockAudio(source);
  }, []);

  const playAudio = useCallback(async (url: string) => {
    return inaiAudioManager.playAudio(url);
  }, []);

  const stopAudio = useCallback(() => {
    inaiAudioManager.stop();
  }, []);

  return {
    status,
    isUnlocked: inaiAudioManager.isAudioUnlocked(),
    diagnostics,
    unlockAudio,
    playAudio,
    stopAudio,
    isWebView: inaiAudioManager.isWebView(),
  };
}
