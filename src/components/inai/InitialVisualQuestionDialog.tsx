import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye,
  EyeOff,
  Mic,
  Volume2,
  VolumeX,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { ttsService, setTTSVoiceEnabled } from "@/services/tts";
import { sttService, isSpeechRecognitionSupported } from "@/services/stt";
import { matchYesNoIntent } from "@/lib/inai/voice-accessibility";

export const VISUAL_IMPAIRMENT_ANSWER_KEY = "inai_visually_impaired_answered";

export function InitialVisualQuestionDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setStatusMessage] = useState<string>("");
  const [recognizedText, setRecognizedText] = useState<string>("");
  const [audioStatus, setAudioStatus] = useState<"idle" | "speaking" | "listening">("idle");
  const [, setIsMicAvailable] = useState<boolean>(true);

  const setNeed = useAccessibilityStore((state) => state.setNeed);
  const setPreference = useAccessibilityStore((state) => state.setPreference);
  const setOnboarded = useAccessibilityStore((state) => state.setOnboarded);
  const prefs = useAccessibilityStore((state) => state.prefs);

  const activeTokenRef = useRef(0);
  const unmountedRef = useRef(false);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const timeoutTimerRef = useRef<number | undefined>(undefined);

  // Stop STT and TTS
  const stopAllAudio = useCallback(() => {
    if (timeoutTimerRef.current) {
      window.clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = undefined;
    }
    isListeningRef.current = false;
    isSpeakingRef.current = false;
    sttService.stop();
    ttsService.cancel();
    setAudioStatus("idle");
  }, []);

  // Safe TTS helper that plays audio prompt
  const speakPrompt = useCallback(
    async (text: string) => {
      const token = activeTokenRef.current;
      stopAllAudio();
      if (unmountedRef.current) return;

      setAudioStatus("speaking");
      isSpeakingRef.current = true;
      setStatusMessage(text);

      try {
        await ttsService.speak(text, { priority: "alert", interrupt: true });
      } catch {
        // Continue if browser restricts autoplay
      } finally {
        if (activeTokenRef.current === token && !unmountedRef.current) {
          isSpeakingRef.current = false;
          setAudioStatus("idle");
        }
      }
    },
    [stopAllAudio],
  );

  // Handle YES answer (Visually Impaired -> Full Voice Assistance)
  const handleAnswerYes = useCallback(async () => {
    activeTokenRef.current++;
    stopAllAudio();

    // Configure stores
    setNeed("visual", true);
    setPreference("voiceEnabled", true);
    setTTSVoiceEnabled(true);
    setOnboarded(true);

    try {
      localStorage.setItem(VISUAL_IMPAIRMENT_ANSWER_KEY, "yes");
      sessionStorage.setItem("inai_startup_accessibility_handled", "yes");
    } catch {
      // Ignore
    }

    // Dispatch global event for listeners (like VisionScreen)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inai:visual_impairment_confirmed", { detail: { answer: "yes" } }),
      );
    }

    setIsOpen(false);

    // Speak vocal confirmation
    await ttsService
      .speak("Visually impaired mode activated. Full voice assistance is enabled.", {
        priority: "alert",
        interrupt: true,
      })
      .catch(() => undefined);
  }, [setNeed, setOnboarded, setPreference, stopAllAudio]);

  // Handle NO answer (Not Visually Impaired -> No Voice Assistance)
  const handleAnswerNo = useCallback(() => {
    activeTokenRef.current++;
    stopAllAudio();

    // Disable all voice assistance immediately
    setNeed("visual", false);
    setPreference("voiceEnabled", false);
    setTTSVoiceEnabled(false);

    try {
      localStorage.setItem(VISUAL_IMPAIRMENT_ANSWER_KEY, "no");
      sessionStorage.setItem("inai_startup_accessibility_handled", "no");
    } catch {
      // Ignore
    }

    // Dispatch global event
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inai:visual_impairment_confirmed", { detail: { answer: "no" } }),
      );
    }

    setIsOpen(false);
  }, [setNeed, setPreference, stopAllAudio]);

  // Safe STT listening helper for "Yes" or "No"
  const startListeningForAnswer = useCallback(() => {
    const token = activeTokenRef.current;
    if (!isSpeechRecognitionSupported()) {
      setIsMicAvailable(false);
      return;
    }

    stopAllAudio();
    if (unmountedRef.current) return;

    setAudioStatus("listening");
    isListeningRef.current = true;
    let handled = false;
    let debounceTimer: number | undefined;

    // Timeout after 12 seconds of silence
    timeoutTimerRef.current = window.setTimeout(() => {
      if (activeTokenRef.current === token && !handled && isListeningRef.current) {
        handled = true;
        stopAllAudio();
      }
    }, 12000);

    const unsub = sttService.subscribe((text, isFinal) => {
      if (activeTokenRef.current !== token || handled || !isListeningRef.current) return;
      const clean = text.trim();
      if (!clean) return;

      setRecognizedText(clean);
      const intent = matchYesNoIntent(clean);

      if (intent === "yes") {
        handled = true;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        stopAllAudio();
        void handleAnswerYes();
        return;
      }

      if (intent === "no") {
        handled = true;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        stopAllAudio();
        handleAnswerNo();
        return;
      }

      if (isFinal) {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          if (activeTokenRef.current === token && !handled && isListeningRef.current) {
            // Unrecognized answer, prompt gently
            setStatusMessage("Please say Yes or No, or tap a button below.");
          }
        }, 800);
      }
    });

    sttService.onError(() => {
      if (activeTokenRef.current === token && !handled) {
        handled = true;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        stopAllAudio();
      }
    });

    sttService.start().catch(() => {
      if (activeTokenRef.current === token && !handled) {
        handled = true;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        stopAllAudio();
        setIsMicAvailable(false);
      }
    });

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      unsub();
      stopAllAudio();
    };
  }, [handleAnswerNo, handleAnswerYes, stopAllAudio]);

  // Prompt the question: speak + start listening
  const promptQuestion = useCallback(async () => {
    const token = ++activeTokenRef.current;
    setRecognizedText("");
    const questionText = "Are you visually impaired? Please say Yes or No, or tap a button.";
    setStatusMessage(questionText);

    // Speak prompt aloud
    await speakPrompt(questionText);
    if (activeTokenRef.current !== token || unmountedRef.current) return;

    // Start listening for response
    startListeningForAnswer();
  }, [speakPrompt, startListeningForAnswer]);

  // Check initial answer status on mount and register trigger events
  useEffect(() => {
    unmountedRef.current = false;

    let hasAnswered: string | null = null;
    try {
      hasAnswered = localStorage.getItem(VISUAL_IMPAIRMENT_ANSWER_KEY);
    } catch {
      // Ignore
    }

    // If not answered yet, open dialog and prompt
    if (!hasAnswered) {
      setIsOpen(true);
      const timer = window.setTimeout(() => {
        void promptQuestion();
      }, 500);
      return () => {
        window.clearTimeout(timer);
        unmountedRef.current = true;
        stopAllAudio();
      };
    } else if (hasAnswered === "no") {
      // Sync store and TTS in case of direct load
      setTTSVoiceEnabled(false);
      setPreference("voiceEnabled", false);
      setNeed("visual", false);
    } else if (hasAnswered === "yes") {
      setTTSVoiceEnabled(true);
      setPreference("voiceEnabled", true);
      setNeed("visual", true);
    }

    return () => {
      unmountedRef.current = true;
      stopAllAudio();
    };
  }, [promptQuestion, setNeed, setPreference, stopAllAudio]);

  // Listen for custom trigger to re-open dialog at any time
  useEffect(() => {
    const handleAskAgain = () => {
      setIsOpen(true);
      void promptQuestion();
    };

    window.addEventListener("inai:ask_visual_impairment", handleAskAgain);
    return () => {
      window.removeEventListener("inai:ask_visual_impairment", handleAskAgain);
    };
  }, [promptQuestion]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-question-title"
        aria-describedby="visual-question-desc"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ duration: prefs.reducedMotion ? 0 : 0.25 }}
          className="relative w-full max-w-lg overflow-hidden rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-2xl md:p-8"
        >
          {/* Header Banner */}
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Eye className="size-7" />
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Accessibility Setup
              </span>
              <h2 id="visual-question-title" className="text-2xl font-black text-foreground">
                Are you visually impaired?
              </h2>
            </div>
          </div>

          <p id="visual-question-desc" className="mt-3 text-sm font-medium text-muted-foreground">
            Please answer by saying <span className="font-bold text-foreground">"Yes"</span> or{" "}
            <span className="font-bold text-foreground">"No"</span>, or choose an option below.
          </p>

          {/* Spoken / Microphone Status Display */}
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary-tint/30 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                {audioStatus === "speaking" && (
                  <span className="flex items-center gap-1.5 text-primary">
                    <Volume2 className="size-4 animate-pulse" /> INAI is speaking...
                  </span>
                )}
                {audioStatus === "listening" && (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Mic className="size-4 animate-bounce" /> Listening for "Yes" or "No"...
                  </span>
                )}
                {audioStatus === "idle" && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Sparkles className="size-4" /> Ready for your response
                  </span>
                )}
              </div>

              {/* Re-listen button */}
              <button
                type="button"
                onClick={() => void promptQuestion()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                aria-label="Repeat question and listen again"
              >
                <Volume2 className="size-3.5" /> Repeat question
              </button>
            </div>

            {recognizedText && (
              <p className="mt-2 text-xs font-semibold text-foreground">
                Heard: <span className="italic text-primary">"{recognizedText}"</span>
              </p>
            )}
          </div>

          {/* Action Choice Buttons */}
          <div className="mt-6 flex flex-col gap-3.5">
            {/* YES BUTTON: Fully Voice Assisted */}
            <Button
              type="button"
              onClick={() => void handleAnswerYes()}
              className="flex min-h-[72px] w-full items-center justify-between rounded-xl bg-primary px-5 py-4 text-left font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-10 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
                  <Volume2 className="size-6" />
                </span>
                <div>
                  <span className="text-base font-extrabold tracking-wide">
                    YES — Visually Impaired
                  </span>
                  <p className="text-xs font-medium text-primary-foreground/85">
                    Fully voice assisted • Spoken scene description, obstacles & text
                  </p>
                </div>
              </div>
              <CheckCircle2 className="size-6 shrink-0 opacity-90" />
            </Button>

            {/* NO BUTTON: Standard Mode / Zero Voice Assistance */}
            <Button
              type="button"
              variant="outline"
              onClick={handleAnswerNo}
              className="flex min-h-[72px] w-full items-center justify-between rounded-xl border-2 border-border bg-card px-5 py-4 text-left font-bold text-foreground shadow-sm transition-transform hover:border-foreground/40 hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <VolumeX className="size-6" />
                </span>
                <div>
                  <span className="text-base font-extrabold tracking-wide text-foreground">
                    NO — Not Visually Impaired
                  </span>
                  <p className="text-xs font-medium text-muted-foreground">
                    Standard visual mode • No voice assistance after selecting No
                  </p>
                </div>
              </div>
              <EyeOff className="size-5 shrink-0 text-muted-foreground" />
            </Button>
          </div>

          {/* Bottom Hint */}
          <div className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <HelpCircle className="size-3.5" />
            <span>You can change this anytime from the top bar or settings.</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
