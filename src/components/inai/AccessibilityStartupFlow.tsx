import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Camera, Eye, Mic, MicOff, Navigation, ShieldAlert, Sparkles, Volume2, VolumeX, Check, Waves, ArrowRight, X,
} from "lucide-react";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { Button } from "@/components/ui/button";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { ttsService } from "@/services/tts";
import { sttService, isSpeechRecognitionSupported } from "@/services/stt";
import {
  matchYesNoIntent,
  matchVisuallyImpairedOption,
} from "@/lib/inai/voice-accessibility";
import { useINAIAudio } from "@/audio/useINAIAudio";
import { useShakeToActivate } from "@/motion/useShakeToActivate";
import { VoiceActivationCard } from "@/components/inai/VoiceActivationCard";

export type StartupFlowState =
  | "INITIALIZING"
  | "ANNOUNCING_INITIAL_INTERFACE"
  | "ASKING_VISUAL_IMPAIRMENT"
  | "LISTENING_VISUAL_IMPAIRMENT"
  | "NORMAL_APP"
  | "VISUALLY_IMPAIRED_MODE";

export interface AccessibilityStartupFlowProps {
  onFlowComplete?: () => void;
}

const SESSION_KEY = "inai_startup_accessibility_handled";

export function AccessibilityStartupFlow({ onFlowComplete }: AccessibilityStartupFlowProps) {
  const navigate = useNavigate();
  const setNeed = useAccessibilityStore((state) => state.setNeed);
  const setOnboarded = useAccessibilityStore((state) => state.setOnboarded);
  const prefs = useAccessibilityStore((state) => state.prefs);

  const [state, setState] = useState<StartupFlowState>("INITIALIZING");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [recognizedText, setRecognizedText] = useState<string>("");
  const [audioStatus, setAudioStatus] = useState<"idle" | "speaking" | "listening">("idle");
  const [isMicAvailable, setIsMicAvailable] = useState<boolean>(true);

  const { isUnlocked, unlockAudio } = useINAIAudio();

  // Guard refs to prevent race conditions, duplicate triggers, and memory leaks
  const activeTokenRef = useRef(0);
  const unmountedRef = useRef(false);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const timeoutTimerRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);

  // Stop everything safely
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

  // Safe TTS helper that returns a Promise resolving true if speech played, false if blocked/failed
  const speakStrict = useCallback(async (text: string, priority: "guidance" | "alert" | "emergency" = "guidance"): Promise<boolean> => {
    const token = activeTokenRef.current;
    stopAllAudio();
    if (unmountedRef.current) return false;

    setAudioStatus("speaking");
    isSpeakingRef.current = true;

    try {
      await ttsService.speak(text, { priority, interrupt: true });
      return true;
    } catch {
      return false;
    } finally {
      if (activeTokenRef.current === token && !unmountedRef.current) {
        isSpeakingRef.current = false;
        setAudioStatus("idle");
      }
    }
  }, [stopAllAudio]);

  // Safe STT listening helper with immediate intent match and silence debounce
  const startListeningStrict = useCallback((onResult: (text: string) => void, onTimeout: () => void, timeoutMs = 9000) => {
    const token = activeTokenRef.current;
    if (!isSpeechRecognitionSupported()) {
      setIsMicAvailable(false);
      return () => undefined;
    }

    stopAllAudio();
    if (unmountedRef.current) return () => undefined;

    setAudioStatus("listening");
    isListeningRef.current = true;
    let handled = false;
    let debounceTimer: number | undefined;

    // Set fallback timeout if user says nothing
    timeoutTimerRef.current = window.setTimeout(() => {
      if (activeTokenRef.current === token && !handled && isListeningRef.current) {
        handled = true;
        stopAllAudio();
        onTimeout();
      }
    }, timeoutMs);

    const unsub = sttService.subscribe((text, isFinal) => {
      if (activeTokenRef.current !== token || handled || !isListeningRef.current) return;
      const clean = text.trim();
      if (!clean) return;

      setRecognizedText(clean);

      // Fast-path immediate intent match
      const quickYesNo = matchYesNoIntent(clean);
      const quickOption = matchVisuallyImpairedOption(clean);

      if (isFinal || (state === "LISTENING_VISUAL_IMPAIRMENT" && quickYesNo !== "unclear") || (state === "VISUALLY_IMPAIRED_MODE" && quickOption !== "unclear")) {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        handled = true;
        stopAllAudio();
        onResult(clean);
        return;
      }

      // Debounce fallback for interim speech
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (activeTokenRef.current === token && !handled && isListeningRef.current) {
          handled = true;
          stopAllAudio();
          onResult(clean);
        }
      }, 700);
    });

    sttService.onError(() => {
      if (activeTokenRef.current === token && !handled) {
        handled = true;
        if (debounceTimer) window.clearTimeout(debounceTimer);
        stopAllAudio();
        onTimeout();
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
  }, [state, stopAllAudio]);

  // Proceed to normal app flow when user answers NO or skips
  const proceedToNormalApp = useCallback(() => {
    activeTokenRef.current++;
    stopAllAudio();
    setNeed("visual", false);
    useAccessibilityStore.getState().setPreference("voiceEnabled", false);
    try {
      sessionStorage.setItem(SESSION_KEY, "no");
      localStorage.setItem("inai_visually_impaired_answered", "no");
    } catch {
      // Ignore sessionStorage errors
    }
    setState("NORMAL_APP");
    if (onFlowComplete) {
      onFlowComplete();
    } else {
      const onboarded = useAccessibilityStore.getState().onboarded;
      void navigate({ to: onboarded ? "/home" : "/onboarding/intro" });
    }
  }, [navigate, onFlowComplete, setNeed, stopAllAudio]);

  const listenForVisuallyImpairedOptionRef = useRef<() => void>(() => {});
  const retryVisuallyImpairedOptionRef = useRef<() => void>(() => {});
  const listenForVisualImpairmentAnswerRef = useRef<() => void>(() => {});
  const retryVisualImpairmentQuestionRef = useRef<() => void>(() => {});
  const activateVisuallyImpairedModeRef = useRef<() => Promise<void>>(async () => {});

  // Activate visually impaired mode and announce options
  const activateVisuallyImpairedMode = useCallback(async () => {
    const token = ++activeTokenRef.current;
    stopAllAudio();
    void unlockAudio("button");
    setNeed("visual", true);
    useAccessibilityStore.getState().setPreference("voiceEnabled", true);
    setOnboarded(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "yes");
      localStorage.setItem("inai_visually_impaired_answered", "yes");
    } catch {
      // Ignore
    }
    setState("VISUALLY_IMPAIRED_MODE");
    retryCountRef.current = 0;

    const announcement = "Visually impaired mode activated. You can choose two-way communication, navigation guide, or SOS. What do you need?";
    setStatusMessage(announcement);
    await speakStrict(announcement, "guidance");

    if (activeTokenRef.current !== token || unmountedRef.current) return;

    // Start listening for option
    listenForVisuallyImpairedOptionRef.current();
  }, [setNeed, setOnboarded, speakStrict, stopAllAudio]);

  // Option selection handler
  const handleSelectOption = useCallback(async (option: "communication" | "navigation" | "sos") => {
    activeTokenRef.current++;
    stopAllAudio();
    setState("NORMAL_APP");
    if (onFlowComplete) {
      onFlowComplete();
    }

    if (option === "communication") {
      await speakStrict("Opening two-way communication camera.", "guidance");
      void navigate({ to: "/vision" });
    } else if (option === "navigation") {
      await speakStrict("Opening navigation guide camera.", "guidance");
      void navigate({ to: "/guidance" });
    } else if (option === "sos") {
      await speakStrict("Opening SOS emergency.", "guidance");
      void navigate({ to: "/emergency" });
    }
  }, [navigate, onFlowComplete, speakStrict, stopAllAudio]);

  // Listen for options in Visually Impaired Mode: always open and listening!
  const listenForVisuallyImpairedOption = useCallback(() => {
    const token = activeTokenRef.current;

    startListeningStrict(
      (speech) => {
        if (activeTokenRef.current !== token || unmountedRef.current) return;
        if (/\b(close the app|close app|exit app|exit the app|quit|shut down)\b/i.test(speech)) {
          stopAllAudio();
          void speakStrict("Closing the app. Voice assistance is now off.", "guidance");
          proceedToNormalApp();
          return;
        }

        if (/\b(explain what is in that|explain this screen|explain this page|what is this|where am i|help)\b/i.test(speech)) {
          const explainMsg = "You are on the Visually Impaired main menu. You can choose Two-Way Communication to inspect objects and read text, Navigation Guide for corridor and path guidance, or SOS Emergency for emergency assistance. What would you like to do?";
          setStatusMessage(explainMsg);
          void speakStrict(explainMsg, "guidance").then(() => {
            listenForVisuallyImpairedOptionRef.current();
          });
          return;
        }

        if (/\b(go back|back|previous)\b/i.test(speech)) {
          const backMsg = "You are on the main menu. You can choose Two-Way Communication, Navigation Guide, or SOS Emergency. What would you like to do?";
          setStatusMessage(backMsg);
          void speakStrict(backMsg, "guidance").then(() => {
            listenForVisuallyImpairedOptionRef.current();
          });
          return;
        }

        const option = matchVisuallyImpairedOption(speech);

        if (option === "communication") {
          setRecognizedText("Two-Way Communication");
          void handleSelectOption("communication");
        } else if (option === "navigation") {
          setRecognizedText("Navigation Guide");
          void handleSelectOption("navigation");
        } else if (option === "sos") {
          setRecognizedText("SOS Emergency");
          void handleSelectOption("sos");
        } else {
          // Unclear option - prompt gently and keep listening
          void retryVisuallyImpairedOptionRef.current();
        }
      },
      () => {
        if (activeTokenRef.current !== token || unmountedRef.current) return;
        // Keep listening continuously without locking out
        listenForVisuallyImpairedOptionRef.current();
      },
      10000
    );
  }, [handleSelectOption, startListeningStrict]);

  const retryVisuallyImpairedOption = useCallback(async () => {
    const token = ++activeTokenRef.current;
    const retryMsg = "Please say two-way communication, navigation guide, or SOS.";
    setStatusMessage(retryMsg);
    await speakStrict(retryMsg, "guidance");

    if (activeTokenRef.current === token && !unmountedRef.current) {
      listenForVisuallyImpairedOptionRef.current();
    }
  }, [speakStrict]);

  // Listen for the initial "Are you visually impaired?" answer
  const listenForVisualImpairmentAnswer = useCallback(() => {
    const token = activeTokenRef.current;

    startListeningStrict(
      (speech) => {
        if (activeTokenRef.current !== token || unmountedRef.current) return;
        const intent = matchYesNoIntent(speech);

        if (intent === "yes") {
          setRecognizedText("Yes");
          void activateVisuallyImpairedModeRef.current();
        } else if (intent === "no") {
          setRecognizedText("No");
          proceedToNormalApp();
        } else {
          // Unclear
          void retryVisualImpairmentQuestionRef.current();
        }
      },
      () => {
        if (activeTokenRef.current !== token || unmountedRef.current) return;
        void retryVisualImpairmentQuestionRef.current();
      },
      7000
    );
  }, [proceedToNormalApp, startListeningStrict]);

  // Prompt retry when answer is unclear
  const retryVisualImpairmentQuestion = useCallback(async () => {
    const token = ++activeTokenRef.current;
    retryCountRef.current++;

    if (retryCountRef.current > 3) {
      // Too many retries, proceed normally
      proceedToNormalApp();
      return;
    }

    const retryMsg = "Sorry, I didn't understand. Please say yes or no.";
    setStatusMessage(retryMsg);
    setState("ASKING_VISUAL_IMPAIRMENT");
    const spoke = await speakStrict(retryMsg, "guidance");

    if (activeTokenRef.current === token && !unmountedRef.current) {
      if (spoke) {
        setState("LISTENING_VISUAL_IMPAIRMENT");
        listenForVisualImpairmentAnswerRef.current();
      }
    }
  }, [proceedToNormalApp, speakStrict]);

  const handleAskQuestionAloud = useCallback(async () => {
    const token = ++activeTokenRef.current;
    setState("ASKING_VISUAL_IMPAIRMENT");
    const question = "Are you visually impaired? Please say Yes or No.";
    setStatusMessage(question);
    const spoke = await speakStrict(question, "guidance");
    if (activeTokenRef.current !== token || unmountedRef.current) return;
    if (spoke) {
      setState("LISTENING_VISUAL_IMPAIRMENT");
      listenForVisualImpairmentAnswerRef.current();
    }
  }, [speakStrict]);

  // Handle explicit audio activation via button or physical shake
  const handleVoiceActivated = useCallback(async (source: "button" | "shake") => {
    const token = ++activeTokenRef.current;
    stopAllAudio();

    const confirmMsg = "INAI voice assistance is now enabled.";
    setStatusMessage(confirmMsg);
    await speakStrict(confirmMsg, "alert");

    if (activeTokenRef.current !== token || unmountedRef.current) return;

    // Follow up immediately with visual impairment question
    setState("ASKING_VISUAL_IMPAIRMENT");
    const question = "Are you visually impaired? Please say Yes or No.";
    setStatusMessage(question);
    const spoke = await speakStrict(question, "guidance");

    if (activeTokenRef.current !== token || unmountedRef.current) return;

    if (spoke) {
      setState("LISTENING_VISUAL_IMPAIRMENT");
      listenForVisualImpairmentAnswerRef.current();
    }
  }, [speakStrict, stopAllAudio]);

  useShakeToActivate({
    enabled: !isUnlocked || state === "ASKING_VISUAL_IMPAIRMENT",
    onActivated: () => {
      void handleVoiceActivated("shake");
    },
  });

  // Keep refs up to date
  listenForVisuallyImpairedOptionRef.current = listenForVisuallyImpairedOption;
  retryVisuallyImpairedOptionRef.current = retryVisuallyImpairedOption;
  listenForVisualImpairmentAnswerRef.current = listenForVisualImpairmentAnswer;
  retryVisualImpairmentQuestionRef.current = retryVisualImpairmentQuestion;
  activateVisuallyImpairedModeRef.current = activateVisuallyImpairedMode;

  // Main Startup Flow sequence
  useEffect(() => {
    unmountedRef.current = false;
    const token = ++activeTokenRef.current;

    // Check if the user already responded "No" during this session
    try {
      const sessionVal = sessionStorage.getItem(SESSION_KEY);
      if (sessionVal === "no") {
        proceedToNormalApp();
        return;
      }
    } catch {
      // Ignore
    }

    // Step 1: Immediately Ask Visual Impairment Question First
    const runStartupFlow = async () => {
      setState("ASKING_VISUAL_IMPAIRMENT");
      const question = "Are you visually impaired? Please say Yes or No.";
      setStatusMessage(question);

      // Attempt to speak aloud
      const spoke = await speakStrict(question, "guidance");
      if (activeTokenRef.current !== token || unmountedRef.current) return;

      if (spoke) {
        // ONLY start listening if question was actually spoken aloud!
        setState("LISTENING_VISUAL_IMPAIRMENT");
        listenForVisualImpairmentAnswerRef.current();
      } else {
        // Autoplay restricted by browser until user gesture: stay on ASKING screen with clear visual buttons
        setStatusMessage("Please say Yes or No, or tap a button below.");
      }
    };

    void runStartupFlow();

    return () => {
      unmountedRef.current = true;
      activeTokenRef.current++;
      stopAllAudio();
    };
  }, [proceedToNormalApp, speakStrict, stopAllAudio]);

  return (
    <div className="relative w-full">
      {/* Visual Accessibility Status Bar / Question Modal */}
      <AnimatePresence mode="wait">
        {state === "VISUALLY_IMPAIRED_MODE" ? (
          <motion.div
            key="visually-impaired-mode-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: prefs.reducedMotion ? 0 : 0.2 }}
            className="my-4 w-full rounded-card border-2 border-primary bg-primary-tint/90 p-5 shadow-inai backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-primary font-bold text-primary-foreground">
                  <Eye className="size-5" />
                </span>
                <div>
                  <h2 className="text-base font-extrabold tracking-wide text-primary">VISUALLY IMPAIRED MODE</h2>
                  <p className="text-xs font-semibold text-muted-foreground">Voice guidance & speech control active</p>
                </div>
              </div>

              {/* Live Audio Indicator Pill */}
              <div className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-xs font-bold shadow-sm">
                {audioStatus === "speaking" && (
                  <span className="flex items-center gap-1 text-primary">
                    <Volume2 className="size-3.5 animate-pulse" /> Speaking...
                  </span>
                )}
                {audioStatus === "listening" && (
                  <span className="flex items-center gap-1 text-live">
                    <Mic className="size-3.5 animate-bounce" /> Listening...
                  </span>
                )}
                {audioStatus === "idle" && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MicOff className="size-3.5" /> Mic Ready
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xl font-extrabold text-ink">What do you need?</p>
              <p className="mt-1 text-xs text-muted-foreground">Speak your choice naturally or tap an option below</p>
            </div>

            {/* Accessible Option Buttons */}
            <div className="mt-5 flex flex-col gap-3">
              <Button
                type="button"
                onClick={() => handleSelectOption("communication")}
                className="flex min-h-[68px] w-full items-center justify-start gap-4 rounded-xl bg-primary px-4 py-3 text-left font-extrabold text-primary-foreground shadow-md transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
                  <Camera className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-wide uppercase">
                    Two-Way Communication
                  </div>
                  <div className="text-xs font-medium text-primary-foreground/85">
                    Camera & Real-time AI Assistant
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 opacity-80" />
              </Button>

              <Button
                type="button"
                onClick={() => handleSelectOption("navigation")}
                className="flex min-h-[68px] w-full items-center justify-start gap-4 rounded-xl bg-primary px-4 py-3 text-left font-extrabold text-primary-foreground shadow-md transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
                  <Navigation className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-wide uppercase">
                    Navigation Guide
                  </div>
                  <div className="text-xs font-medium text-primary-foreground/85">
                    Step-by-step corridor & path guidance
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 opacity-80" />
              </Button>

              <Button
                type="button"
                onClick={() => handleSelectOption("sos")}
                className="flex min-h-[68px] w-full items-center justify-start gap-4 rounded-xl bg-destructive px-4 py-3 text-left font-extrabold text-destructive-foreground shadow-md transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-destructive-foreground/15 text-destructive-foreground">
                  <ShieldAlert className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-wide uppercase">
                    SOS Emergency
                  </div>
                  <div className="text-xs font-medium text-destructive-foreground/85">
                    Voice email dispatch & emergency alert
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 opacity-80" />
              </Button>
            </div>

            <div className="mt-4 flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {recognizedText ? `Recognized: "${recognizedText}"` : "You can say: 'communication', 'navigation', or 'SOS'"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={proceedToNormalApp}
                className="text-xs font-bold text-muted-foreground hover:text-ink"
              >
                Switch to standard mode <ArrowRight className="ml-1 size-3" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="startup-prompt-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 rounded-card border-2 border-primary/40 bg-card p-5 text-center shadow-lg"
          >
            {/* Audio initialization card if voice is not yet unlocked in WebView / Appilix */}
            {!isUnlocked && (
              <VoiceActivationCard
                onActivated={() => void handleVoiceActivated("button")}
                className="mb-5 text-left border-primary/30 shadow-none bg-primary/5"
              />
            )}

            <div className="flex items-center justify-center gap-2.5">
              <INAIAvatar
                state={audioStatus === "speaking" ? "speaking" : audioStatus === "listening" ? "listening" : "idle"}
                size="sm"
              />
              <h2 className="text-xl font-black text-foreground">
                Are you visually impaired?
              </h2>
            </div>

            {/* Spoken/Listening Indicator */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {audioStatus === "speaking" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1 text-xs font-extrabold text-primary-foreground">
                  <Volume2 className="size-3.5 animate-pulse" /> INAI is asking: "Are you visually impaired?"
                </span>
              )}
              {audioStatus === "listening" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1 text-xs font-extrabold text-white animate-pulse">
                  <Mic className="size-3.5" /> Listening for "Yes" or "No"...
                </span>
              )}
              {audioStatus === "idle" && (
                <button
                  type="button"
                  onClick={() => void handleAskQuestionAloud()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint/50 px-3.5 py-1 text-xs font-extrabold text-primary transition hover:bg-primary-tint"
                >
                  <Volume2 className="size-3.5" /> Tap to hear question aloud
                </button>
              )}
            </div>

            <p className="mt-2.5 text-xs font-medium text-muted-foreground">
              {state === "LISTENING_VISUAL_IMPAIRMENT"
                ? "Please say 'Yes' or 'No' clearly."
                : statusMessage || "Please say Yes or No, or tap a button below."}
            </p>

            {recognizedText && (
              <p className="mt-1 text-xs font-bold text-primary">
                Heard: "{recognizedText}"
              </p>
            )}

            {/* Big, accessible choice buttons */}
            <div className="mt-4 flex items-center justify-center gap-3.5">
              <Button
                size="lg"
                className="min-h-12 min-w-32 rounded-full bg-primary font-black text-base text-primary-foreground shadow-md transition hover:scale-105 active:scale-95 gap-2"
                onClick={() => void activateVisuallyImpairedMode()}
              >
                <Check className="size-5" />
                Yes
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-12 min-w-32 rounded-full border-2 border-border font-black text-base text-foreground shadow-sm transition hover:scale-105 active:scale-95 gap-2"
                onClick={proceedToNormalApp}
              >
                <X className="size-5" />
                No
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
