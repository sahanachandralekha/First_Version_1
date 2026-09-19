import type { ServiceDescriptor } from "./types";

type RecognitionListener = (text: string, final: boolean) => void;

interface SpeechRecognitionLike extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  return scope["SpeechRecognition"] ?? scope["webkitSpeechRecognition"];
}

export function isSpeechRecognitionSupported() { return Boolean(recognitionCtor()); }

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
    whatHappened: "INAI could not listen, because microphone access is blocked for this site.",
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

export class WebSpeechSTTService implements ServiceDescriptor {
  readonly name = "Speech recognition"; readonly mode = "REAL" as const;
  readonly description = "Continuous browser speech recognition with interim results.";
  private recognition: SpeechRecognitionLike | undefined;
  private listeners = new Set<RecognitionListener>();
  private errorListeners = new Set<ErrorListener>();
  private stateListeners = new Set<StateListener>();
  private wantsRunning = false;
  private restartAt = 0;
  language = "en-IN";

  subscribe(listener: RecognitionListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  onStateChange(listener: StateListener) {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  private emitState(listening: boolean) { this.stateListeners.forEach((listener) => listener(listening)); }

  async start() {
    const Ctor = recognitionCtor();
    if (!Ctor) { this.errorListeners.forEach((listener) => listener("unsupported")); throw new Error(unsupportedSpeechError.title); }
    if (this.wantsRunning) return;

    // Asking for the stream first surfaces a clear permission answer; the
    // recognizer itself only reports a generic error.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((track) => track.stop());
    } catch {
      this.errorListeners.forEach((listener) => listener("permission"));
      throw new Error(sttMessages.permission.title);
    }

    this.wantsRunning = true;
    const recognition = new Ctor();
    recognition.lang = this.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        this.listeners.forEach((listener) => listener(result[0].transcript.trim(), result.isFinal));
      }
    };
    // Chrome ends recognition on its own every so often; restart, but never in a
    // tight loop, so a failing engine cannot spin.
    recognition.onend = () => {
      if (!this.wantsRunning) { this.emitState(false); return; }
      const now = Date.now();
      if (now - this.restartAt < 500) { this.wantsRunning = false; this.emitState(false); this.errorListeners.forEach((listener) => listener("unknown")); return; }
      this.restartAt = now;
      try { recognition.start(); } catch { this.wantsRunning = false; this.emitState(false); }
    };
    recognition.onerror = (event) => {
      const code = event.error;
      if (code === "aborted") return;
      const problem: SttProblem =
        code === "not-allowed" || code === "service-not-allowed" ? "permission"
          : code === "no-speech" ? "no-speech"
            : code === "network" ? "network" : "unknown";
      if (problem !== "no-speech") { this.wantsRunning = false; this.emitState(false); }
      this.errorListeners.forEach((listener) => listener(problem));
    };
    this.recognition = recognition;
    this.restartAt = Date.now();
    recognition.start();
    this.emitState(true);
  }

  get listening() { return this.wantsRunning; }

  stop() {
    this.wantsRunning = false;
    try { this.recognition?.stop(); } catch { /* already stopped */ }
    this.recognition = undefined;
    this.emitState(false);
  }
}

export const sttService = new WebSpeechSTTService();
