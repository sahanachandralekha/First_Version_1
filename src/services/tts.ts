import type { ServiceDescriptor, ServiceMode } from "./types";

export type SpeechPriority = "emergency" | "alert" | "guidance" | "chat";
export interface SpeakOptions { priority: SpeechPriority; rate?: number; pitch?: number; interrupt?: boolean }
export interface TTSCallbacks { onStart?: () => void; onBoundary?: (event: SpeechSynthesisEvent) => void; onEnd?: () => void; onMouth?: (openness: number) => void }
export interface TTSService extends ServiceDescriptor {
  mode: ServiceMode; callbacks: TTSCallbacks; speak(text: string, options?: SpeakOptions): Promise<void>; cancel(): void;
}
const priorities: Record<SpeechPriority, number> = { chat: 1, guidance: 2, alert: 3, emergency: 4 };
type QueueItem = { text: string; options: SpeakOptions; resolve: () => void; reject: (error: Error) => void };

export class BrowserTTSService implements TTSService {
  readonly name = "Voice guidance"; readonly mode = "REAL" as const;
  readonly description = "On-device browser speech with captions.";
  callbacks: TTSCallbacks = {};
  private queue: QueueItem[] = []; private active = false; private timer?: number;
  speak(text: string, options: SpeakOptions = { priority: "chat" }) {
    return new Promise<void>((resolve, reject) => {
      if (options.priority === "emergency") { this.cancel(); this.queue = []; }
      else if (options.interrupt) this.cancel();
      this.queue.push({ text, options, resolve, reject });
      this.queue.sort((a, b) => priorities[b.options.priority] - priorities[a.options.priority]);
      void this.next();
    });
  }
  cancel() { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); if (this.timer) window.clearInterval(this.timer); this.active = false; this.callbacks.onMouth?.(0); }
  private async next() {
    if (this.active || typeof window === "undefined") return;
    const item = this.queue.shift(); if (!item) return;
    if (!("speechSynthesis" in window)) { item.reject(new Error("Speech output is unavailable in this browser.")); return; }
    this.active = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === "en-in" && /female|heera|veena/i.test(voice.name))
      ?? voices.find((voice) => voice.lang.toLowerCase() === "en-in")
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? null;
    utterance.rate = item.options.rate ?? 1; utterance.pitch = item.options.pitch ?? 1;
    utterance.onstart = () => { this.callbacks.onStart?.(); this.timer = window.setInterval(() => this.callbacks.onMouth?.(0.2 + Math.random() * 0.8), 90); };
    utterance.onboundary = (event) => this.callbacks.onBoundary?.(event);
    utterance.onerror = () => { this.finish(); item.reject(new Error("Voice guidance could not play.")); };
    utterance.onend = () => { this.finish(); item.resolve(); };
    window.speechSynthesis.speak(utterance);
  }
  private finish() { if (this.timer) window.clearInterval(this.timer); this.callbacks.onMouth?.(0); this.callbacks.onEnd?.(); this.active = false; void this.next(); }
}
export class ElevenLabsTTSService implements TTSService {
  readonly name = "ElevenLabs voice"; readonly mode = "FUTURE" as const;
  readonly description = "Optional future cloud voice driver."; callbacks: TTSCallbacks = {};
  speak(): Promise<void> { throw new Error("ElevenLabsTTSService is not implemented."); }
  cancel() { throw new Error("ElevenLabsTTSService is not implemented."); }
}
