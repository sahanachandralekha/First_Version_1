import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle, ArrowLeft, Banknote, Bell, BellOff, Camera, CameraOff, Check, Coins, Compass, Copy, DollarSign, Ear, Eye, FileText, Image as ImageIcon, Languages, MapPin, Menu, MessageCircle,
  Mic, MicOff, Navigation, Repeat, RotateCcw, Save, Search, Send, Settings, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, Trash2, User, UserCheck, UserPlus, Users, UserX, Volume2, VolumeX, X,
} from "lucide-react";
import { AppShell, ScreenHeader } from "@/components/layout/primitives";
import { useSessionStore } from "@/stores/session-store";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { INAIAvatar } from "@/components/inai/INAIAvatar";
import { CaptionRegion } from "@/components/inai/CaptionRegion";
import { ModeBadge } from "@/components/inai/ModeBadge";
import { CameraStage, type CameraStageHandle, type StageBox } from "@/components/inai/CameraStage";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useINAIVoice } from "@/hooks/use-inai-voice";
import { ttsService, setTTSVoiceEnabled } from "@/services/tts";
import { useAccessibilityStore } from "@/stores/accessibility-store";
import { contextEngine } from "@/services/context-engine";
import { routeDirective } from "@/services/output-router";
import { eventBus, type NormalizedEvent } from "@/services/events";
import {
  sttService,
  isSpeechRecognitionSupported,
  unsupportedSpeechError,
  sttMessages,
  SUPPORTED_LANGUAGES,
  type SttProblem,
} from "@/services/stt";
import type { VisionDetection } from "@/services/vision";
import { hapticService } from "@/services/haptics";
import { audioEventService, microphoneUnavailableError, type SoundEvent } from "@/services/audio-events";
import { understandScene, analyzeVisualFrame, findObjectInScene, converseInScene, describeImageSpaceObstacle, recognizeTextInFrame, type TextRecognitionResult, identifyCurrencyInFrame, type CurrencyRecognitionResult, type FamiliarPerson, formatFamiliarPersonAnnouncement, summarizeTranscript, inaiChat } from "@/lib/inai/ai.functions";
import { generateFaceEmbeddingFromPixels, matchCandidateEmbedding } from "@/services/face";

function DeviceBar() { return <div aria-hidden="true" className="flex h-9 shrink-0 items-center justify-between px-6 text-xs font-extrabold"><span>9:41</span><span>▮▮▮ ◉ ▰</span></div>; }
function Page({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return <AppShell nav={nav ? <BottomNavigation /> : false}><DeviceBar />{children}</AppShell>;
}
function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return <ScreenHeader title={title} subtitle={subtitle ?? "INAI accessibility support"} backTo="/home" right={right} />;
}

/** Docked INAI card used on the camera screens. */
function DockedINAI({ line, speaking, mouth, gesture = "open_palms" }: { line: string; speaking: boolean; mouth: number; gesture?: string }) {
  return (
    <section className="grid grid-cols-[5rem_1fr] items-center gap-2 rounded-card border border-line bg-background p-3 shadow-inai">
      <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture={gesture} mouthOpenness={mouth} size="xs" />
      <div>
        <p className="flex items-center gap-2 text-xs font-extrabold text-primary">
          INAI {speaking && <span className="flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 text-live">● Speaking</span>}
        </p>
        <p className="text-sm font-semibold leading-relaxed">{line}</p>
      </div>
    </section>
  );
}

function ActionRow({ actions }: { actions: Array<[ReactNode, string, (() => void) | undefined]> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(([icon, label, onClick]) => (
        <Button key={label} variant="outline" onClick={onClick} className="h-auto min-h-16 flex-col gap-1 rounded-card text-xs font-bold">
          {icon}{label}
        </Button>
      ))}
    </div>
  );
}

/** Shared plumbing: routes every incoming event through the context engine. */
function useDirectiveRouter() {
  const profile = useAccessibilityStore((state) => state.profile);
  const prefs = useAccessibilityStore((state) => state.prefs);
  const [caption, setCaption] = useState("");
  const [critical, setCritical] = useState(false);
  useEffect(() => eventBus.subscribe((event: NormalizedEvent) => {
    const directive = contextEngine.toDirective(event, profile);
    if (!directive) return;
    routeDirective(directive, profile, {
      voiceEnabled: prefs.voiceEnabled, hapticEnabled: prefs.hapticEnabled, signEnabled: prefs.signEnabled,
      onCaption: (text, isCritical) => { setCaption(text); setCritical(isCritical); },
    });
  }), [profile, prefs]);
  return { caption, critical };
}

/* ---------------------------------------------------------------- Screen 06 */

export function VisionScreen() {
  const { speak, cancel, speaking, mouthOpenness } = useINAIVoice();
  const profile = useAccessibilityStore((state) => state.profile);
  const prefs = useAccessibilityStore((state) => state.prefs);
  const setNeed = useAccessibilityStore((state) => state.setNeed);
  const setPreference = useAccessibilityStore((state) => state.setPreference);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [frameWidth, setFrameWidth] = useState(0);
  const [cameraActive, setCameraActive] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [listeningVoice, setListeningVoice] = useState(false);
  const [recognizedVoiceQuery, setRecognizedVoiceQuery] = useState("");
  const [textQuery, setTextQuery] = useState("");
  const [sttError, setSttError] = useState<string | null>(null);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [line, setLine] = useState("Camera ready. Tap 'Start Two-Way Voice Conversation' to speak naturally.");
  const [sourceNotice, setSourceNotice] = useState<"ai" | "local-detector" | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string; time: string }>>([]);
  const [lastTargetObject, setLastTargetObject] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const [tip, setTip] = useState(true);

  // Step 6: Real-Time Obstacle Awareness State & Refs
  const [obstacleEnabled, setObstacleEnabled] = useState(false);
  const [obstacleMuted, setObstacleMuted] = useState(false);
  const [latestObstacle, setLatestObstacle] = useState<{ text: string; time: string; tone: "warn" | "info" } | null>(null);

  // Step 7: Read Text and Documents Aloud State & Refs
  const [ocrStatus, setOcrStatus] = useState<"idle" | "capturing" | "processing" | "ready" | "no-text" | "reading" | "error">("idle");
  const [ocrResult, setOcrResult] = useState<TextRecognitionResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [copied, setCopied] = useState(false);

  // Step 8: Currency Recognition State & Refs
  const [currencyContext, setCurrencyContext] = useState<"AUTO" | "USD" | "INR" | "EUR" | "GBP">("AUTO");
  const [currencyStatus, setCurrencyStatus] = useState<"idle" | "scanning" | "processing" | "completed" | "uncertain" | "multiple_notes" | "unknown_currency" | "no_currency_found" | "reading" | "error">("idle");
  const [currencyResult, setCurrencyResult] = useState<CurrencyRecognitionResult | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [isReadingCurrencyAloud, setIsReadingCurrencyAloud] = useState(false);

  // Step 9: Familiar Person Assistance State & Refs (Consent-Based & Privacy-First)
  const [familiarPeople, setFamiliarPeople] = useState<FamiliarPerson[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("inai_familiar_people");
        if (saved) return JSON.parse(saved) as FamiliarPerson[];
      } catch (err) {
        console.warn("Could not load familiar people from storage:", err);
      }
    }
    return [
      { id: "fp-1", name: "Sanjay", relationship: "Family", consentGranted: true, createdAt: "2026-09-01" },
      { id: "fp-2", name: "Dr. Sharma", relationship: "Doctor", consentGranted: true, createdAt: "2026-09-05" },
    ];
  });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isAnnouncingPerson, setIsAnnouncingPerson] = useState(false);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRelationship, setNewRelationship] = useState("Family");
  const [newConsentGiven, setNewConsentGiven] = useState(false);
  const [personFormError, setPersonFormError] = useState<string | null>(null);

  const cameraRef = useRef<CameraStageHandle>(null);
  const analyzeFrame = useServerFn(analyzeVisualFrame);
  const converseVision = useServerFn(converseInScene);
  const recognizeText = useServerFn(recognizeTextInFrame);
  const identifyCurrency = useServerFn(identifyCurrencyInFrame);
  const navigate = useNavigate();
  const { caption, critical } = useDirectiveRouter();

  // Concurrency & Stale Response Guard Token
  const activeRequestTokenRef = useRef(0);

  const cameraActiveRef = useRef(cameraActive);
  useEffect(() => {
    cameraActiveRef.current = cameraActive;
  }, [cameraActive]);

  const analyzingRef = useRef(analyzing);
  useEffect(() => {
    analyzingRef.current = analyzing;
  }, [analyzing]);

  const ocrResultRef = useRef(ocrResult);
  useEffect(() => {
    ocrResultRef.current = ocrResult;
  }, [ocrResult]);

  const currencyResultRef = useRef(currencyResult);
  useEffect(() => {
    currencyResultRef.current = currencyResult;
  }, [currencyResult]);

  const familiarPeopleRef = useRef(familiarPeople);
  useEffect(() => {
    familiarPeopleRef.current = familiarPeople;
  }, [familiarPeople]);

  const selectedPersonIdRef = useRef(selectedPersonId);
  useEffect(() => {
    selectedPersonIdRef.current = selectedPersonId;
  }, [selectedPersonId]);

  const isAnnouncingPersonRef = useRef(isAnnouncingPerson);
  useEffect(() => {
    isAnnouncingPersonRef.current = isAnnouncingPerson;
  }, [isAnnouncingPerson]);

  const isReadingAloudRef = useRef(isReadingAloud);
  useEffect(() => {
    isReadingAloudRef.current = isReadingAloud;
  }, [isReadingAloud]);

  const isReadingTextRef = useRef(ocrStatus === "processing" || ocrStatus === "capturing");
  useEffect(() => {
    isReadingTextRef.current = ocrStatus === "processing" || ocrStatus === "capturing";
  }, [ocrStatus]);

  const isReadingCurrencyAloudRef = useRef(isReadingCurrencyAloud);
  useEffect(() => {
    isReadingCurrencyAloudRef.current = isReadingCurrencyAloud;
  }, [isReadingCurrencyAloud]);

  const isIdentifyingCurrencyRef = useRef(currencyStatus === "processing" || currencyStatus === "scanning");
  useEffect(() => {
    isIdentifyingCurrencyRef.current = currencyStatus === "processing" || currencyStatus === "scanning";
  }, [currencyStatus]);

  const speakingRef = useRef(speaking);
  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  const continuousModeRef = useRef(continuousMode);
  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  const processingRef = useRef(processingVoice);
  useEffect(() => {
    processingRef.current = processingVoice;
  }, [processingVoice]);

  const listeningVoiceRef = useRef(listeningVoice);
  useEffect(() => {
    listeningVoiceRef.current = listeningVoice;
  }, [listeningVoice]);

  const obstacleEnabledRef = useRef(obstacleEnabled);
  useEffect(() => {
    obstacleEnabledRef.current = obstacleEnabled;
  }, [obstacleEnabled]);

  const obstacleMutedRef = useRef(obstacleMuted);
  useEffect(() => {
    obstacleMutedRef.current = obstacleMuted;
  }, [obstacleMuted]);

  const detectionsRef = useRef<VisionDetection[]>([]);
  const frameDimRef = useRef<{ width: number; height: number }>({ width: 640, height: 480 });
  const obstacleCooldownRef = useRef<Record<string, number>>({});
  const isSpeakingObstacleRef = useRef(false);
  const isEvaluatingObstacleRef = useRef(false);

  // Clean up speech recognition, TTS, obstacle state, and cancel pending tasks on unmount
  useEffect(() => {
    const tokenRef = activeRequestTokenRef;
    return () => {
      tokenRef.current++;
      sttService.stop();
      cancel();
      isSpeakingObstacleRef.current = false;
      isAnnouncingPersonRef.current = false;
      isReadingAloudRef.current = false;
      isReadingCurrencyAloudRef.current = false;
    };
  }, [cancel]);

  // Listen for mode confirmation from InitialVisualQuestionDialog or custom event
  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ answer: "yes" | "no" }>;
      if (customEvent.detail?.answer === "yes") {
        setLine("Visually Impaired Mode active. Full voice assistance enabled.");
        void startContinuousConversation();
      } else if (customEvent.detail?.answer === "no") {
        setContinuousMode(false);
        continuousModeRef.current = false;
        setListeningVoice(false);
        sttService.stop();
        cancel();
        setLine("Standard visual mode active. Voice assistance is turned off.");
      }
    };
    window.addEventListener("inai:visual_impairment_confirmed", handleModeChange);
    return () => {
      window.removeEventListener("inai:visual_impairment_confirmed", handleModeChange);
    };
  }, [cancel]);

  // Auto-start continuous conversation on mount for Visually Impaired mode if answered YES and voiceEnabled is true
  useEffect(() => {
    let timer: number | undefined;
    const answered = typeof window !== "undefined" ? (localStorage.getItem("inai_visually_impaired_answered") || sessionStorage.getItem("inai_visually_impaired_choice")) : null;
    const isVoiceNav = typeof window !== "undefined" && ((profile.visual && prefs.voiceEnabled) || answered === "yes");
    if (isVoiceNav) {
      setCameraActive(true);
      cameraActiveRef.current = true;
      timer = window.setTimeout(() => {
        void startContinuousConversation();
      }, 600);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [profile.visual, prefs.voiceEnabled]);

  const handleDetections = useCallback((next: VisionDetection[], frame: { width: number; height: number }) => {
    detectionsRef.current = next;
    frameDimRef.current = frame;
    setDetections(next);
    setFrameWidth(frame.width);
  }, []);

  const handleToggleCamera = () => {
    if (cameraActive) {
      setCameraActive(false);
      activeRequestTokenRef.current++;
      cancel();
      isSpeakingObstacleRef.current = false;
      setIsReadingAloud(false);
      setIsReadingCurrencyAloud(false);
      setIsAnnouncingPerson(false);
      setAnalyzing(false);
      setProcessingVoice(false);
      setOcrStatus((prev) => (prev === "processing" || prev === "capturing" ? "idle" : prev));
      setCurrencyStatus((prev) => (prev === "processing" || prev === "scanning" ? "idle" : prev));
      setLine("Camera is stopped. Tap Start Camera to resume visual inspection.");
      void speak("Camera stopped.", "guidance");
    } else {
      setCameraActive(true);
      setLine("Camera started. I'm ready to inspect what is in front of you.");
      void speak("Camera started.", "guidance");
    }
  };

  const handleToggleObstacle = (enabled: boolean) => {
    setObstacleEnabled(enabled);
    obstacleEnabledRef.current = enabled;
    if (!enabled) {
      if (isSpeakingObstacleRef.current) {
        cancel();
        isSpeakingObstacleRef.current = false;
      }
      setLatestObstacle(null);
      void speak("Obstacle awareness disabled.", "guidance");
    } else {
      obstacleCooldownRef.current = {};
      if (!cameraActive) {
        void speak("Obstacle awareness enabled. Note that the camera is paused. Please start the camera to begin monitoring.", "alert");
      } else {
        void speak("Obstacle awareness enabled. Monitoring visible objects cautiously.", "guidance");
      }
    }
  };

  const handleToggleMuteObstacle = () => {
    const nextMute = !obstacleMuted;
    setObstacleMuted(nextMute);
    obstacleMutedRef.current = nextMute;
    if (nextMute && isSpeakingObstacleRef.current) {
      cancel();
      isSpeakingObstacleRef.current = false;
    }
    const msg = nextMute ? "Obstacle spoken alerts muted." : "Obstacle spoken alerts unmuted.";
    void speak(msg, "guidance");
  };

  const handleStopAnnouncements = () => {
    cancel();
    isSpeakingObstacleRef.current = false;
    const now = Date.now();
    for (const key of Object.keys(obstacleCooldownRef.current)) {
      obstacleCooldownRef.current[key] = now + 5000;
    }
    setLine("Obstacle announcements stopped.");
  };

  // Periodic Real-Time Obstacle Awareness Analysis
  useEffect(() => {
    if (!obstacleEnabled || !cameraActive) return;

    const intervalId = window.setInterval(() => {
      // Guard against stale triggers or paused state
      if (!obstacleEnabledRef.current || !cameraActive) return;
      if (isEvaluatingObstacleRef.current) return;

      // Coordinate with voice assistant, scene analyzer, text reader, currency identifier & familiar person: Never interrupt user speech, assistant conversation, or active tasks
      if (
        listeningVoiceRef.current ||
        speakingRef.current ||
        processingRef.current ||
        analyzingRef.current ||
        isReadingAloudRef.current ||
        isReadingTextRef.current ||
        isReadingCurrencyAloudRef.current ||
        isIdentifyingCurrencyRef.current ||
        isAnnouncingPersonRef.current
      ) {
        return;
      }

      isEvaluatingObstacleRef.current = true;
      try {
        const currentDetections = detectionsRef.current.filter((d) => d.rawClass !== "pathway");
        if (currentDetections.length === 0) {
          // Safety: Do not repeatedly announce "clear" or "safe"
          return;
        }

        // Sort by bottom-most bounding box (closer in camera perspective)
        const sorted = [...currentDetections].sort((a, b) => {
          const aBottom = a.box.y + a.box.height;
          const bBottom = b.box.y + b.box.height;
          return bBottom - aBottom;
        });

        const primary = sorted[0];
        if (!primary) return;

        const { text, sectorKey } = describeImageSpaceObstacle(primary, frameDimRef.current, currentDetections);
        const lastAnnounced = obstacleCooldownRef.current[sectorKey] || 0;
        const now = Date.now();

        // 10-second deduplication cooldown per object-sector to prevent repetitive overwhelming alerts
        if (now - lastAnnounced < 10000) {
          return;
        }

        obstacleCooldownRef.current[sectorKey] = now;
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLatestObstacle({ text, time: timeStr, tone: "warn" });

        // Announce spoken alert if unmuted, voice is enabled, and voice channel is free
        if (prefs.voiceEnabled && !obstacleMutedRef.current && !speakingRef.current && !listeningVoiceRef.current && !processingRef.current) {
          isSpeakingObstacleRef.current = true;
          void speak(text, "alert").finally(() => {
            isSpeakingObstacleRef.current = false;
          });
        }
      } finally {
        isEvaluatingObstacleRef.current = false;
      }
    }, 1800);

    return () => {
      window.clearInterval(intervalId);
      if (isSpeakingObstacleRef.current) {
        cancel();
        isSpeakingObstacleRef.current = false;
      }
    };
  }, [obstacleEnabled, cameraActive, speak, cancel]);

  const executeReadText = async (options: { autoSpeak?: boolean } = {}) => {
    if (!cameraActive) {
      const pausedMsg = "The camera is paused. Please start the camera to read text from your surroundings.";
      setLine(pausedMsg);
      void speak(pausedMsg, "alert");
      return;
    }

    const reqToken = ++activeRequestTokenRef.current;
    cancel();
    setOcrStatus("capturing");
    setOcrError(null);
    setLine("Capturing camera view to read text…");

    const snapshot = cameraRef.current?.captureFrame(0.8);
    if (snapshot) {
      setCapturedSnapshot(snapshot);
    }

    setOcrStatus("processing");
    setLine("Reading visible text from camera view…");

    try {
      const activeLabels = detections.map((d) => d.label);
      const res = await recognizeText({
        data: {
          imageBase64: snapshot ?? undefined,
          hints: activeLabels,
        },
      });

      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;

      if (res && res.hasText) {
        setOcrResult(res);
        setOcrStatus("ready");
        const summaryMsg = `I found ${res.wordCount} words of text.`;
        setLine(summaryMsg);

        if (options.autoSpeak) {
          // If short text (<= 30 words), read aloud directly; if longer document, invite user to read aloud
          if (res.wordCount <= 30) {
            setIsReadingAloud(true);
            setOcrStatus("reading");
            const toRead = res.readingOrderText;
            void speak(`Text reads: ${toRead}`, "guidance").finally(() => {
              if (reqToken === activeRequestTokenRef.current) {
                setIsReadingAloud(false);
                setOcrStatus("ready");
              }
            });
          } else {
            const preview = res.lines[0] || "";
            const promptLong = `Found a document with ${res.wordCount} words. The first line says: "${preview}". Tap Read Text Aloud to hear the full text.`;
            void speak(promptLong, "guidance");
          }
        }
      } else {
        setOcrResult(null);
        setOcrStatus("no-text");
        const noTextMsg = res?.message || "I couldn't find any readable text in this view. Try adjusting the camera angle or bringing it closer.";
        setLine(noTextMsg);
        if (options.autoSpeak) {
          void speak(noTextMsg, "alert");
        }
      }
    } catch (err: unknown) {
      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;
      console.error("Text recognition error:", err);
      setOcrStatus("error");
      const errMsg = "Text could not be read right now. Please hold camera steady and try again.";
      setOcrError(errMsg);
      setLine(errMsg);
      if (options.autoSpeak) {
        void speak(errMsg, "alert");
      }
    }
  };

  const handleReadAloud = () => {
    const currentOcr = ocrResultRef.current;
    if (!currentOcr?.hasText) return;
    const reqToken = ++activeRequestTokenRef.current;
    cancel();
    setIsReadingAloud(true);
    setOcrStatus("reading");
    const spokenText = currentOcr.readingOrderText;
    void speak(spokenText, "guidance").finally(() => {
      if (reqToken === activeRequestTokenRef.current) {
        setIsReadingAloud(false);
        setOcrStatus("ready");
      }
    });
  };

  const handleStopReading = () => {
    cancel();
    activeRequestTokenRef.current++;
    setIsReadingAloud(false);
    isReadingAloudRef.current = false;
    if (ocrResultRef.current?.hasText) {
      setOcrStatus("ready");
    } else {
      setOcrStatus("idle");
    }
    setLine("Reading stopped.");
  };

  const handleClearOCR = () => {
    cancel();
    activeRequestTokenRef.current++;
    setIsReadingAloud(false);
    isReadingAloudRef.current = false;
    setOcrResult(null);
    setOcrStatus("idle");
    setOcrError(null);
    setLine("Text reading cleared. Ready for next capture.");
  };

  const handleCopyText = async () => {
    if (!ocrResult?.rawText) return;
    try {
      await navigator.clipboard.writeText(ocrResult.rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const executeIdentifyCurrency = async (options: { autoSpeak?: boolean } = {}) => {
    if (!cameraActive) {
      const pausedMsg = "The camera is paused. Please start the camera to identify banknotes.";
      setLine(pausedMsg);
      void speak(pausedMsg, "alert");
      return;
    }

    const reqToken = ++activeRequestTokenRef.current;
    cancel();
    setCurrencyStatus("scanning");
    setCurrencyError(null);
    setLine("Scanning banknote in camera view…");

    const snapshot = cameraRef.current?.captureFrame(0.8);
    if (snapshot) {
      setCapturedSnapshot(snapshot);
    }

    setCurrencyStatus("processing");
    setLine("Identifying currency and denomination…");

    try {
      const activeLabels = detections.map((d) => d.label);
      const res = await identifyCurrency({
        data: {
          imageBase64: snapshot ?? undefined,
          preferredCurrency: currencyContext,
          hints: activeLabels,
        },
      });

      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;

      setCurrencyResult(res);
      if (res.status === "confident") {
        setCurrencyStatus("completed");
      } else if (res.status === "multiple_notes") {
        setCurrencyStatus("multiple_notes");
      } else if (res.status === "uncertain") {
        setCurrencyStatus("uncertain");
      } else if (res.status === "unknown_currency") {
        setCurrencyStatus("unknown_currency");
      } else {
        setCurrencyStatus("no_currency_found");
      }

      setLine(res.spokenText);

      if (options.autoSpeak) {
        setIsReadingCurrencyAloud(true);
        void speak(res.spokenText, "guidance").finally(() => {
          if (reqToken === activeRequestTokenRef.current) {
            setIsReadingCurrencyAloud(false);
          }
        });
      }
    } catch (err: unknown) {
      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;
      console.error("Currency identification error:", err);
      setCurrencyStatus("error");
      const errMsg = "Currency identification could not be completed right now. Please hold banknote steady and try again.";
      setCurrencyError(errMsg);
      setLine(errMsg);
      if (options.autoSpeak) {
        void speak(errMsg, "alert");
      }
    }
  };

  const handleReadCurrencyAloud = () => {
    const currentCurr = currencyResultRef.current;
    if (!currentCurr?.spokenText) return;
    const reqToken = ++activeRequestTokenRef.current;
    cancel();
    setIsReadingCurrencyAloud(true);
    void speak(currentCurr.spokenText, "guidance").finally(() => {
      if (reqToken === activeRequestTokenRef.current) {
        setIsReadingCurrencyAloud(false);
      }
    });
  };

  const handleStopCurrencyReading = () => {
    cancel();
    activeRequestTokenRef.current++;
    setIsReadingCurrencyAloud(false);
    isReadingCurrencyAloudRef.current = false;
    setCurrencyStatus((prev) => (prev === "reading" || prev === "processing" || prev === "scanning" ? "completed" : prev));
    setLine("Currency announcement stopped.");
  };

  const handleClearCurrency = () => {
    cancel();
    activeRequestTokenRef.current++;
    setIsReadingCurrencyAloud(false);
    isReadingCurrencyAloudRef.current = false;
    setCurrencyResult(null);
    setCurrencyStatus("idle");
    setCurrencyError(null);
    setLine("Currency scanner reset. Ready to scan banknote.");
  };

  // Step 9: Familiar Person Handlers (Consent & Privacy Preserving)
  const handleSelectFamiliarPerson = (id: string) => {
    const person = familiarPeopleRef.current.find((p) => p.id === id);
    if (!person) return;
    setSelectedPersonId(id);
    const feedback = `Selected ${person.name} (${person.relationship}). User-provided label. Tap Announce Person to hear details.`;
    setLine(feedback);
    void speak(`Selected ${person.name}.`, "guidance");
  };

  const handleAnnounceSelectedPerson = (options: { autoSpeak?: boolean } = { autoSpeak: true }) => {
    const selected = familiarPeopleRef.current.find((p) => p.id === selectedPersonIdRef.current) || null;
    const hasPersonInView = detectionsRef.current.some(
      (d) => d.label.toLowerCase() === "person" || d.rawClass.toLowerCase() === "person"
    );
    const { text } = formatFamiliarPersonAnnouncement(selected, hasPersonInView);
    setLine(text);

    if (options.autoSpeak) {
      cancel();
      setIsAnnouncingPerson(true);
      void speak(text, "guidance").finally(() => {
        setIsAnnouncingPerson(false);
      });
    }
  };

  const handleClearSelectedPerson = (options: { speakFeedback?: boolean } = { speakFeedback: true }) => {
    cancel();
    setIsAnnouncingPerson(false);
    setSelectedPersonId(null);
    const msg = "Familiar person selection cleared.";
    setLine(msg);
    if (options.speakFeedback) {
      void speak(msg, "guidance");
    }
  };

  const handleStopPersonAnnouncements = () => {
    cancel();
    setIsAnnouncingPerson(false);
    setLine("Familiar person announcement stopped.");
  };

  const [matchingFace, setMatchingFace] = useState(false);

  const handleIdentifyPersonInView = async () => {
    if (!cameraActiveRef.current) {
      void speak("The camera is paused. Please start the camera to identify a person.", "guidance");
      return;
    }
    const hasPerson = detectionsRef.current.some(
      (d) => d.label.toLowerCase() === "person" || d.rawClass.toLowerCase() === "person"
    );
    if (!hasPerson) {
      const msg = "I don't see any person in the camera view right now.";
      setLine(msg);
      void speak(msg, "guidance");
      return;
    }

    setMatchingFace(true);
    setLine("Scanning visible face for enrolled familiar person match...");
    try {
      const videoEl = cameraRef.current?.videoElement;
      if (!videoEl) {
        throw new Error("Camera video element unavailable");
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(320, videoEl.videoWidth || 320);
      canvas.height = Math.min(240, videoEl.videoHeight || 240);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const candidateEmbedding = generateFaceEmbeddingFromPixels(imgData);
      const match = matchCandidateEmbedding(candidateEmbedding);

      setLine(match.announcementText);
      cancel();
      void speak(match.announcementText, "guidance");
      if (match.matched && match.profile) {
        setSelectedPersonId(match.profile.id);
      }
    } catch (err) {
      console.warn("Face matching error:", err);
      const errMsg = "Could not complete face matching. Please ensure the person is visible in good lighting.";
      setLine(errMsg);
      void speak(errMsg, "guidance");
    } finally {
      setMatchingFace(false);
    }
  };

  const handleAddPersonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setPersonFormError("Please enter a name or label for this person.");
      return;
    }
    if (!newConsentGiven) {
      setPersonFormError("Informed consent is required before saving a familiar person label.");
      return;
    }

    const newPerson: FamiliarPerson = {
      id: `fp-${Date.now()}`,
      name: trimmed,
      relationship: newRelationship.trim() || "Friend",
      consentGranted: true,
      createdAt: new Date().toISOString().split("T")[0]!,
    };

    const nextList = [...familiarPeople, newPerson];
    setFamiliarPeople(nextList);
    try {
      localStorage.setItem("inai_familiar_people", JSON.stringify(nextList));
    } catch (err) {
      console.warn("Could not save familiar people to localStorage:", err);
    }

    setSelectedPersonId(newPerson.id);
    setNewName("");
    setNewRelationship("Family");
    setNewConsentGiven(false);
    setPersonFormError(null);
    setShowAddPersonForm(false);

    const confirmationMsg = `Added ${newPerson.name} with informed consent. Stored locally on this device.`;
    setLine(confirmationMsg);
    void speak(`Added and selected ${newPerson.name}.`, "guidance");
  };

  const handleDeletePerson = (id: string) => {
    const person = familiarPeople.find((p) => p.id === id);
    const nextList = familiarPeople.filter((p) => p.id !== id);
    setFamiliarPeople(nextList);
    try {
      localStorage.setItem("inai_familiar_people", JSON.stringify(nextList));
    } catch (err) {
      console.warn("Could not persist deleted familiar person to localStorage:", err);
    }
    if (selectedPersonId === id) {
      setSelectedPersonId(null);
      cancel();
      setIsAnnouncingPerson(false);
    }
    const delMsg = person ? `Removed ${person.name} from saved list.` : "Removed person.";
    setLine(delMsg);
    void speak(delMsg, "guidance");
  };

  const mapCurrentDetections = () => {
    return detections
      .filter((d) => d.rawClass !== "pathway")
      .map((d) => {
        const centerX = d.box.x + d.box.width / 2;
        const position = centerX < frameWidth * 0.38 ? ("left" as const) : centerX > frameWidth * 0.62 ? ("right" as const) : ("center" as const);
        return {
          label: d.label,
          rawClass: d.rawClass,
          approxDistance: d.approxDistance,
          confidence: d.confidence,
          position,
        };
      });
  };

  const resumeListening = () => {
    if (!isSpeechRecognitionSupported()) return;
    if (!continuousModeRef.current) return;
    setListeningVoice(true);
    setSttError(null);
    sttService.start().catch((err) => {
      console.warn("Could not resume listening:", err);
    });
  };

  // Automatically keep microphone active whenever TTS stops speaking in continuous mode
  useEffect(() => {
    if (!speaking && continuousModeRef.current && !listeningVoice && !processingVoice) {
      resumeListening();
    }
  }, [speaking, listeningVoice, processingVoice]);

  const handleUserUtterance = async (queryText: string) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    // Check for user interruption command ("stop", "be quiet", "stop talking", "pause", "stop announcements")
    if (/^(?:stop|be quiet|shut up|hush|silence|stop talking|pause|stop announcements)$/i.test(cleanQuery.replace(/[.,?!]+$/, ""))) {
      cancel();
      activeRequestTokenRef.current++;
      isSpeakingObstacleRef.current = false;
      isAnnouncingPersonRef.current = false;
      setIsReadingAloud(false);
      setIsReadingCurrencyAloud(false);
      const stopMsg = "I have stopped talking. I'm listening whenever you are ready.";
      setLine(stopMsg);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setConversationHistory((prev) => [
        ...prev.slice(-8),
        { role: "user", content: cleanQuery, time: timeStr },
        { role: "assistant", content: stopMsg, time: timeStr },
      ]);
      if (continuousModeRef.current) {
        resumeListening();
      }
      return;
    }

    // Go back command: Navigate to previous menu and explain what is there
    if (/\b(go back|back|previous page|previous screen|previous)\b/i.test(cleanQuery)) {
      cancel();
      activeRequestTokenRef.current++;
      const backMsg = "Returning to main menu. You are on the home screen. You can choose Two-Way Communication, Navigation Guide, or SOS Emergency. What would you like to do?";
      await speak(backMsg, "guidance");
      void navigate({ to: "/" });
      return;
    }

    // Close the app command: Stop voice and exit
    if (/\b(close the app|close app|exit app|exit the app|quit the app|quit app|shut down app|turn off)\b/i.test(cleanQuery)) {
      cancel();
      activeRequestTokenRef.current++;
      endContinuousConversation();
      setCameraActive(false);
      await speak("Closing the app. Voice assistance is now off.", "guidance");
      void navigate({ to: "/home" });
      return;
    }

    // Explain screen command
    if (/\b(explain what is in that|explain this screen|explain this page|explain page|what is this|where am i|help)\b/i.test(cleanQuery)) {
      const explainMsg = "You are in Two-Way Communication. The camera is active and scanning your surroundings. You can ask what is in front of you, find an object, read visible text, or identify banknotes. You can also say 'go back' to return to the main menu, or say 'close the app' to exit.";
      setLine(explainMsg);
      await speak(explainMsg, "guidance");
      if (continuousModeRef.current) {
        resumeListening();
      }
      return;
    }

    // Direct voice navigation shortcuts
    if (/\b(navigation guide|navigation|guide me|switch to navigation|open navigation|take me to navigation)\b/i.test(cleanQuery)) {
      cancel();
      activeRequestTokenRef.current++;
      await speak("Opening navigation guide camera.", "guidance");
      void navigate({ to: "/guidance" });
      return;
    }
    if (/\b(emergency|sos|help me|call for help)\b/i.test(cleanQuery)) {
      cancel();
      activeRequestTokenRef.current++;
      await speak("Opening SOS emergency.", "guidance");
      void navigate({ to: "/emergency" });
      return;
    }
    if (/\b(home|exit|go home|back to home)\b/i.test(cleanQuery)) {
      cancel();
      activeRequestTokenRef.current++;
      await speak("Returning to home screen.", "guidance");
      void navigate({ to: "/home" });
      return;
    }

    // Camera inactive check
    if (!cameraActive) {
      const pausedMsg = "The camera is paused. Please start the camera so I can see what is in front of you.";
      setLine(pausedMsg);
      void speak(pausedMsg, "alert");
      if (continuousModeRef.current) {
        resumeListening();
      }
      return;
    }

    const reqToken = ++activeRequestTokenRef.current;
    setProcessingVoice(true);
    setAnalysisError(null);
    setRecognizedVoiceQuery(cleanQuery);
    setLine(`Checking camera view for "${cleanQuery}"…`);

    // 1. Fresh camera frame snapshot
    const snapshot = cameraRef.current?.captureFrame(0.75);
    if (snapshot) {
      setCapturedSnapshot(snapshot);
    }

    // 2. Spatial mapping of current detections
    const mappedDetections = mapCurrentDetections();

    // 3. Compact history for model context
    const modelHistory = conversationHistory.slice(-6).map((h) => ({
      role: h.role,
      content: h.content,
    }));

    try {
      const result = await converseVision({
        data: {
          query: cleanQuery,
          imageBase64: snapshot ?? undefined,
          detections: mappedDetections,
          lastTarget: lastTargetObject,
          history: modelHistory,
          cameraActive,
        },
      });

      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;

      if (result && result.reply) {
        if (result.targetObject) {
          setLastTargetObject(result.targetObject);
        }
        setLine(result.reply);
        setSourceNotice(result.source === "ai" ? "ai" : "local-detector");

        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setConversationHistory((prev) => [
          ...prev.slice(-8),
          { role: "user", content: cleanQuery, time: timeStr },
          { role: "assistant", content: result.reply, time: timeStr },
        ]);

        // Voice actions
        if (result.action === "read_text") {
          await executeReadText({ autoSpeak: true });
        } else if (result.action === "read_aloud") {
          if (ocrResultRef.current?.hasText) {
            handleReadAloud();
          } else {
            await executeReadText({ autoSpeak: true });
          }
        } else if (result.action === "stop" || result.action === "stop_reading") {
          handleStopReading();
          handleStopCurrencyReading();
          handleStopPersonAnnouncements();
          handleStopAnnouncements();
        } else if (result.action === "identify_currency") {
          await executeIdentifyCurrency({ autoSpeak: true });
        } else if (result.action === "read_currency") {
          if (currencyResultRef.current) {
            handleReadCurrencyAloud();
          } else {
            await executeIdentifyCurrency({ autoSpeak: true });
          }
        } else if (result.action === "announce_familiar_person") {
          handleAnnounceSelectedPerson({ autoSpeak: true });
        } else if (result.action === "clear_familiar_person") {
          handleClearSelectedPerson({ speakFeedback: true });
        } else if (result.action === "select_familiar_person") {
          // Check if a specific familiar person was named in the user query
          const match = familiarPeopleRef.current.find((p) => cleanQuery.toLowerCase().includes(p.name.toLowerCase()));
          if (match) {
            handleSelectFamiliarPerson(match.id);
          } else if (familiarPeopleRef.current.length > 0) {
            handleSelectFamiliarPerson(familiarPeopleRef.current[0]!.id);
          } else {
            await speak("You do not have any familiar persons saved yet. Please add a person with their informed consent first.", "guidance");
          }
        } else {
          // Speak standard assistant response (including clarify_familiar_person)
          await speak(result.reply, "guidance");
        }
      }
    } catch (err: unknown) {
      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;
      console.error("Conversation processing failed:", err);
      const fallbackMsg = `I had trouble checking for "${cleanQuery}". Please slowly scan your camera and try again.`;
      setAnalysisError(fallbackMsg);
      setLine(fallbackMsg);
      void speak(fallbackMsg, "alert");
    } finally {
      if (reqToken === activeRequestTokenRef.current) {
        setProcessingVoice(false);
        // Seamless turn-taking: automatically resume listening when speech finishes!
        if (continuousModeRef.current) {
          resumeListening();
        }
      }
    }
  };

  const setupStt = () => {
    sttService.onError((problem) => {
      if (problem === "permission") {
        setSttError("Microphone access was denied. Please allow microphone permissions or use text search.");
        void speak("Microphone access was denied.", "alert");
        setListeningVoice(false);
        setContinuousMode(false);
        continuousModeRef.current = false;
      } else if (problem === "no-speech") {
        // Normal pause in speech, keep listening in continuous mode
      } else {
        setSttError("Speech recognition error. You can continue speaking or use text search.");
      }
    });

    sttService.subscribe((text, isFinal) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Echo prevention and barge-in interruption:
      // While AI is speaking, if the user starts speaking, immediately cancel assistant speech so it does not speak over user
      if (speakingRef.current) {
        cancel();
        isSpeakingObstacleRef.current = false;
        isAnnouncingPersonRef.current = false;
        setIsReadingAloud(false);
        setIsReadingCurrencyAloud(false);
        if (/^(?:stop|be quiet|quiet|shut up|stop talking|pause|stop announcements)$/i.test(trimmed.replace(/[.,?!]+$/, ""))) {
          setLine("Stopped. I'm listening.");
          return;
        }
      }

      if (processingRef.current) return;

      setRecognizedVoiceQuery(trimmed);

      if (isFinal) {
        void handleUserUtterance(trimmed);
      }
    });
  };

  const startContinuousConversation = async () => {
    if (!useAccessibilityStore.getState().prefs.voiceEnabled) {
      setLine("Voice assistance is turned off. Tap 'Turn Voice On' above to enable full voice assistance.");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setSttError("Speech recognition is not supported in this browser. Please use the text input below.");
      return;
    }

    setContinuousMode(true);
    continuousModeRef.current = true;
    setSttError(null);
    setListeningVoice(true);
    setCameraActive(true);
    cameraActiveRef.current = true;
    const welcome = "Two-way communication is active. The camera is on. You can ask me what is in front of you, ask me to find an object, read visible text, or identify banknotes. What would you like to check?";
    setLine(welcome);
    void speak(welcome, "guidance");

    setupStt();
    try {
      await sttService.start();
    } catch (err) {
      console.error("STT start failure:", err);
      setListeningVoice(false);
      setSttError("Could not start microphone. Please check permissions.");
    }
  };

  const endContinuousConversation = () => {
    setContinuousMode(false);
    continuousModeRef.current = false;
    setListeningVoice(false);
    sttService.stop();
    cancel();
    const bye = "Conversation ended. Microphone is off.";
    setLine(bye);
    void speak(bye, "guidance");
  };

  const toggleListening = () => {
    if (listeningVoice) {
      sttService.stop();
      setListeningVoice(false);
    } else {
      resumeListening();
    }
  };

  const handleStopSpeaking = () => {
    cancel();
    setLine("Speech stopped. I'm listening.");
    if (continuousModeRef.current && !listeningVoice) {
      resumeListening();
    }
  };

  const handleCaptureAndAnalyze = async () => {
    if (analyzing || processingVoice) return;
    if (!cameraActive) {
      void speak("Please start the camera first.", "alert");
      return;
    }

    const reqToken = ++activeRequestTokenRef.current;
    cancel();
    setAnalyzing(true);
    setAnalysisError(null);
    setLine("Capturing and analyzing scene overview…");

    const snapshot = cameraRef.current?.captureFrame(0.75);
    if (snapshot) {
      setCapturedSnapshot(snapshot);
    }

    const mappedDetections = mapCurrentDetections();

    try {
      const result = await analyzeFrame({
        data: {
          imageBase64: snapshot ?? undefined,
          detections: mappedDetections,
          prompt: "Analyze this scene for 'What is in front of me?'. Provide a thorough visual understanding of the forward walking path, detected objects, and any hazards.",
        },
      });

      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;

      if (result && result.description) {
        setLine(result.description);
        setSourceNotice(result.source);
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setConversationHistory((prev) => [
          ...prev.slice(-8),
          { role: "user", content: "Describe the entire scene", time: timeStr },
          { role: "assistant", content: result.description, time: timeStr },
        ]);
        void speak(result.description, "guidance");
      }
    } catch (err: unknown) {
      if (reqToken !== activeRequestTokenRef.current || !cameraActiveRef.current) return;
      console.error("Visual frame analysis failed:", err);
      const errMsg = "Visual analysis could not be completed right now. Please adjust the camera and try again.";
      setAnalysisError(errMsg);
      setLine(errMsg);
      void speak(errMsg, "alert");
    } finally {
      if (reqToken === activeRequestTokenRef.current) {
        setAnalyzing(false);
      }
    }
  };

  const chips = detections.filter((d) => d.rawClass !== "pathway").slice(0, 3);
  const isBusy = analyzing || processingVoice;
  const selectedPerson = familiarPeople.find((p) => p.id === selectedPersonId) || null;
  const isPersonInCamera = detections.some(
    (d) => d.label.toLowerCase() === "person" || d.rawClass.toLowerCase() === "person"
  );

  return (
    <Page>
      <Header
        title="AI Vision"
        subtitle="Two-way voice conversation & grounded scene guidance."
        right={
          <Button
            type="button"
            variant={cameraActive ? "outline" : "default"}
            size="sm"
            onClick={handleToggleCamera}
            className="h-8 rounded-full text-xs font-bold gap-1.5"
            aria-pressed={cameraActive}
            aria-label={cameraActive ? "Stop Camera" : "Start Camera"}
          >
            {cameraActive ? (
              <>
                <CameraOff className="size-3.5 text-destructive" />
                <span>Stop Camera</span>
              </>
            ) : (
              <>
                <Camera className="size-3.5" />
                <span>Start Camera</span>
              </>
            )}
          </Button>
        }
      />
      <div className="flex-1 space-y-4 px-5 pb-24 pt-3">
        {/* Visual Impairment / Voice Assistance Status & Quick-Switch Banner */}
        <section
          aria-label="Voice assistance mode settings"
          className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-card border p-3.5 shadow-sm transition-colors ${
            prefs.voiceEnabled
              ? "border-primary/40 bg-primary-tint/50 text-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                prefs.voiceEnabled
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {prefs.voiceEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-primary">
                  {prefs.voiceEnabled
                    ? "Visually Impaired Mode: Voice Assisted"
                    : "Standard Mode: No Voice Assistance"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    prefs.voiceEnabled
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {prefs.voiceEnabled ? "VOICE ON" : "VOICE OFF"}
                </span>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {prefs.voiceEnabled
                  ? "Continuous two-way conversation, spoken scene description, obstacle & currency reading active."
                  : "Silent visual mode. Voice assistance is turned off after selecting No."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              type="button"
              size="sm"
              variant={prefs.voiceEnabled ? "outline" : "default"}
              onClick={() => {
                if (prefs.voiceEnabled) {
                  setNeed("visual", false);
                  setPreference("voiceEnabled", false);
                  setTTSVoiceEnabled(false);
                  ttsService.cancel();
                  sttService.stop();
                  setContinuousMode(false);
                  setListeningVoice(false);
                  try {
                    localStorage.setItem("inai_visually_impaired_answered", "no");
                  } catch {}
                  setLine("Standard visual mode active. Voice assistance is turned off.");
                } else {
                  setNeed("visual", true);
                  setPreference("voiceEnabled", true);
                  setTTSVoiceEnabled(true);
                  try {
                    localStorage.setItem("inai_visually_impaired_answered", "yes");
                  } catch {}
                  setLine("Visually Impaired Mode active. Full voice assistance enabled.");
                  void speak("Visually impaired mode activated. Full voice assistance is enabled.", "alert");
                  void startContinuousConversation();
                }
              }}
              className="h-8 rounded-full text-xs font-bold gap-1.5 shadow-sm"
              aria-label={prefs.voiceEnabled ? "Turn off voice assistance" : "Turn on voice assistance"}
            >
              {prefs.voiceEnabled ? (
                <>
                  <VolumeX className="size-3.5 text-muted-foreground" />
                  <span>Turn Voice Off</span>
                </>
              ) : (
                <>
                  <Volume2 className="size-3.5" />
                  <span>Turn Voice On</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("inai:ask_visual_impairment"));
                }
              }}
              className="h-8 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground"
              title="Re-ask 'Are you visually impaired?'"
            >
              Ask Again
            </Button>
          </div>
        </section>

        {/* Camera Stage with stream toggle and frame capture ref */}
        <CameraStage
          ref={cameraRef}
          active={cameraActive}
          onDetections={handleDetections}
          onStartCamera={() => setCameraActive(true)}
        />

        {/* Real-Time Obstacle Awareness Controls (Step 6) */}
        <section
          className="space-y-3 rounded-card border border-line bg-background p-4 shadow-sm"
          aria-labelledby="obstacle-awareness-heading"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="obstacle-awareness-heading"
              className="text-xs font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5"
            >
              <AlertTriangle className="size-4 text-warning" />
              Real-Time Obstacle Awareness
            </h2>

            {/* Accessible Status Indicator (Not relying on color alone) */}
            <span
              role="status"
              aria-live="polite"
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1 border ${
                !obstacleEnabled
                  ? "border-line bg-canvas text-muted-foreground"
                  : !cameraActive
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : obstacleMuted
                  ? "border-primary/30 bg-primary-tint text-primary"
                  : "border-live/30 bg-live/15 text-live"
              }`}
            >
              {!obstacleEnabled
                ? "○ Off (Disabled)"
                : !cameraActive
                ? "⏸ Paused (Camera Off)"
                : obstacleMuted
                ? "🔕 Active (Alerts Muted)"
                : "● Active (Monitoring)"}
            </span>
          </div>

          {/* Accessible Toggle Control Row */}
          <div className="flex items-center justify-between rounded-control border border-line bg-canvas p-3">
            <div className="space-y-0.5 pr-2">
              <label htmlFor="obstacle-toggle" className="text-sm font-bold text-ink cursor-pointer block">
                Enable Obstacle Awareness
              </label>
              <p className="text-xs text-muted-foreground leading-normal">
                Periodically inspects live camera frames to cautiously announce visible objects in image space.
              </p>
            </div>
            <Switch
              id="obstacle-toggle"
              checked={obstacleEnabled}
              onCheckedChange={handleToggleObstacle}
              aria-label="Toggle real-time obstacle awareness"
            />
          </div>

          {/* Controls & notices visible when Obstacle Awareness is enabled */}
          {obstacleEnabled && (
            <div className="space-y-2.5 pt-1">
              {/* Secondary Controls: Mute spoken alerts & Stop announcements */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={obstacleMuted ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleMuteObstacle}
                  className="flex-1 h-10 rounded-full text-xs font-bold gap-1.5 border-line"
                  aria-pressed={obstacleMuted}
                  aria-label={obstacleMuted ? "Unmute spoken obstacle alerts" : "Mute spoken obstacle alerts"}
                >
                  {obstacleMuted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                  <span>{obstacleMuted ? "Unmute Spoken Alerts" : "Mute Spoken Alerts"}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleStopAnnouncements}
                  className="flex-1 h-10 rounded-full text-xs font-bold gap-1.5 border-line text-destructive hover:bg-destructive/10"
                  aria-label="Stop current obstacle announcements"
                >
                  <VolumeX className="size-4" />
                  <span>Stop Announcements</span>
                </Button>
              </div>

              {/* Camera Paused Notice */}
              {!cameraActive && (
                <div
                  className="rounded-control border border-warning/30 bg-warning/10 p-2.5 text-xs text-ink font-semibold flex items-center gap-2"
                  role="status"
                >
                  <CameraOff className="size-4 text-warning shrink-0" />
                  <span>Camera is stopped. Obstacle awareness is paused until you start the camera.</span>
                </div>
              )}

              {/* Latest Spoken Obstacle Alert Card */}
              {latestObstacle && cameraActive && (
                <div
                  className="rounded-control border border-primary/30 bg-primary-tint/30 p-2.5 space-y-1"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wide text-primary">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      Latest Visible Detection
                    </span>
                    <span className="text-muted-foreground">{latestObstacle.time}</span>
                  </div>
                  <p className="text-xs font-bold text-ink leading-relaxed">{latestObstacle.text}</p>
                </div>
              )}
            </div>
          )}

          {/* Safety Notice & Disclaimer (Assistive only, not a mobility/cane substitute) */}
          <div className="border-t border-line/60 pt-2 text-[11px] text-muted-foreground leading-normal flex items-start gap-1.5">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <p>
              <strong>Safety notice:</strong> Awareness aid only. This feature reports approximate image-space positions and is not a substitute for a white cane, guide dog, mobility aid, or human assistance. It does not provide navigation, determine safe walking paths, or prevent collisions.
            </p>
          </div>
        </section>

        {/* Primary Accessible Two-Way Voice Conversation Control */}
        <section className="space-y-3 rounded-card border border-line bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5">
              <Mic className="size-3.5" />
              Two-Way Voice Communication
            </span>
            {continuousMode && (
              <span className="flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-0.5 text-[10px] font-extrabold text-live">
                {processingVoice
                  ? "● Inspecting Scene…"
                  : speaking
                  ? "● INAI Speaking"
                  : listeningVoice
                  ? "● Listening…"
                  : "○ Paused"}
              </span>
            )}
          </div>

          {/* Main Action Buttons */}
          {!continuousMode ? (
            <div className="space-y-2">
              <Button
                type="button"
                disabled={isBusy}
                onClick={() => void startContinuousConversation()}
                className="min-h-14 w-full rounded-full bg-primary text-base font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-[0.98] gap-2.5"
                aria-label="Start continuous two-way voice conversation"
              >
                <Mic className="size-5" />
                <span>Start Two-Way Voice Conversation</span>
              </Button>
              <p className="text-center text-xs text-muted-foreground font-semibold">
                Talk naturally with INAI, ask questions, and ask follow-ups without pressing buttons again.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={processingVoice}
                  onClick={toggleListening}
                  variant={listeningVoice ? "destructive" : "default"}
                  className={`min-h-14 flex-1 rounded-full text-sm font-extrabold shadow-sm transition-all active:scale-[0.98] gap-2 ${
                    listeningVoice ? "animate-pulse" : ""
                  }`}
                  aria-pressed={listeningVoice}
                  aria-label={listeningVoice ? "Pause microphone listening" : "Resume microphone listening"}
                >
                  {listeningVoice ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                  <span>{listeningVoice ? "Listening… (Tap to pause)" : "Paused (Tap to listen)"}</span>
                </Button>

                {speaking && (
                  <Button
                    type="button"
                    onClick={handleStopSpeaking}
                    variant="outline"
                    className="min-h-14 rounded-full px-4 text-xs font-bold border-destructive text-destructive hover:bg-destructive/10 gap-1.5 shrink-0"
                    aria-label="Stop speaking immediately"
                  >
                    <VolumeX className="size-4" />
                    <span>Stop</span>
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={endContinuousConversation}
                  variant="outline"
                  className="min-h-14 rounded-full px-4 text-xs font-bold border-line hover:bg-canvas gap-1.5 shrink-0"
                  aria-label="End two-way conversation"
                >
                  <X className="size-4" />
                  <span>End</span>
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground font-semibold" role="status" aria-live="polite">
                {processingVoice
                  ? "Examining latest camera frame for your question…"
                  : speaking
                  ? "INAI is speaking. Say 'Stop' or tap Stop to interrupt."
                  : listeningVoice
                  ? "I'm listening for your question or follow-up. Speak naturally."
                  : "Listening paused. Tap to resume."}
              </p>
            </div>
          )}

          {/* Recognized Voice Request Confirmation */}
          {(recognizedVoiceQuery || listeningVoice) && (
            <div className="rounded-control border border-line bg-canvas p-2.5 text-xs">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                {listeningVoice && !recognizedVoiceQuery ? "Listening to you…" : "Heard Request"}
              </span>
              <span className="font-bold text-ink" aria-live="polite">
                {recognizedVoiceQuery ? `“${recognizedVoiceQuery}”` : "Speak now, e.g. 'Can you see my phone?' or 'Where is it?'"}
              </span>
            </div>
          )}

          {/* Microphone Error Alert */}
          {sttError && (
            <div
              className="rounded-control border border-destructive/30 bg-destructive/10 p-2.5 text-xs font-semibold text-destructive"
              role="alert"
            >
              {sttError}
            </div>
          )}

          {/* Accessible Text Fallback Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textQuery.trim()) {
                void handleUserUtterance(textQuery);
                setTextQuery("");
              }
            }}
            className="flex items-center gap-2 pt-1"
          >
            <Input
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder="Or type a question or follow-up (e.g. Where is it?)"
              disabled={isBusy}
              aria-label="Type question or follow-up"
              className="h-10 rounded-full bg-canvas text-xs font-medium"
            />
            <Button
              type="submit"
              disabled={isBusy || !textQuery.trim()}
              size="sm"
              variant="outline"
              className="h-10 shrink-0 rounded-full px-4 text-xs font-bold gap-1 border-line"
              aria-label="Send typed question"
            >
              <Send className="size-3.5" />
              <span>Send</span>
            </Button>
          </form>

          {/* Quick Natural Voice Prompts & Follow-ups */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                Suggested Questions & Follow-ups:
              </span>
              {conversationHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-[10px] font-bold text-primary hover:underline"
                  aria-expanded={showHistory}
                >
                  {showHistory ? "Hide History" : `History (${conversationHistory.length})`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "What is in front of me?",
                "Announce the selected person.",
                "Select my familiar person.",
                "Clear the selected person.",
                "Who is this person?",
                "Identify this money.",
                "What currency is this?",
                "Read this.",
                "Read the sign.",
                "Stop reading.",
                "Can you see my phone?",
                "Stop talking.",
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleUserUtterance(sample)}
                  className="rounded-full border border-line bg-canvas px-3 py-1 text-[11px] font-semibold text-ink transition-colors hover:border-primary/50 hover:bg-primary-tint/30 active:scale-95 disabled:opacity-50"
                  aria-label={`Ask: ${sample}`}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Conversation History (Session-only, accessible) */}
          {showHistory && conversationHistory.length > 0 && (
            <div className="mt-2 space-y-2 rounded-control border border-line bg-canvas p-2.5 max-h-48 overflow-y-auto">
              <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Session Conversation</p>
              {conversationHistory.map((item, idx) => (
                <div
                  key={idx}
                  className={`text-xs p-2 rounded ${
                    item.role === "user"
                      ? "bg-primary/10 ml-4 font-semibold text-ink"
                      : "bg-background mr-4 border border-line text-ink"
                  }`}
                >
                  <span className="block text-[9px] font-bold uppercase text-muted-foreground mb-0.5">
                    {item.role === "user" ? "You" : "INAI"} • {item.time}
                  </span>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 7: Read Text & Documents Aloud */}
        <section
          className="space-y-3 rounded-card border border-line bg-background p-4 shadow-sm"
          aria-labelledby="read-text-heading"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="read-text-heading"
              className="text-xs font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5"
            >
              <FileText className="size-4" />
              Read Text & Documents
            </h2>

            {/* Status Pill */}
            <span
              role="status"
              aria-live="polite"
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1 border ${
                ocrStatus === "processing" || ocrStatus === "capturing"
                  ? "border-primary/40 bg-primary-tint text-primary animate-pulse"
                  : ocrStatus === "reading"
                  ? "border-live/40 bg-live/15 text-live animate-pulse"
                  : ocrStatus === "ready"
                  ? "border-primary/40 bg-primary-tint text-primary font-bold"
                  : ocrStatus === "no-text"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : ocrStatus === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-line bg-canvas text-muted-foreground"
              }`}
            >
              {ocrStatus === "capturing"
                ? "● Capturing Frame…"
                : ocrStatus === "processing"
                ? "● Reading Text…"
                : ocrStatus === "reading"
                ? "🔊 Reading Aloud…"
                : ocrStatus === "ready"
                ? `● Text Ready (${ocrResult?.wordCount ?? 0} words)`
                : ocrStatus === "no-text"
                ? "○ No Readable Text"
                : ocrStatus === "error"
                ? "⚠ Recognition Error"
                : "○ Ready to Scan"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-normal">
            Capture printed signs, labels, menus, letters, and documents in front of your camera to read aloud.
          </p>

          {/* Action Buttons */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={ocrStatus === "processing" || ocrStatus === "capturing" || !cameraActive}
                onClick={() => void executeReadText({ autoSpeak: true })}
                className="flex-1 min-h-12 rounded-full bg-primary text-sm font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 gap-2"
                aria-label="Capture and read text from camera view"
              >
                <Camera className={`size-4 ${ocrStatus === "processing" ? "animate-spin" : ""}`} />
                <span>
                  {ocrStatus === "processing"
                    ? "Reading Text…"
                    : ocrResult?.hasText
                    ? "Capture Another Image"
                    : "Capture & Read Text"}
                </span>
              </Button>

              {ocrResult?.hasText && (
                <>
                  <Button
                    type="button"
                    variant={isReadingAloud ? "destructive" : "default"}
                    onClick={isReadingAloud ? handleStopReading : handleReadAloud}
                    className="min-h-12 rounded-full px-4 text-xs font-bold gap-1.5 shadow-sm"
                    aria-label={isReadingAloud ? "Stop reading text aloud" : "Read recognized text aloud"}
                  >
                    {isReadingAloud ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                    <span>{isReadingAloud ? "Stop Reading" : "Read Aloud"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearOCR}
                    className="min-h-12 rounded-full px-3 text-xs font-bold border-line hover:bg-canvas"
                    aria-label="Clear recognized text"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Clear</span>
                  </Button>
                </>
              )}
            </div>

            {/* Inactive camera alert */}
            {!cameraActive && (
              <p className="text-xs text-warning font-semibold" role="status">
                Camera is stopped. Please start the camera to read text from your surroundings.
              </p>
            )}
          </div>

          {/* Recognized Text Display Container */}
          {ocrResult && ocrResult.hasText && (
            <div className="space-y-2 rounded-control border border-line bg-canvas p-3">
              <div className="flex items-center justify-between border-b border-line/60 pb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <FileText className="size-3 text-primary" />
                  Recognized Text ({ocrResult.wordCount} words)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyText}
                  className="h-7 px-2 text-[11px] font-bold text-primary gap-1"
                  aria-label="Copy recognized text to clipboard"
                >
                  {copied ? <Check className="size-3 text-live" /> : <Copy className="size-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </Button>
              </div>

              {/* Formatted Text Box */}
              <div
                className="max-h-44 overflow-y-auto rounded bg-background p-2.5 border border-line text-xs font-medium text-ink leading-relaxed whitespace-pre-wrap select-text"
                tabIndex={0}
                role="region"
                aria-label="Recognized text content"
              >
                {ocrResult.lines.length > 0 ? ocrResult.lines.join("\n") : ocrResult.rawText}
              </div>

              {/* Uncertain / Blurry Note */}
              {ocrResult.unclearNote && (
                <div className="flex items-start gap-1.5 text-[11px] text-warning font-medium pt-1">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>{ocrResult.unclearNote}</span>
                </div>
              )}
            </div>
          )}

          {/* No Text Found Notice */}
          {ocrStatus === "no-text" && (
            <div
              className="rounded-control border border-warning/30 bg-warning/10 p-3 text-xs text-ink font-semibold space-y-1"
              role="status"
            >
              <p className="font-bold text-warning flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                No Readable Text Found
              </p>
              <p className="text-muted-foreground font-medium">
                Try holding the camera steady, moving closer to the sign or paper, and ensuring good lighting.
              </p>
            </div>
          )}

          {/* OCR Error Notice */}
          {ocrStatus === "error" && ocrError && (
            <div
              className="rounded-control border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive font-semibold"
              role="alert"
            >
              {ocrError}
            </div>
          )}

          {/* OCR Accuracy & Privacy Disclaimer */}
          <div className="border-t border-line/60 pt-2 text-[11px] text-muted-foreground leading-normal flex items-start gap-1.5">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <p>
              <strong>Accuracy notice:</strong> Optical character recognition may misread tilted, blurry, or handwriting. Do not rely on automated readings for critical prescription dosages or legal warnings without human verification.
            </p>
          </div>
        </section>

        {/* Step 8: Currency Recognition & Money Assistance */}
        <section
          className="space-y-3 rounded-card border border-line bg-background p-4 shadow-sm"
          aria-labelledby="currency-recognition-heading"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="currency-recognition-heading"
              className="text-xs font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5"
            >
              <Banknote className="size-4" />
              Currency Recognition
            </h2>

            {/* Accessible Status Pill */}
            <span
              role="status"
              aria-live="polite"
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1 border ${
                currencyStatus === "processing" || currencyStatus === "scanning"
                  ? "border-primary/40 bg-primary-tint text-primary animate-pulse"
                  : currencyStatus === "reading"
                  ? "border-live/40 bg-live/15 text-live animate-pulse"
                  : currencyStatus === "completed"
                  ? "border-live/40 bg-live/15 text-live font-bold"
                  : currencyStatus === "multiple_notes" || currencyStatus === "uncertain"
                  ? "border-warning/40 bg-warning/10 text-warning font-bold"
                  : currencyStatus === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-line bg-canvas text-muted-foreground"
              }`}
            >
              {currencyStatus === "scanning"
                ? "● Capturing Note…"
                : currencyStatus === "processing"
                ? "● Identifying Money…"
                : currencyStatus === "reading"
                ? "🔊 Announcing Result…"
                : currencyStatus === "completed"
                ? `● Identified (${currencyResult?.currencySymbol ?? ""}${currencyResult?.denomination ?? ""})`
                : currencyStatus === "multiple_notes"
                ? "⚠ Multiple Notes Detected"
                : currencyStatus === "uncertain"
                ? "⚠ Uncertain Denomination"
                : currencyStatus === "unknown_currency"
                ? "○ Select Currency Context"
                : currencyStatus === "no_currency_found"
                ? "○ No Banknote Detected"
                : currencyStatus === "error"
                ? "⚠ Identification Error"
                : "○ Ready to Identify"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-normal">
            Hold a single banknote flat in front of the camera to identify its currency and denomination.
          </p>

          {/* Currency Context Selection (Auto, USD, INR, EUR, GBP) */}
          <div className="space-y-1 rounded-control border border-line bg-canvas p-2.5">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Currency Context:
            </span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Currency Context Selector">
              {[
                { id: "AUTO", label: "Auto-Detect" },
                { id: "USD", label: "USD ($)" },
                { id: "INR", label: "INR (₹)" },
                { id: "EUR", label: "EUR (€)" },
                { id: "GBP", label: "GBP (£)" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCurrencyContext(c.id as "AUTO" | "USD" | "INR" | "EUR" | "GBP")}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    currencyContext === c.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "border border-line bg-background text-ink hover:bg-canvas"
                  }`}
                  aria-pressed={currencyContext === c.id}
                  aria-label={`Select ${c.label}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={currencyStatus === "processing" || currencyStatus === "scanning" || !cameraActive}
                onClick={() => void executeIdentifyCurrency({ autoSpeak: true })}
                className="flex-1 min-h-12 rounded-full bg-primary text-sm font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 gap-2"
                aria-label="Capture and identify banknote in camera view"
              >
                <Banknote className={`size-4 ${currencyStatus === "processing" ? "animate-spin" : ""}`} />
                <span>
                  {currencyStatus === "processing"
                    ? "Identifying Banknote…"
                    : currencyResult?.identified
                    ? "Scan Another Note"
                    : "Identify Banknote"}
                </span>
              </Button>

              {currencyResult && (
                <>
                  <Button
                    type="button"
                    variant={isReadingCurrencyAloud ? "destructive" : "default"}
                    onClick={isReadingCurrencyAloud ? handleStopCurrencyReading : handleReadCurrencyAloud}
                    className="min-h-12 rounded-full px-4 text-xs font-bold gap-1.5 shadow-sm"
                    aria-label={isReadingCurrencyAloud ? "Stop reading currency result" : "Read currency result aloud"}
                  >
                    {isReadingCurrencyAloud ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                    <span>{isReadingCurrencyAloud ? "Stop Reading" : "Read Aloud"}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearCurrency}
                    className="min-h-12 rounded-full px-3 text-xs font-bold border-line hover:bg-canvas"
                    aria-label="Reset currency result"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Reset</span>
                  </Button>
                </>
              )}
            </div>

            {/* Inactive camera alert */}
            {!cameraActive && (
              <p className="text-xs text-warning font-semibold" role="status">
                Camera is stopped. Please start the camera to scan banknotes.
              </p>
            )}
          </div>

          {/* Banknote Result Display Container */}
          {currencyResult && (
            <div className="space-y-2.5 rounded-control border border-line bg-canvas p-3" role="status" aria-live="polite">
              {/* Confident Identification Card */}
              {currencyResult.identified && currencyResult.status === "confident" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-line/60 pb-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-live flex items-center gap-1">
                      <Check className="size-3.5" />
                      Banknote Identified
                    </span>
                    <span className="text-xs font-extrabold bg-live/15 text-live px-2 py-0.5 rounded-full">
                      {currencyResult.currency}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-ink tracking-tight">
                      {currencyResult.currencySymbol}{currencyResult.denomination}
                    </span>
                    <span className="text-sm font-bold text-muted-foreground">
                      {currencyResult.currencyName}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-ink bg-background p-2.5 rounded border border-line leading-relaxed">
                    “{currencyResult.spokenText}”
                  </p>
                </div>
              )}

              {/* Multiple Banknotes Warning */}
              {currencyResult.status === "multiple_notes" && (
                <div className="space-y-1">
                  <p className="font-bold text-warning flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Multiple Notes Detected
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Multiple banknotes appear in the frame. For accurate denomination detection, please separate your bills and scan one note at a time.
                  </p>
                </div>
              )}

              {/* Uncertain Denomination Warning */}
              {currencyResult.status === "uncertain" && (
                <div className="space-y-1">
                  <p className="font-bold text-warning flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Uncertain Denomination
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currencyResult.spokenText}
                  </p>
                  {currencyResult.guidanceNote && (
                    <p className="text-[11px] text-muted-foreground pt-0.5">
                      Tip: {currencyResult.guidanceNote}
                    </p>
                  )}
                </div>
              )}

              {/* Unknown Currency Context Notice */}
              {currencyResult.status === "unknown_currency" && (
                <div className="space-y-1">
                  <p className="font-bold text-primary flex items-center gap-1.5 text-xs">
                    <Languages className="size-3.5 shrink-0" />
                    Currency Context Needed
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currencyResult.spokenText}
                  </p>
                </div>
              )}

              {/* No Currency Found Notice */}
              {currencyResult.status === "no_currency_found" && (
                <div className="space-y-1">
                  <p className="font-bold text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Banknote className="size-3.5 shrink-0" />
                    No Banknote Detected
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Please place the banknote flat on a table or hold it steady directly in front of the lens.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Currency Identification Error Notice */}
          {currencyStatus === "error" && currencyError && (
            <div
              className="rounded-control border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive font-semibold"
              role="alert"
            >
              {currencyError}
            </div>
          )}

          {/* Legal / Authenticity Safety Disclaimer */}
          <div className="border-t border-line/60 pt-2 text-[11px] text-muted-foreground leading-normal flex items-start gap-1.5">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <p>
              <strong>Assistive notice only:</strong> Currency recognition identifies visible printed denominations only. It does not verify banknote authenticity, test security features, detect counterfeits, or guarantee legal tender validity.
            </p>
          </div>
        </section>

        {/* Step 9: Familiar Person Assistance (Consent-Based & Privacy-First) */}
        <section
          className="space-y-3 rounded-card border border-line bg-background p-4 shadow-sm"
          aria-labelledby="familiar-person-heading"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="familiar-person-heading"
              className="text-xs font-extrabold uppercase tracking-wide text-primary flex items-center gap-1.5"
            >
              <Users className="size-4" />
              Familiar Person Assistance
            </h2>

            {/* Accessible Status Indicator */}
            <span
              role="status"
              aria-live="polite"
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold flex items-center gap-1 border ${
                isAnnouncingPerson
                  ? "border-live/40 bg-live/15 text-live animate-pulse"
                  : selectedPerson
                  ? "border-primary/30 bg-primary-tint text-primary font-bold"
                  : "border-line bg-canvas text-muted-foreground"
              }`}
            >
              {isAnnouncingPerson
                ? "🔊 Announcing…"
                : selectedPerson
                ? `● Selected: ${selectedPerson.name}`
                : "○ No Person Selected"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-normal">
            Associate personally chosen contacts with your environment. Grounded in consent and privacy: No facial recognition, biometric templates, or cloud identity matching are used.
          </p>

          {/* Currently Selected Person Card */}
          {selectedPerson ? (
            <div className="space-y-2.5 rounded-control border border-primary/30 bg-primary-tint/20 p-3" role="region" aria-label="Selected familiar person details">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary flex items-center gap-1">
                    <UserCheck className="size-3.5" />
                    Selected Familiar Person
                  </span>
                  <p className="text-lg font-black text-ink tracking-tight pt-0.5">
                    {selectedPerson.name}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Relationship: {selectedPerson.relationship} • Consent Granted
                  </p>
                </div>
                <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                  User-Provided Label
                </span>
              </div>

              {/* Camera Context Indicator */}
              <div className="rounded border border-line bg-background p-2 text-xs">
                <span className="font-bold text-ink flex items-center gap-1.5">
                  {isPersonInCamera ? (
                    <>
                      <span className="size-2 rounded-full bg-live shrink-0" aria-hidden="true" />
                      Person currently detected in camera view
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-muted-foreground shrink-0" aria-hidden="true" />
                      No person detected in camera view right now
                    </>
                  )}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  Note: Camera detects visual objects only. It does not verify or infer anyone's identity.
                </span>
              </div>

              {/* Action Buttons for Selected Person */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant={isAnnouncingPerson ? "destructive" : "default"}
                  onClick={() => {
                    if (isAnnouncingPerson) {
                      handleStopPersonAnnouncements();
                    } else {
                      handleAnnounceSelectedPerson({ autoSpeak: true });
                    }
                  }}
                  className="flex-1 min-h-11 rounded-full text-xs font-extrabold gap-1.5 shadow-sm"
                  aria-label={isAnnouncingPerson ? "Stop familiar person announcement" : `Announce ${selectedPerson.name}`}
                >
                  {isAnnouncingPerson ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  <span>{isAnnouncingPerson ? "Stop Announcement" : "Announce Selected Person"}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClearSelectedPerson({ speakFeedback: true })}
                  className="min-h-11 rounded-full px-4 text-xs font-bold border-line hover:bg-canvas gap-1.5"
                  aria-label="Clear selected familiar person"
                >
                  <UserX className="size-4" />
                  <span>Clear</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={!cameraActive || matchingFace}
                  onClick={handleIdentifyPersonInView}
                  className="w-full min-h-11 rounded-full text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                  aria-label="Scan camera view and match face against enrolled familiar profiles"
                >
                  <UserCheck className="size-4" />
                  <span>{matchingFace ? "Matching Face Embeddings…" : "Scan Face & Match Enrolled Person"}</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-control border border-line bg-canvas p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-ink">No familiar person selected.</p>
              <p className="text-[11px] mt-0.5">Select a consenting person from your list below, or say "Select my familiar person".</p>
              <Button
                type="button"
                variant="outline"
                disabled={!cameraActive || matchingFace}
                onClick={handleIdentifyPersonInView}
                className="w-full min-h-11 rounded-full text-xs font-bold border-primary/40 text-primary hover:bg-primary/10 gap-1.5 mt-2"
                aria-label="Scan camera view and match face against enrolled familiar profiles"
              >
                <UserCheck className="size-4" />
                <span>{matchingFace ? "Matching Face Embeddings…" : "Scan Face & Match Enrolled Person"}</span>
              </Button>
            </div>
          )}

          {/* Saved Familiar Persons List */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Saved Consenting Persons ({familiarPeople.length}):
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddPersonForm(!showAddPersonForm);
                  setPersonFormError(null);
                }}
                className="h-7 text-xs font-bold text-primary hover:bg-primary-tint/40 px-2 gap-1"
                aria-expanded={showAddPersonForm}
              >
                <UserPlus className="size-3.5" />
                <span>{showAddPersonForm ? "Cancel Adding" : "+ Add Person"}</span>
              </Button>
            </div>

            {familiarPeople.length === 0 && !showAddPersonForm ? (
              <p className="text-xs text-muted-foreground italic py-1">
                No familiar persons saved. Tap "+ Add Person" to add someone with their informed consent.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="list" aria-label="Saved familiar people list">
                {familiarPeople.map((person) => {
                  const isSelected = selectedPersonId === person.id;
                  return (
                    <div
                      key={person.id}
                      role="listitem"
                      className={`flex items-center justify-between rounded-control border p-2 text-xs transition-colors ${
                        isSelected
                          ? "border-primary bg-primary-tint/30 text-ink shadow-xs"
                          : "border-line bg-canvas hover:border-primary/40 text-ink"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectFamiliarPerson(person.id)}
                        className="flex-1 text-left min-w-0 pr-2 cursor-pointer"
                        aria-pressed={isSelected}
                        aria-label={`Select ${person.name}, ${person.relationship}`}
                      >
                        <span className="font-extrabold text-sm block truncate">
                          {isSelected ? `✓ ${person.name}` : person.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground block truncate">
                          {person.relationship} • Added {person.createdAt}
                        </span>
                      </button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePerson(person.id)}
                        className="size-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0"
                        aria-label={`Delete ${person.name} from familiar persons`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Accessible Add Familiar Person Form */}
          {showAddPersonForm && (
            <form
              onSubmit={handleAddPersonSubmit}
              className="space-y-3 rounded-control border border-line bg-canvas p-3 mt-2"
              aria-label="Add new familiar person with informed consent"
            >
              <div className="space-y-1">
                <span className="block text-xs font-black text-ink">
                  Add Familiar Person (Consent-Required)
                </span>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  <strong>Privacy notice:</strong> This label is stored locally on this device only. It is never uploaded to the cloud, never used to train AI models, and never used for facial recognition.
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <label htmlFor="fp-new-name" className="block text-[11px] font-bold text-ink mb-1">
                    Name or Friendly Label <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="fp-new-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Grandma, Dr. Anita, Rajesh"
                    className="h-9 bg-background text-xs"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="fp-new-rel" className="block text-[11px] font-bold text-ink mb-1">
                    Relationship
                  </label>
                  <Input
                    id="fp-new-rel"
                    value={newRelationship}
                    onChange={(e) => setNewRelationship(e.target.value)}
                    placeholder="e.g. Family, Friend, Caregiver, Doctor"
                    className="h-9 bg-background text-xs"
                  />
                </div>

                {/* Informed Consent Checkbox */}
                <div className="rounded border border-primary/20 bg-background p-2.5 space-y-1">
                  <label className="flex items-start gap-2 text-xs font-bold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      id="fp-consent-checkbox"
                      checked={newConsentGiven}
                      onChange={(e) => setNewConsentGiven(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-line text-primary focus:ring-primary shrink-0"
                    />
                    <span>
                      I confirm this person has given informed consent to have their name and relationship saved in this assistive application. <span className="text-destructive">*</span>
                    </span>
                  </label>
                  <p className="text-[10px] text-muted-foreground pl-6">
                    Enrollment is voluntary and can be deleted at any time. Automatic camera enrollment is never performed.
                  </p>
                </div>
              </div>

              {personFormError && (
                <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs font-semibold text-destructive" role="alert">
                  {personFormError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1 h-9 rounded-full text-xs font-bold gap-1.5"
                >
                  <UserPlus className="size-3.5" />
                  <span>Save with Informed Consent</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddPersonForm(false);
                    setPersonFormError(null);
                  }}
                  className="h-9 rounded-full text-xs font-bold border-line"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Privacy & Safety Guarantee */}
          <div className="border-t border-line/60 pt-2 text-[11px] text-muted-foreground leading-normal flex items-start gap-1.5">
            <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <p>
              <strong>Privacy and consent guarantee:</strong> INAI strictly prohibits facial recognition, biometric templates, and automated stranger identification. Familiar person labels are user-provided, stored locally, and never verified by facial recognition.
            </p>
          </div>
        </section>

        {/* Secondary: Entire Scene Overview Analysis */}
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || !cameraActive}
            onClick={() => void handleCaptureAndAnalyze()}
            className="h-11 w-full rounded-full text-xs font-bold gap-2 border-line bg-background shadow-xs hover:bg-canvas"
            aria-label="Capture and describe entire scene overview"
          >
            <Camera className={`size-4 ${analyzing ? "animate-spin" : ""}`} />
            <span>{analyzing ? "Describing Entire Scene…" : "Describe Entire Scene Overview"}</span>
          </Button>
        </div>

        {/* INAI Spoken Description Card */}
        <section className="rounded-card border border-line bg-background p-4 shadow-inai">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-primary">
              <Sparkles className="size-3.5" />
              Visual Guidance
            </p>
            {sourceNotice && (
              <span className="rounded-full bg-primary-tint px-2.5 py-0.5 text-[10px] font-bold text-primary">
                {sourceNotice === "ai" ? "Cloud AI" : "Verified Visual Evidence"}
              </span>
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-[3.5rem_1fr] items-start gap-3">
            <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture="open_palms" mouthOpenness={mouthOpenness} size="xs" />
            <div className="min-w-0">
              <p className="text-base font-bold leading-relaxed text-ink" aria-live="polite">
                {line}
              </p>
              {analysisError && (
                <p className="mt-1 text-xs text-destructive font-semibold" role="alert">{analysisError}</p>
              )}
            </div>
          </div>

          {/* Captured Snapshot Thumbnail */}
          {capturedSnapshot && (
            <div className="mt-3 flex items-center gap-3 rounded-control border border-line bg-canvas p-2">
              <img
                src={capturedSnapshot}
                alt="Analyzed camera frame snapshot"
                className="size-14 shrink-0 rounded object-cover border border-line"
              />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-ink">Analyzed Frame Snapshot</span>
                <span className="text-[11px] text-muted-foreground">Captured directly from your live video stream</span>
              </div>
            </div>
          )}
        </section>

        {/* Real-time Detections Chips */}
        {cameraActive && chips.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase text-muted-foreground mb-1.5">In View Right Now</p>
            <div className="grid grid-cols-3 gap-2">
              {chips.map((chip) => (
                <div key={chip.id} className="rounded-card border border-line p-2.5 text-center bg-background shadow-sm">
                  <strong className="block text-sm text-ink truncate">{chip.label}</strong>
                  <span className="text-xs text-muted-foreground">
                    {chip.approxDistance ? `~${Math.round(chip.approxDistance)} m` : "Detected"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Secondary Action Row */}
        <ActionRow actions={[
          [
            cameraActive ? <CameraOff key="cam" className="size-5" /> : <Camera key="cam" className="size-5" />,
            cameraActive ? "Stop Camera" : "Start Camera",
            handleToggleCamera,
          ],
          [<Volume2 key="r" className="size-5" />, "Say it again", () => void speak(line, "guidance")],
          [<Navigation key="n" className="size-5" />, "Guidance", () => void navigate({ to: "/guidance" })],
        ]} />

        {tip && (
          <div className="flex items-center gap-2 rounded-control bg-primary-tint px-3 py-2 text-sm font-semibold text-primary">
            Tip: Keep Two-Way Voice active to ask follow-up questions freely as you move your camera.
            <button type="button" aria-label="Dismiss tip" className="ml-auto" onClick={() => setTip(false)}><X className="size-4" /></button>
          </div>
        )}

        <CaptionRegion message={caption} critical={critical} />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 08 */

export function LiveVisionScreen() {
  const { speak, speaking, mouthOpenness } = useINAIVoice();
  const [sound, setSound] = useState<SoundEvent | null>(null);
  const { caption, critical } = useDirectiveRouter();
  const line = "I'm monitoring your surroundings. The path ahead is clear.";

  useEffect(() => { void speak(line, "guidance"); }, [speak]);
  useEffect(() => {
    const off = audioEventService.subscribe(setSound);
    audioEventService.start().catch(() => undefined);
    return () => { off(); audioEventService.stop(); };
  }, []);

  return (
    <Page nav={false}>
      <div className="flex-1 space-y-3 px-4 pb-6">
        <h1 className="sr-only">Live Monitoring</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/home" aria-label="Menu"><Menu /></Link></Button>
          <span className="rounded-full bg-primary-tint px-3 py-1 text-xs font-extrabold text-primary">Live Monitoring · Environment · Audio · Navigation</span>
          <span className="ml-auto flex">
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/sound" aria-label="Sound awareness"><Ear /></Link></Button>
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/map" aria-label="Map"><MapPin /></Link></Button>
            <Button asChild variant="ghost" size="icon" className="rounded-full"><Link to="/settings" aria-label="Settings"><Settings /></Link></Button>
          </span>
        </div>
        <CameraStage height="h-[46vh]" showControls={false}>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-live px-3 py-1 text-xs font-extrabold text-primary-foreground">Path is clear — Continue straight</span>
        </CameraStage>
        <DockedINAI line={line} speaking={speaking} mouth={mouthOpenness} />
        <section className="rounded-card border border-line p-3">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-muted-foreground">
            Audio Event <span className="rounded-full bg-live/15 px-2 py-0.5 text-live">Live</span>
          </p>
          <p className="mt-1 text-sm font-bold">{sound ? sound.label : "Listening for important sounds"}</p>
          {sound && <p className="flex items-center gap-2 text-xs text-muted-foreground">Direction: {sound.direction} · ~{sound.distance} m <ModeBadge mode="MOCK" /></p>}
        </section>
        <section className="rounded-card border border-line p-3">
          <p className="text-xs font-extrabold uppercase text-muted-foreground">Location</p>
          <p className="mt-1 text-sm font-bold">Main corridor · exit about 80 m ahead <ModeBadge mode="MOCK" /></p>
        </section>
        <CaptionRegion message={caption} critical={critical} />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 09 */

const radarPositions: Record<SoundEvent["direction"], string> = {
  left: "left-[12%] top-1/2", right: "right-[12%] top-1/2", front: "left-1/2 top-[10%]", back: "left-1/2 bottom-[10%]",
};

function SoundRadar({ events, active }: { events: SoundEvent[]; active?: SoundEvent | undefined }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-80 rounded-full border border-line bg-primary-tint/40" aria-label="Sound radar">
      {[0.75, 0.5, 0.25].map((scale) => (
        <span key={scale} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />
      ))}
      {(["front", "back", "left", "right"] as const).map((direction) => (
        <span key={direction} aria-hidden="true" className={`absolute text-[10px] font-extrabold uppercase text-muted-foreground ${direction === "front" ? "left-1/2 top-1 -translate-x-1/2" : direction === "back" ? "bottom-1 left-1/2 -translate-x-1/2" : direction === "left" ? "left-1 top-1/2" : "right-1 top-1/2"}`}>{direction}</span>
      ))}
      <span className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2"><INAIAvatar state="listening" size="xs" /></span>
      {events.map((event) => (
        <span key={event.id} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-extrabold ${event.id === active?.id ? "animate-pulse bg-danger text-destructive-foreground" : "bg-background text-ink shadow-inai"} ${radarPositions[event.direction]}`}>
          {event.label} · {event.distance} m
        </span>
      ))}
    </div>
  );
}

const seededSounds: SoundEvent[] = [
  { id: "seed-siren", soundClass: "siren", label: "Emergency siren", confidence: 0.8, direction: "left", distance: 20, mock: true, ts: Date.now() },
  { id: "seed-speech", soundClass: "speech", label: "People talking", confidence: 0.6, direction: "front", distance: 8, mock: true, ts: Date.now() },
  { id: "seed-horn", soundClass: "horn", label: "Vehicle", confidence: 0.6, direction: "right", distance: 12, mock: true, ts: Date.now() },
];

/** One alert every 20 seconds — never faster, and never two timers at once. */
const ALERT_INTERVAL_MS = 20000;

export function SoundScreen() {
  const { speak, speaking, mouthOpenness } = useINAIVoice();
  const [events, setEvents] = useState<SoundEvent[]>(seededSounds);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastAlertAt, setLastAlertAt] = useState<number | null>(null);
  const [canVibrate, setCanVibrate] = useState(false);
  const { caption, critical } = useDirectiveRouter();
  const latest = useRef<SoundEvent | undefined>(seededSounds[0]);
  const active = events[0];
  const quote = active
    ? `A ${active.label.toLowerCase()} is coming from your ${active.direction}. It's about ${active.distance} metres away. Please be aware.`
    : "I'm listening for important sounds around you.";

  useEffect(() => { setCanVibrate(typeof navigator !== "undefined" && typeof navigator.vibrate === "function"); }, []);

  useEffect(() => {
    const off = audioEventService.subscribe((event) => {
      latest.current = event;
      setEvents((current) => [event, ...current].slice(0, 4));
    });
    audioEventService.start().catch(() => setFailed(true));
    return () => { off(); audioEventService.stop(); };
  }, [attempt]);

  // Single alert scheduler: speaks and vibrates now, then once every 20 seconds.
  // Cleared on leaving the screen so no timer can ever be left running.
  useEffect(() => {
    let cancelled = false;
    const fire = () => {
      if (cancelled) return;
      const event = latest.current;
      if (!event) return;
      const line = `A ${event.label.toLowerCase()} is coming from your ${event.direction}. It's about ${event.distance} metres away. Please be aware.`;
      setLastAlertAt(Date.now());
      hapticService.pulse(event.soundClass === "siren" ? "critical" : "warn");
      void speak(line, "alert");
    };
    fire();
    const timer = window.setInterval(fire, ALERT_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(timer); hapticService.stop(); };
  }, [speak]);

  return (
    <Page>
      <Header title="Sound Awareness" subtitle="INAI listens, understands and helps you stay aware of important sounds around you."
        right={<span className="flex items-center gap-1 rounded-full bg-hearing-tint px-3 py-1 text-xs font-extrabold text-hearing">
          {[0, 1, 2].map((bar) => <motion.span key={bar} className="inline-block w-1 rounded bg-hearing" animate={{ height: [6, 14, 6] }} transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.15 }} />)}
          Live Listening
        </span>} />
      <div className="flex-1 space-y-4 px-5 pb-24 pt-4">
        {failed ? <ErrorState {...microphoneUnavailableError} onRetry={() => { setFailed(false); setAttempt((v) => v + 1); }} />
          : (
            <div className="mx-auto w-full max-w-sm">
              <SoundRadar events={events} active={active} />
            </div>
          )}
        <section className="rounded-card border border-line bg-background p-4 shadow-inai">
          <p className="text-xs font-extrabold uppercase text-muted-foreground">INAI heard something</p>
          <p className="mt-1 text-lg font-extrabold">{active?.label ?? "Nothing important yet"}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Direction: {active?.direction ?? "—"} | Distance: Approx. {active?.distance ?? "—"} m <ModeBadge mode="MOCK" />
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Alerts repeat once every 20 seconds{canVibrate ? ", with a vibration each time." : ". This device does not support vibration, so alerts are sound and text only."}
            {lastAlertAt && <> Last alert at {new Date(lastAlertAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</>}
          </p>
        </section>
        <section className="grid grid-cols-[4.5rem_1fr] items-center gap-3 rounded-card bg-primary-tint p-4 sm:grid-cols-[6rem_1fr]">
          <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture="point_left" mouthOpenness={mouthOpenness} size="xs" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-relaxed text-primary">{quote}</p>
            <Button variant="ghost" className="mt-1 h-10 px-2 text-primary" onClick={() => void speak(quote, "alert")}><Volume2 className="size-4" />Replay</Button>
          </div>
        </section>
        <section>
          <h2 className="text-sm font-extrabold uppercase text-muted-foreground">What you can do</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {["Move left slowly", "Check your surroundings", "Wait if needed", "Tell me more"].map((action) => (
              <Button key={action} variant="outline" className="h-auto min-h-14 whitespace-normal rounded-card text-sm font-bold">{action}</Button>
            ))}
          </div>
        </section>
        <CaptionRegion message={caption} critical={critical} />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 10 */

export function TranscribeScreen() {
  // Resolved after hydration so the server and first client render agree.
  const [supported, setSupported] = useState(true);
  useEffect(() => { setSupported(isSpeechRecognitionSupported()); }, []);
  const language = useAccessibilityStore((state) => state.prefs.language);
  const setPref = useAccessibilityStore((state) => state.setPref);
  const [currentLang, setCurrentLang] = useState(language || "en-IN");
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SttProblem | null>(null);
  const [meaning, setMeaning] = useState<{ chip: string; explanation: string } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const summarize = useServerFn(summarizeTranscript);
  const lastFinal = useRef("");
  const summaryReqId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sttService.setLanguage(currentLang);
  }, [currentLang]);

  const handleLanguageChange = (code: string) => {
    setCurrentLang(code);
    sttService.setLanguage(code);
    setPref("language", code);
  };

  // Subscriptions live for the whole screen; listening itself is user-controlled.
  useEffect(() => {
    const offResult = sttService.subscribe((text, isFinal) => {
      if (!isFinal) {
        setInterim(text);
        return;
      }
      setInterim("");
      const clean = text.trim();
      if (!clean) return;
      if (clean === lastFinal.current) return; // Prevent exact consecutive duplicates
      lastFinal.current = clean;
      setLines((current) => [...current, clean].slice(-50));
    });
    const offError = sttService.onError((err) => {
      // "no-speech" during speech pause should not break the screen
      if (err !== "no-speech") {
        setProblem(err);
      }
    });
    const offState = sttService.onStateChange(setListening);
    return () => {
      offResult();
      offError();
      offState();
      sttService.stop();
    };
  }, []);

  // Auto-scroll transcript on new speech
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, interim]);

  // Continuously summarize the whole conversation into actionable user understanding
  useEffect(() => {
    if (lines.length === 0) {
      setMeaning(null);
      setSummarizing(false);
      return;
    }
    const fullTranscript = lines.join(". ");
    const currentReq = ++summaryReqId.current;
    setSummarizing(true);

    const timer = window.setTimeout(() => {
      void summarize({ data: { transcript: fullTranscript } })
        .then((result) => {
          if (currentReq === summaryReqId.current && result && result.chip) {
            setMeaning(result);
          }
        })
        .catch((err) => {
          console.warn("Transcript summary error:", err);
        })
        .finally(() => {
          if (currentReq === summaryReqId.current) {
            setSummarizing(false);
          }
        });
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [lines, summarize]);

  const toggle = async () => {
    if (listening) {
      sttService.stop();
      return;
    }
    setProblem(null);
    try {
      await sttService.start();
    } catch (err) {
      console.warn("Speech recognition failed to start:", err);
    }
  };

  const handleClear = () => {
    summaryReqId.current += 1;
    setLines([]);
    setInterim("");
    setMeaning(null);
    setSummarizing(false);
    lastFinal.current = "";
    sttService.resetSession();
  };

  const latest = lines[lines.length - 1] ?? "";

  return (
    <Page>
      <Header title="Live Transcription" subtitle="INAI turns nearby speech into text you can read." />
      <div className="flex-1 space-y-4 px-5 pb-24 pt-3">
        {!supported && <ErrorState {...unsupportedSpeechError} />}
        {supported && problem && problem !== "no-speech" && (
          <ErrorState
            {...sttMessages[problem]}
            onRetry={() => {
              setProblem(null);
              sttService.start().catch(() => undefined);
            }}
          />
        )}

        {/* Language selector chips for multilingual support */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-background p-2.5 shadow-inai">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
            <Languages className="size-4 text-primary" />
            <span>Spoken:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageChange(lang.code)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all active:scale-95 ${
                  currentLang === lang.code
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-canvas text-muted-foreground hover:bg-muted hover:text-ink"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        <section className="rounded-card border border-line bg-background p-4 shadow-inai">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-muted-foreground">
              Live Transcription
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${listening ? "bg-live/15 text-live" : "bg-canvas text-muted-foreground"}`}>
                {listening ? (
                  <>
                    <span className="size-2 rounded-full bg-live animate-ping" />
                    <span>Listening</span>
                  </>
                ) : (
                  "Paused"
                )}
              </span>
            </p>
            {lines.length > 0 && (
              <span className="text-xs font-semibold text-muted-foreground">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            )}
          </div>
          <div ref={scrollRef} className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 scroll-smooth" aria-live="polite">
            {lines.length === 0 && !interim && (
              <p className="py-6 text-center text-base text-muted-foreground">
                {listening ? "Listening… speak, or hold the phone toward the person talking." : "Tap Start listening to turn nearby speech into text."}
              </p>
            )}
            {lines.map((text, index) => (
              <p key={`${index}-${text.slice(0, 16)}`} className={index === lines.length - 1 ? "text-xl font-extrabold leading-snug text-ink" : "text-base text-muted-foreground"}>
                {text}
              </p>
            ))}
            {interim && (
              <p className="text-xl font-extrabold leading-snug text-primary/80 italic animate-pulse">
                {interim}…
              </p>
            )}
          </div>
        </section>

        {meaning?.chip && (
          <section className="rounded-card border-2 border-primary/30 bg-primary-tint p-4 shadow-inai transition-all">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-primary">
                <Sparkles className="size-3.5" />
                Understanding for you
              </p>
              {summarizing && <span className="text-[10px] font-bold text-primary animate-pulse">Updating…</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-primary-foreground shadow-sm">
                {meaning.chip}
              </span>
            </div>
            <p className="mt-2.5 text-base font-bold leading-relaxed text-ink">{meaning.explanation}</p>
          </section>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className={`min-h-14 w-full rounded-full text-base font-extrabold shadow-sm transition-all active:scale-[0.98] ${listening ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}
            disabled={!supported}
            onClick={toggle}
            aria-pressed={listening}
          >
            {listening ? (
              <>
                <MicOff className="size-5" />
                <span>Stop listening</span>
              </>
            ) : (
              <>
                <Mic className="size-5" />
                <span>Start listening</span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="min-h-14 w-full rounded-full text-base font-extrabold transition-all active:scale-[0.98] hover:bg-canvas"
            onClick={handleClear}
            disabled={lines.length === 0 && !interim && !meaning}
          >
            <RotateCcw className="size-5" />
            <span>Clear text</span>
          </Button>
        </div>
        <CaptionRegion message={latest} />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 15 */

interface ChatMessage { id: string; role: "user" | "assistant"; text: string; at: string; evidence?: string[] | undefined }

const suggestions: Array<[string, string]> = [
  ["Help me navigate", "/guidance"], ["What's around me?", "/vision"], ["What is that sound?", "/sound"],
  ["Help me communicate", "/communicate"], ["I need emergency help", "/emergency"], ["More options", ""],
];

export function InaiScreen() {
  const { speak, speaking, mouthOpenness, caption, critical } = useINAIVoice();
  const profile = useAccessibilityStore((state) => state.profile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const chat = useServerFn(inaiChat);
  const navigate = useNavigate();

  const deepLink = (text: string) => {
    const value = text.toLowerCase();
    if (value.includes("around me")) return "/vision" as const;
    if (value.includes("sound")) return "/sound" as const;
    if (value.includes("communicate")) return "/communicate" as const;
    if (value.includes("emergency")) return "/emergency" as const;
    return null;
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text, at }]);
    setDraft("");
    setBusy(true);
    const target = deepLink(text);
    const world = contextEngine.world;
    try {
      const result = await chat({ data: {
        message: text, profile,
        world: {
          detections: world.detections.map((d) => d.label ?? d.message).slice(0, 5),
          sounds: world.sounds.map((s) => s.label ?? s.message).slice(0, 5),
          transcript: world.transcript,
        },
        history: messages.slice(-8).map((message) => ({ role: message.role, content: message.text })),
      } });
      setMessages((current) => [...current, {
        id: `a-${Date.now()}`, role: "assistant", text: result.reply, at,
        evidence: target === "/vision" ? ["Entrance 10 meters ahead", "Staircase on your left", "Person approaching from your right"] : undefined,
      }]);
      void speak(result.reply, "chat");
    } catch {
      useSessionStore.getState().setServiceHealth("ai", "offline");
      setMessages((current) => [...current, { id: `e-${Date.now()}`, role: "assistant", text: "I couldn't reach my understanding service just now. I'm still here with you.", at }]);
    } finally {
      setBusy(false);
      if (target) void navigate({ to: target });
    }
  };

  const toggleMic = () => {
    if (listening) { sttService.stop(); setListening(false); return; }
    if (!isSpeechRecognitionSupported()) return;
    setListening(true);
    const off = sttService.subscribe((text, isFinal) => {
      setDraft(text);
      if (isFinal) { off(); sttService.stop(); setListening(false); void send(text); }
    });
    sttService.start().catch(() => setListening(false));
  };

  return (
    <Page>
      <Header title="INAI — Your Companion" subtitle="Always by you." />
      <div className="flex flex-1 flex-col px-5 pb-24">
        <section className="mt-2 flex flex-col items-center rounded-card bg-primary-tint p-4">
          <INAIAvatar state={speaking ? "speaking" : busy ? "thinking" : "idle"} mouthOpenness={mouthOpenness} size="md" />
          <h2 className="mt-2 text-xl font-extrabold text-primary">Ask Anything. I'm Here.</h2>
          <span className="mt-1 rounded-full bg-background px-3 py-1 text-xs font-extrabold text-live">● INAI is online — Always ready to help</span>
        </section>
        <div className="mt-4 flex-1 space-y-3" aria-live="polite">
          {messages.map((message) => message.role === "user" ? (
            <div key={message.id} className="ml-auto max-w-[80%] rounded-card rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
              <p className="text-sm font-semibold">{message.text}</p><p className="mt-1 text-right text-[10px] opacity-80">{message.at}</p>
            </div>
          ) : (
            <div key={message.id} className="grid max-w-[90%] grid-cols-[2.5rem_1fr] gap-2">
              <span className="grid size-10 place-items-center rounded-full bg-primary-tint text-primary"><Sparkles className="size-4" /></span>
              <div className="rounded-card rounded-bl-sm border border-line bg-background p-3 shadow-inai">
                <p className="text-sm font-semibold">{message.text}</p>
                {message.evidence && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {message.evidence.map((item) => (
                      <figure key={item} className="rounded-control bg-canvas p-2 text-[10px] font-bold">
                        <ImageIcon className="mx-auto mb-1 size-5 text-primary" aria-hidden="true" />{item}
                      </figure>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-1 text-muted-foreground">
                  <button type="button" aria-label="Helpful"><ThumbsUp className="size-4" /></button>
                  <button type="button" aria-label="Not helpful"><ThumbsDown className="size-4" /></button>
                  <button type="button" aria-label="Replay audio" onClick={() => void speak(message.text, "chat")}><Volume2 className="size-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map(([label]) => (
            <button key={label} type="button" onClick={() => void send(label)} className="min-h-10 rounded-full border border-line px-3 text-sm font-bold">{label}</button>
          ))}
        </div>
        <form className="mt-3 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
          <Button type="button" size="icon" variant={listening ? "default" : "outline"} className="size-12 shrink-0 rounded-full" aria-pressed={listening} aria-label="Push to talk" onClick={toggleMic}><Mic /></Button>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask INAI anything" className="min-h-12 rounded-full" />
          <Button type="submit" size="icon" className="size-12 shrink-0 rounded-full" aria-label="Send"><Send /></Button>
        </form>
        <CaptionRegion message={caption} critical={critical} />
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- Screen 16 */

const guidanceSteps: Array<{ line: string; gesture: string }> = [
  { line: "The path is clear ahead. Keep walking at your own pace.", gesture: "open_palms" },
  { line: "There is a staircase about three metres on your left. Please slow down.", gesture: "stop_palm" },
  { line: "Move slightly to your right and continue.", gesture: "point_right" },
];

export function GuidanceScreen() {
  const { speak, cancel, speaking, mouthOpenness, caption, critical } = useINAIVoice();
  const [step, setStep] = useState(0);
  const [detections, setDetections] = useState<VisionDetection[]>([]);
  const [frameBox, setFrameBox] = useState<StageBox>({ width: 640, height: 480 });
  const [guidanceLine, setGuidanceLine] = useState("The path is clear ahead. Keep walking at your own pace.");
  const [guidanceGesture, setGuidanceGesture] = useState("open_palms");
  const [activeChips, setActiveChips] = useState<string[]>(["Path clear ahead", "Camera active"]);
  const navigate = useNavigate();

  const detectionsRef = useRef<VisionDetection[]>([]);
  const frameBoxRef = useRef<StageBox>({ width: 640, height: 480 });
  const isSpeakingGuidanceRef = useRef(false);
  const lastAnnouncedSectorRef = useRef<Record<string, number>>({});
  const lastAnnouncedTextRef = useRef<string>("");
  const lastClearAnnouncementRef = useRef<number>(0);
  const guidanceTimerRef = useRef<number | undefined>(undefined);
  const sttActiveRef = useRef<boolean>(true);

  const handleGuidanceDetections = useCallback((next: VisionDetection[], frame: StageBox) => {
    detectionsRef.current = next;
    frameBoxRef.current = frame;
    setDetections(next);
    setFrameBox(frame);
  }, []);

  // Continuous speech recognition loop
  const startContinuousListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) return;

    sttService.onError((problem) => {
      if (problem === "no-speech" && sttActiveRef.current) {
        // Normal pause, silently restart listening
        sttService.start().catch(() => undefined);
      }
    });

    sttService.subscribe((raw, isFinal) => {
      if (!sttActiveRef.current) return;
      const text = raw.toLowerCase().trim();
      if (!text) return;

      // Barge-in: if user is speaking, stop TTS
      if (speaking) {
        cancel();
        isSpeakingGuidanceRef.current = false;
      }

      // Check intent
      if (/\b(two[- ]?way communication|communication|two[- ]?way|switch to communication|talk|camera)\b/i.test(text)) {
        sttActiveRef.current = false;
        sttService.stop();
        cancel();
        void speak("Opening two-way communication camera.", "guidance");
        void navigate({ to: "/vision" });
      } else if (/\b(where am i|location|where)\b/i.test(text)) {
        void speak("You are in the main corridor, near the east entrance. Path ahead is clear.", "guidance");
      } else if (/\b(what's ahead|whats ahead|ahead|guide me|is it clear|path|next|continue)\b/i.test(text)) {
        const nonPath = detectionsRef.current.filter((d) => d.rawClass !== "pathway");
        const primary = nonPath[0];
        if (primary) {
          const desc = `I detect a ${primary.label} approximately ${Math.round(primary.approxDistance)} meters ahead. Please proceed with caution.`;
          setGuidanceLine(desc);
          void speak(desc, "guidance");
        } else {
          const clearMsg = "The path is clear ahead. There are no immediate obstacles detected.";
          setGuidanceLine(clearMsg);
          void speak(clearMsg, "guidance");
        }
      } else if (/\b(emergency|sos|help|danger)\b/i.test(text)) {
        sttActiveRef.current = false;
        sttService.stop();
        cancel();
        void speak("Opening SOS emergency.", "guidance");
        void navigate({ to: "/emergency" });
      } else if (/\b(repeat|say again|again)\b/i.test(text)) {
        void speak(guidanceLine, "guidance");
      } else if (/\b(go back|back|previous page|previous screen|previous)\b/i.test(text)) {
        sttActiveRef.current = false;
        sttService.stop();
        cancel();
        const backMsg = "Returning to main menu. You are on the home screen. You can choose Two-Way Communication, Navigation Guide, or SOS Emergency. What would you like to do?";
        void speak(backMsg, "guidance");
        void navigate({ to: "/" });
      } else if (/\b(close the app|close app|exit app|exit the app|quit the app|quit|shut down app)\b/i.test(text)) {
        sttActiveRef.current = false;
        sttService.stop();
        cancel();
        void speak("Closing the app. Voice assistance is now off.", "guidance");
        void navigate({ to: "/home" });
      } else if (/\b(explain what is in that|explain this screen|explain this page|explain page|what is this)\b/i.test(text)) {
        const explainMsg = "You are in Navigation Guide. The camera is active and guiding your walking path. I will alert you to obstacles and guide you step by step. You can say 'what's ahead', 'two-way communication', or 'go back'.";
        setGuidanceLine(explainMsg);
        void speak(explainMsg, "guidance");
      }
    });

    sttService.start().catch(() => undefined);
  }, [cancel, guidanceLine, navigate, speak, speaking]);

  useEffect(() => {
    sttActiveRef.current = true;
    const initialText = "Navigation guide activated. The camera is on. I am monitoring your path ahead and will guide you step by step. The path is clear ahead. Keep walking straight at your comfortable pace.";
    void speak(initialText, "guidance");

    // Start voice listening
    const listenTimer = window.setTimeout(() => {
      startContinuousListening();
    }, 800);

    // Automated periodic obstacle & path guidance loop (every 3 seconds)
    guidanceTimerRef.current = window.setInterval(() => {
      if (!sttActiveRef.current) return;
      if (isSpeakingGuidanceRef.current || speaking) return;

      const nonPath = detectionsRef.current.filter((d) => d.rawClass !== "pathway");
      const now = Date.now();

      if (nonPath.length > 0) {
        // Sort by closest obstacle
        const sorted = [...nonPath].sort((a, b) => {
          const aBottom = a.box.y + a.box.height;
          const bBottom = b.box.y + b.box.height;
          return bBottom - aBottom;
        });
        const primary = sorted[0];
        if (!primary) return;
        const { text, sectorKey } = describeImageSpaceObstacle(primary, frameBoxRef.current, nonPath);
        const lastSpokenForSector = lastAnnouncedSectorRef.current[sectorKey] || 0;

        setActiveChips(nonPath.slice(0, 4).map((d) => `${d.label} ~${Math.round(d.approxDistance)}m`));

        let directionalCue = text;
        let gesture = "stop_palm";
        if (sectorKey.includes("left")) {
          directionalCue = `Attention: ${primary.label} on your left. Please steer slightly to your right.`;
          gesture = "point_right";
        } else if (sectorKey.includes("right")) {
          directionalCue = `Attention: ${primary.label} on your right. Please steer slightly to your left.`;
          gesture = "point_left";
        } else {
          directionalCue = `Caution: ${primary.label} directly ahead. Please slow down and proceed carefully.`;
          gesture = "stop_palm";
        }

        setGuidanceLine(directionalCue);
        setGuidanceGesture(gesture);

        if (now - lastSpokenForSector > 7000) {
          lastAnnouncedSectorRef.current[sectorKey] = now;
          lastAnnouncedTextRef.current = directionalCue;
          isSpeakingGuidanceRef.current = true;
          void speak(directionalCue, "alert").finally(() => {
            isSpeakingGuidanceRef.current = false;
          });
        }
      } else {
        setActiveChips(["Path clear ahead", "Obstacles: 0", "Camera active"]);
        const clearMsg = "The path is clear ahead. Keep walking straight at your comfortable pace.";
        setGuidanceLine(clearMsg);
        setGuidanceGesture("open_palms");

        if (lastAnnouncedTextRef.current !== clearMsg && (now - lastClearAnnouncementRef.current > 12000)) {
          lastAnnouncedTextRef.current = clearMsg;
          lastClearAnnouncementRef.current = now;
          isSpeakingGuidanceRef.current = true;
          void speak(clearMsg, "guidance").finally(() => {
            isSpeakingGuidanceRef.current = false;
          });
        }
      }
    }, 3000);

    return () => {
      sttActiveRef.current = false;
      if (guidanceTimerRef.current) window.clearInterval(guidanceTimerRef.current);
      if (listenTimer) window.clearTimeout(listenTimer);
      sttService.stop();
      cancel();
      isSpeakingGuidanceRef.current = false;
    };
  }, [cancel, speak, startContinuousListening]);

  return (
    <Page nav={false}>
      <div className="relative flex-1 overflow-hidden">
        <h1 className="sr-only">Guidance Mode</h1>
        <div className="absolute inset-0 opacity-85">
          <CameraStage height="h-full" showControls={false} active={true} onDetections={handleGuidanceDetections} />
        </div>
        <div className="relative flex h-full flex-col justify-between p-4 bg-gradient-to-t from-background via-background/60 to-transparent">
          <div className="flex items-start">
            <Button asChild variant="secondary" className="rounded-full shadow-md backdrop-blur-md bg-background/80">
              <Link to="/home"><X className="size-4 mr-1" />Exit</Link>
            </Button>
            <span className="ml-auto flex flex-col items-end gap-1">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-extrabold text-primary-foreground shadow">
                {speaking ? "INAI Guiding…" : "INAI Listening"}
              </span>
              <span className="rounded-full bg-background/90 backdrop-blur-sm px-3 py-1 text-xs font-extrabold text-primary shadow">
                Camera Live • Auto-Guiding
              </span>
            </span>
          </div>

          <div className="flex items-end gap-2">
            <div className="w-40 shrink-0">
              <INAIAvatar state={speaking ? "speaking" : "guiding"} gesture={guidanceGesture} mouthOpenness={mouthOpenness} size="lg" />
            </div>
            <div className="flex-1">
              <div className="rounded-card bg-background/95 p-3 text-sm font-semibold shadow-inai backdrop-blur-md">
                {guidanceLine}
              </div>
              <h2 className="mt-3 text-2xl font-extrabold text-foreground drop-shadow">You're not alone.</h2>
              <p className="text-sm font-semibold text-foreground/90 drop-shadow">INAI guides you automatically, step by step.</p>
            </div>
            <div className="flex w-32 shrink-0 flex-col gap-1 text-[11px] font-bold">
              {activeChips.map((chip) => (
                <span key={chip} className="rounded-full bg-background/90 backdrop-blur-sm px-2 py-1 text-center shadow-sm border border-border/50">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <section className="rounded-card bg-background/95 backdrop-blur-md p-4 shadow-inai border border-border/50">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-lg font-extrabold leading-snug">{guidanceLine}</p>
                <Button size="icon" variant="ghost" aria-label="Replay guidance" onClick={() => void speak(guidanceLine, "guidance")}>
                  <Volume2 />
                </Button>
              </div>
            </section>
            <ActionRow actions={[
              [<Compass key="w" className="size-5" />, "Where am I?", () => void speak("You are in the main corridor, near the east entrance. Path ahead is clear.", "guidance")],
              [<Eye key="a" className="size-5" />, "What's ahead?", () => {
                const nonPath = detectionsRef.current.filter((d) => d.rawClass !== "pathway");
                const firstObstacle = nonPath[0];
                if (firstObstacle) {
                  void speak(`Ahead of you is a ${firstObstacle.label} approximately ${Math.round(firstObstacle.approxDistance)} meters away.`, "guidance");
                } else {
                  void speak("The path is clear ahead.", "guidance");
                }
              }],
              [<Repeat key="r" className="size-5" />, "Repeat that", () => void speak(guidanceLine, "guidance")],
            ]} />
            <div className="grid grid-cols-3 gap-2">
              <Button asChild variant="secondary" className="min-h-12 rounded-full text-xs font-extrabold">
                <Link to="/vision"><Camera className="size-4 mr-1" />Two-Way Vision</Link>
              </Button>
              <Button asChild className="min-h-12 rounded-full text-xs font-extrabold">
                <Link to="/inai"><MessageCircle className="size-4 mr-1" />Talk to INAI</Link>
              </Button>
              <Button asChild variant="destructive" className="min-h-12 rounded-full text-xs font-extrabold">
                <Link to="/emergency"><ShieldAlert className="size-4 mr-1" />Emergency</Link>
              </Button>
            </div>
          </div>
        </div>
        <CaptionRegion message={caption} critical={critical} />
      </div>
    </Page>
  );
}

export { AnimatePresence };
