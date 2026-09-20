import type { ServiceDescriptor } from "./types";

type RecognitionListener = (text: string, final: boolean) => void;

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  return scope["SpeechRecognition"] ?? scope["webkitSpeechRecognition"];
}

export function isSpeechRecognitionSupported() {
  return Boolean(recognitionCtor());
}

export const unsupportedSpeechError = {
  title: "Live transcription is not available in this browser",
  whatHappened: "This browser does not provide speech recognition, so INAI cannot turn speech into text here.",
  whatYouCanDo: "Open INAI in Google Chrome on Android or desktop. Everything else on this screen keeps working.",
};

export type SttProblem = "permission" | "unsupported" | "no-speech" | "network" | "unknown";
type ErrorListener = (problem: SttProblem) => void;
type StateListener = (listening: boolean) => void;

export const sttMessages: Record<SttProblem, { title: string; whatHappened: string; whatYouCanDo: string }> = {
  permission: {
    title: "Microphone access is needed for live transcription",
    whatHappened: "INAI could not listen because microphone access is blocked for this site.",
    whatYouCanDo: "Allow the microphone in your browser settings, then tap Start listening again.",
  },
  unsupported: unsupportedSpeechError,
  "no-speech": {
    title: "I couldn't hear anything yet",
    whatHappened: "The microphone is on, but no speech came through.",
    whatYouCanDo: "Move a little closer to the person speaking, then tap Start listening again.",
  },
  network: {
    title: "Live transcription is temporarily unavailable",
    whatHappened: "The speech service could not be reached.",
    whatYouCanDo: "Check your connection and tap Start listening again.",
  },
  unknown: {
    title: "Live transcription is temporarily unavailable",
    whatHappened: "Speech recognition stopped unexpectedly.",
    whatYouCanDo: "Please tap Start listening to try again.",
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "ta-IN", label: "Tamil (தமிழ்)" },
  { code: "en-US", label: "English (US)" },
] as const;

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];

function formatTranscript(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export class WebSpeechSTTService implements ServiceDescriptor {
  readonly name = "Speech recognition";
  readonly mode = "REAL" as const;
  readonly description = "Continuous browser speech recognition with interim results and automatic recovery.";
  private recognition: SpeechRecognitionLike | undefined;
  private listeners = new Set<RecognitionListener>();
  private errorListeners = new Set<ErrorListener>();
  private stateListeners = new Set<StateListener>();
  private wantsRunning = false;
  private restartTimer: number | undefined;
  language = "en-IN";

  setLanguage(lang: string) {
    if (this.language === lang) return;
    this.language = lang;
    if (this.wantsRunning) {
      this.resetSession();
    }
  }

  subscribe(listener: RecognitionListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitState(listening: boolean) {
    this.stateListeners.forEach((listener) => listener(listening));
  }

  private createRecognition(): SpeechRecognitionLike | undefined {
    const Ctor = recognitionCtor();
    if (!Ctor) return undefined;

    const recognition = new Ctor();
    recognition.lang = this.language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      if (this.wantsRunning) {
        this.emitState(true);
      }
    };

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result || !result[0]) continue;
        const raw = result[0].transcript;
        const transcript = result.isFinal ? formatTranscript(raw) : raw.trim();
        this.listeners.forEach((listener) => listener(transcript, result.isFinal));
      }
    };

    recognition.onend = () => {
      if (!this.wantsRunning) {
        this.emitState(false);
        return;
      }
      // Re-instantiate recognition cleanly after a short pause so continuous recognition stays alive
      if (this.restartTimer) window.clearTimeout(this.restartTimer);
      this.restartTimer = window.setTimeout(() => {
        if (!this.wantsRunning) return;
        try {
          this.recognition = this.createRecognition();
          this.recognition?.start();
        } catch {
          this.wantsRunning = false;
          this.emitState(false);
        }
      }, 150);
    };

    recognition.onerror = (event) => {
      const code = event.error;
      if (code === "aborted") return;
      // "no-speech" is normal during pauses; do not stop running
      if (code === "no-speech") {
        return;
      }
      const problem: SttProblem =
        code === "not-allowed" || code === "service-not-allowed"
          ? "permission"
          : code === "network"
            ? "network"
            : "unknown";

      this.wantsRunning = false;
      this.emitState(false);
      this.errorListeners.forEach((listener) => listener(problem));
    };

    return recognition;
  }

  async start() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      this.errorListeners.forEach((listener) => listener("unsupported"));
      throw new Error(unsupportedSpeechError.title);
    }
    if (this.wantsRunning) return;

    this.wantsRunning = true;
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }

    try {
      this.recognition = this.createRecognition();
      if (!this.recognition) throw new Error(unsupportedSpeechError.title);
      this.recognition.start();
      this.emitState(true);
    } catch (err) {
      this.wantsRunning = false;
      this.emitState(false);
      throw err;
    }
  }

  get listening() {
    return this.wantsRunning;
  }

  stop() {
    this.wantsRunning = false;
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.recognition = undefined;
    this.emitState(false);
  }

  resetSession() {
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }
    if (this.wantsRunning) {
      try {
        this.recognition?.abort();
      } catch {
        /* ignore */
      }
      try {
        this.recognition = this.createRecognition();
        this.recognition?.start();
      } catch {
        /* ignore */
      }
    }
  }
}

export const sttService = new WebSpeechSTTService();

