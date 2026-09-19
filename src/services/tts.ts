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
export function setVoiceSettings(next: Partial<VoiceSettings>) { voiceSettings = { ...voiceSettings, ...next }; }

export class WebSpeechTTSService implements TTSService {
  readonly name = "Voice guidance"; readonly mode = "REAL" as const;
  readonly description = "On-device browser speech with captions and lip sync.";
  callbacks: TTSCallbacks = {};
  private queue: QueueItem[] = [];
  private active = false;

  private pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    const female = /female|heera|veena|swara|aditi|samantha|zira|google uk english female/i;
    return voices.find((v) => v.lang.toLowerCase() === "en-in" && female.test(v.name))
      ?? voices.find((v) => v.lang.toLowerCase() === "en-in")
      ?? voices.find((v) => v.lang.toLowerCase().startsWith("en") && female.test(v.name))
      ?? voices.find((v) => v.lang.toLowerCase().startsWith("en"))
      ?? null;
  }

  speak(text: string, options: SpeakOptions = { priority: "chat" }) {
    return new Promise<void>((resolve, reject) => {
      if (options.priority === "emergency") {
        // emergency preempts and flushes every lower-priority utterance
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
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    lipSync.stop();
    this.callbacks.onMouth?.(0);
    this.active = false;
  }

  private next() {
    if (this.active || typeof window === "undefined") return;
    const item = this.queue.shift();
    if (!item) return;
    if (!("speechSynthesis" in window)) {
      // captions still carry the message when synthesis is unavailable
      this.callbacks.onCaption?.(item.text, item.options.priority);
      item.reject(new Error("Speech output is unavailable in this browser."));
      return;
    }
    this.active = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.voice = this.pickVoice();
    utterance.lang = voiceSettings.language;
    utterance.rate = item.options.rate ?? voiceSettings.rate;
    utterance.pitch = item.options.pitch ?? voiceSettings.pitch;

    lipSync.onFrame = (openness) => this.callbacks.onMouth?.(openness);
    // every spoken utterance is also written to the caption region
    this.callbacks.onCaption?.(item.text, item.options.priority);

    utterance.onstart = () => { this.callbacks.onStart?.(item.text); lipSync.startSynthetic(); };
    utterance.onboundary = (event) => {
      this.callbacks.onBoundary?.(event);
      const word = item.text.slice(event.charIndex).split(/\s+/)[0] ?? "";
      lipSync.setWord(word);
    };
    utterance.onerror = () => { this.finish(); item.reject(new Error("Voice guidance could not play.")); };
    utterance.onend = () => { this.finish(); item.resolve(); };
    window.speechSynthesis.speak(utterance);
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
