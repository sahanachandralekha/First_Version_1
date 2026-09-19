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

export class WebSpeechSTTService implements ServiceDescriptor {
  readonly name = "Speech recognition"; readonly mode = "REAL" as const;
  readonly description = "Continuous browser speech recognition with interim results.";
  private recognition?: SpeechRecognitionLike;
  private listeners = new Set<RecognitionListener>();
  private wantsRunning = false;
  language = "en-IN";

  subscribe(listener: RecognitionListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async start() {
    const Ctor = recognitionCtor();
    if (!Ctor) throw new Error(unsupportedSpeechError.title);
    if (this.wantsRunning) return;
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
    recognition.onend = () => { if (this.wantsRunning) { try { recognition.start(); } catch { /* restarting too quickly */ } } };
    recognition.onerror = () => undefined;
    this.recognition = recognition;
    recognition.start();
  }

  stop() {
    this.wantsRunning = false;
    try { this.recognition?.stop(); } catch { /* already stopped */ }
    this.recognition = undefined;
  }
}

export const sttService = new WebSpeechSTTService();
