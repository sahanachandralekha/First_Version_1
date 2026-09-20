import type { ServiceDescriptor, ServiceMode } from "./types";
import { lipSync } from "./lipsync";

export type SpeechPriority = "emergency" | "alert" | "guidance" | "chat";
export interface SpeakOptions { priority: SpeechPriority; rate?: number; pitch?: number; interrupt?: boolean }
export interface TTSCallbacks {
  onStart?: (text: string) => void;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  onEnd?: () => void;
  onMouth?: (openness: number) => void;
  onCaption?: (text: string, priority: SpeechPriority) => void;
}
export interface TTSService extends ServiceDescriptor {
  mode: ServiceMode;
  callbacks: TTSCallbacks;
  speak(text: string, options?: SpeakOptions): Promise<void>;
  cancel(): void;
}

const priorities: Record<SpeechPriority, number> = { chat: 1, guidance: 2, alert: 3, emergency: 4 };
type QueueItem = { text: string; options: SpeakOptions; resolve: () => void; reject: (error: Error) => void };

/** Voice settings are read from the accessibility store at speak time. */
export interface VoiceSettings { rate: number; pitch: number; language: string }
let voiceSettings: VoiceSettings = { rate: 1, pitch: 1, language: "en-IN" };
let isVoiceActive = true;

export function setVoiceSettings(next: Partial<VoiceSettings>) { voiceSettings = { ...voiceSettings, ...next }; }

export function setTTSVoiceEnabled(enabled: boolean) {
  isVoiceActive = enabled;
  if (!enabled && typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

export function getTTSVoiceEnabled(): boolean {
  return isVoiceActive;
}

export class WebSpeechTTSService implements TTSService {
  readonly name = "Voice guidance"; readonly mode = "REAL" as const;
  readonly description = "On-device browser speech with captions and lip sync.";
  callbacks: TTSCallbacks = {};
  private queue: QueueItem[] = [];
  private active = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private watchdogTimer: number | undefined = undefined;

  private pickVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const female = /female|heera|veena|swara|aditi|samantha|zira|google uk english female/i;
    return voices.find((v) => v.lang.toLowerCase() === "en-in" && female.test(v.name))
      ?? voices.find((v) => v.lang.toLowerCase() === "en-in")
      ?? voices.find((v) => v.lang.toLowerCase().startsWith("en") && female.test(v.name))
      ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"))
      ?? null;
  }

  speak(text: string, options: SpeakOptions = { priority: "chat" }) {
    // If voice assistance is disabled, display caption if available and do not vocalize
    if (!isVoiceActive) {
      this.callbacks.onCaption?.(text, options.priority);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      if (options.priority === "emergency") {
        this.flush();
        this.cancel();
      } else if (options.interrupt) {
        this.cancel();
      }
      this.queue.push({ text, options, resolve, reject });
      this.queue.sort((a, b) => priorities[b.options.priority] - priorities[a.options.priority]);
      void this.next();
    });
  }

  private flush() {
    for (const item of this.queue) item.resolve();
    this.queue = [];
  }

  cancel() {
    if (this.watchdogTimer) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
    }
    this.activeUtterance = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    lipSync.stop();
    this.callbacks.onMouth?.(0);
    this.active = false;
  }

  private next() {
    if (this.active || typeof window === "undefined") return;
    const item = this.queue.shift();
    if (!item) return;
    if (!("speechSynthesis" in window)) {
      this.callbacks.onCaption?.(item.text, item.options.priority);
      item.reject(new Error("Speech output is unavailable in this browser."));
      return;
    }

    this.active = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    this.activeUtterance = utterance;

    utterance.voice = this.pickVoice();
    utterance.lang = voiceSettings.language;
    utterance.rate = item.options.rate ?? voiceSettings.rate;
    utterance.pitch = item.options.pitch ?? voiceSettings.pitch;

    lipSync.onFrame = (openness) => this.callbacks.onMouth?.(openness);
    this.callbacks.onCaption?.(item.text, item.options.priority);

    let completed = false;
    const onComplete = (err?: Error) => {
      if (completed) return;
      completed = true;
      if (this.watchdogTimer) {
        window.clearTimeout(this.watchdogTimer);
        this.watchdogTimer = undefined;
      }
      this.activeUtterance = null;
      this.finish();
      if (err) item.reject(err);
      else item.resolve();
    };

    utterance.onstart = () => {
      this.callbacks.onStart?.(item.text);
      lipSync.startSynthetic();
    };

    utterance.onboundary = (event) => {
      this.callbacks.onBoundary?.(event);
      const word = item.text.slice(event.charIndex).split(/\s+/)[0] ?? "";
      lipSync.setWord(word);
    };

    utterance.onerror = () => {
      onComplete(new Error("Voice guidance could not play."));
    };

    utterance.onend = () => {
      onComplete();
    };

    // Watchdog timer: Guarantee finish() if browser fails to trigger onend
    const wordCount = item.text.split(/\s+/).length;
    const maxDurationMs = Math.max(4000, (wordCount / 2) * 1000 + 2500);
    this.watchdogTimer = window.setTimeout(() => {
      if (!completed) {
        onComplete();
      }
    }, maxDurationMs);

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      onComplete(new Error("Speech synthesis error."));
    }
  }

  private finish() {
    lipSync.stop();
    this.callbacks.onMouth?.(0);
    this.callbacks.onEnd?.();
    this.active = false;
    this.next();
  }
}

/** Same interface, intentionally not implemented in this prototype. */
export class ElevenLabsTTSService implements TTSService {
  readonly name = "ElevenLabs voice"; readonly mode = "FUTURE" as const;
  readonly description = "Optional future cloud voice driver."; callbacks: TTSCallbacks = {};
  speak(): Promise<void> { return Promise.reject(new Error("ElevenLabsTTSService is not implemented.")); }
  cancel() { /* not implemented */ }
}

/** Kept for stage 1-2 imports. */
export const BrowserTTSService = WebSpeechTTSService;
export const ttsService = new WebSpeechTTSService();
