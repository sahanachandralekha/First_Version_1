import { useEffect, useRef, useCallback } from "react";
import { sharedShakeDetector } from "./ShakeDetector";
import { inaiAudioManager } from "../audio/INAIAudioManager";

export interface UseShakeToActivateOptions {
  enabled?: boolean;
  onActivated?: (source: "shake") => void;
}

export function useShakeToActivate({
  enabled = true,
  onActivated,
}: UseShakeToActivateOptions = {}) {
  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleShake = async (magnitude: number) => {
      console.log(`[INAI Motion Hook] Handling shake with magnitude ${magnitude}`);
      const success = await inaiAudioManager.unlockAudio("shake");
      if (success) {
        onActivatedRef.current?.("shake");
      }
    };

    sharedShakeDetector.start(handleShake);

    return () => {
      sharedShakeDetector.stop();
    };
  }, [enabled]);

  const requestMotionPermission = useCallback(async () => {
    return sharedShakeDetector.requestPermission();
  }, []);

  return {
    requestMotionPermission,
  };
}
