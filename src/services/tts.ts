import type { ServiceDescriptor, ServiceMode } from "./types";
import { lipSync } from "./lipsync";
import { inaiAudioManager } from "@/audio/INAIAudioManager";

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

/** Voice settings are read from the accessibility store at speak time. */
export interface VoiceSettings { rate: number; pitch: number; language: string }
let voiceSettings: VoiceSettings = { rate: 1, pitch: 1, language: "en-IN" };
let isVoiceActive = true;

export function setVoiceSettings(next: Partial<VoiceSettings>) { voiceSettings = { ...voiceSettings, ...next }; }

export function setTTSVoiceEnabled(enabled: boolean) {
  isVoiceActive = enabled;
  if (!enabled) {
    inaiAudioManager.stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

export function getTTSVoiceEnabled(): boolean {
  return isVoiceActive;
}

export class WebSpeechTTSService implements TTSService {
  readonly name = "Voice guidance"; readonly mode = "REAL" as const;
  readonly description = "INAI voice with HTMLAudioElement and real TTS provider.";
  callbacks: TTSCallbacks = {};

  constructor() {
    this.bindCallbacks();
  }

  private bindCallbacks() {
    lipSync.onFrame = (openness) => this.callbacks.onMouth?.(openness);

    inaiAudioManager.onStart = (text) => {
      this.callbacks.onStart?.(text);
      lipSync.startSynthetic();
    };

    inaiAudioManager.onEnd = () => {
      lipSync.stop();
      this.callbacks.onMouth?.(0);
      this.callbacks.onEnd?.();
    };

    inaiAudioManager.onCaption = (text, priority) => {
      this.callbacks.onCaption?.(text, priority as SpeechPriority);
    };
  }

  /**
   * Primary voice entrypoint:
   * Uses INAIAudioManager -> existing TTS provider -> MP3 Blob/URL -> HTMLAudioElement.
   * Does NOT use window.speechSynthesis.speak() as primary.
   */
  async speak(text: string, options: SpeakOptions = { priority: "chat" }): Promise<void> {
    this.bindCallbacks();

    // If voice assistance is disabled, display caption if available and do not vocalize
    if (!isVoiceActive) {
      this.callbacks.onCaption?.(text, options.priority);
      return;
    }

    try {
      await inaiAudioManager.speak(text, {
        priority: options.priority,
        interrupt: options.interrupt,
      });
    } catch (err) {
      console.error("[INAI TTS] Audio playback failed:", err);
      // Fallback: visual caption already displayed, graceful degradation without app crash
    }
  }

  cancel(): void {
    inaiAudioManager.stop();
    lipSync.stop();
    this.callbacks.onMouth?.(0);
    this.callbacks.onEnd?.();

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Legacy browser speechSynthesis fallback (retained for backward compatibility,
   * never used as primary voice system).
   */
  legacySpeakWithSpeechSynthesis(text: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voiceSettings.language;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("[INAI TTS] Legacy SpeechSynthesis failed:", err);
    }
  }
}

/** Cloud voice driver using INAI Audio Manager. */
export class ElevenLabsTTSService implements TTSService {
  readonly name = "ElevenLabs voice"; readonly mode = "REAL" as const;
  readonly description = "Cloud voice driver using INAI Audio Manager.";
  callbacks: TTSCallbacks = {};

  speak(text: string, options?: SpeakOptions): Promise<void> {
    return inaiAudioManager.speak(text, options);
  }

  cancel(): void {
    inaiAudioManager.stop();
  }
}

/** Kept for stage 1-2 imports. */
export const BrowserTTSService = WebSpeechTTSService;
export const ttsService = new WebSpeechTTSService();

