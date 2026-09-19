import { useCallback, useEffect, useState } from "react";
import { ttsService, setVoiceSettings, type SpeechPriority } from "@/services/tts";
import { useAccessibilityStore } from "@/stores/accessibility-store";

/**
 * Single entry point for spoken output: keeps captions, lip sync and the
 * speaking indicator in step with the TTS queue.
 */
export function useINAIVoice() {
  const voiceEnabled = useAccessibilityStore((state) => state.prefs.voiceEnabled);
  const language = useAccessibilityStore((state) => state.prefs.language);
  const inai = useAccessibilityStore((state) => state.inai);
  const [caption, setCaption] = useState("");
  const [critical, setCritical] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouthOpenness, setMouthOpenness] = useState(0);

  useEffect(() => {
    setVoiceSettings({ rate: inai.speakingRate, pitch: inai.pitch, language });
  }, [inai.speakingRate, inai.pitch, language]);

  useEffect(() => {
    ttsService.callbacks = {
      onStart: () => setSpeaking(true),
      onEnd: () => { setSpeaking(false); setMouthOpenness(0); },
      onMouth: (value) => setMouthOpenness(value),
      onCaption: (text, priority) => { setCaption(text); setCritical(priority === "emergency"); },
    };
    return () => {
      ttsService.cancel();
      ttsService.callbacks = {};
    };
  }, []);

  const speak = useCallback((text: string, priority: SpeechPriority = "guidance") => {
    setCaption(text);
    setCritical(priority === "emergency");
    if (!voiceEnabled) return Promise.resolve();
    return ttsService.speak(text, { priority }).catch(() => undefined);
  }, [voiceEnabled]);

  const cancel = useCallback(() => { ttsService.cancel(); setSpeaking(false); setMouthOpenness(0); }, []);

  return { speak, cancel, caption, critical, speaking, mouthOpenness };
}
