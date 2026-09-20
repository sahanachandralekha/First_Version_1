import type {
  AudioDiagnostics,
  AudioStatus,
  AudioStatusListener,
  DiagnosticsListener,
  MotionPermissionStatus,
  MotionStatus,
} from "./audioTypes";
import { generateINAIVoice } from "./ttsAdapter";

const SILENT_WAV_BASE64 =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

const STORAGE_UNLOCKED_KEY = "inai_audio_unlocked";
const STORAGE_SETUP_COMPLETE_KEY = "inai_audio_setup_complete";

interface SpeechQueueItem {
  text: string;
  options: {
    priority: "emergency" | "alert" | "guidance" | "chat";
    interrupt?: boolean;
  };
  resolve: () => void;
  reject: (err: Error) => void;
}

class INAIAudioManagerClass {
  private static instance: INAIAudioManagerClass | null = null;

  // Single persistent HTMLAudioElement for all playback
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;

  private status: AudioStatus = "unknown";
  private isUnlocked = false;
  private isPlaying = false;
  private initialized = false;

  private queue: SpeechQueueItem[] = [];
  private activeItem: SpeechQueueItem | null = null;
  private currentRevokeFn: (() => void) | null = null;

  private lastAudioError: string | null = null;
  private lastShake: { magnitude: number; timestamp: number } | null = null;
  private motionStatus: MotionStatus = "checking";
  private motionPermission: MotionPermissionStatus = "unknown";
  private shakeDetectorActive = false;

  private statusListeners = new Set<AudioStatusListener>();
  private diagListeners = new Set<DiagnosticsListener>();
  private unlockPromise: Promise<boolean> | null = null;

  // Callbacks for avatar lipsync and caption display
  public onStart?: (text: string) => void;
  public onEnd?: () => void;
  public onCaption?: (text: string, priority: string) => void;

  private constructor() {
    if (typeof window !== "undefined") {
      this.detectEnvironment();
    }
  }

  public static getInstance(): INAIAudioManagerClass {
    if (!INAIAudioManagerClass.instance) {
      INAIAudioManagerClass.instance = new INAIAudioManagerClass();
    }
    return INAIAudioManagerClass.instance;
  }

  private detectEnvironment() {
    if (typeof window === "undefined") return;

    try {
      const storedUnlocked = localStorage.getItem(STORAGE_UNLOCKED_KEY);
      const storedSetup = localStorage.getItem(STORAGE_SETUP_COMPLETE_KEY);
      if (storedUnlocked === "true" || storedSetup === "true") {
        this.status = "unknown";
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  /** Detect if running inside Android WebView / Appilix wrapper */
  public isWebView(): boolean {
    if (typeof window === "undefined" || !window.navigator) return false;
    const ua = window.navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const hasWv = /;\s*wv|Version\/[0-9.]+\s+Chrome/i.test(ua);
    const isAppilix = /Appilix/i.test(ua) || typeof (window as unknown as { appilix?: unknown }).appilix !== "undefined";
    return (isAndroid && hasWv) || isAppilix;
  }

  /**
   * Initialize the persistent HTMLAudioElement.
   */
  public async initialize(): Promise<void> {
    if (this.initialized && this.audio) return;
    if (typeof window === "undefined") return;

    try {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.playsInline = true;
      this.initialized = true;
    } catch (err) {
      console.warn("[INAI Audio] Persistent HTMLAudioElement creation failed:", err);
      this.status = "unsupported";
      this.notify();
    }
  }

  /**
   * Lazy-create single AudioContext for Web Audio utilities if available.
   */
  private getOrCreateAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
        } catch {
          // Non-critical AudioContext
        }
      }
    }
    return this.audioContext;
  }

  /**
   * Unlock HTMLAudioElement and Web Audio via user gesture or physical shake.
   */
  public async unlock(): Promise<boolean> {
    return this.unlockAudio("button");
  }

  /**
   * Alias for unlock with source logging.
   */
  public async unlockAudio(source: "button" | "shake" | "auto" = "button"): Promise<boolean> {
    if (this.isUnlocked && this.status === "ready") {
      return true;
    }

    if (this.unlockPromise) {
      return this.unlockPromise;
    }

    this.unlockPromise = this.performUnlock(source);
    try {
      return await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  private async performUnlock(source: "button" | "shake" | "auto"): Promise<boolean> {
    this.status = "initializing";
    this.notify();

    await this.initialize();

    let audioElemUnlocked = false;

    // 1. Unlock persistent HTMLAudioElement with silent audio
    if (this.audio) {
      try {
        this.audio.src = SILENT_WAV_BASE64;
        this.audio.volume = 0.01;
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          this.audio.pause();
          this.audio.currentTime = 0;
          this.audio.volume = 1;
          audioElemUnlocked = true;
        }
      } catch (err) {
        const errorStr = String(err);
        console.warn("[INAI Audio] HTMLAudioElement silent unlock failed:", errorStr);
        this.lastAudioError = `HTMLAudioElement unlock: ${errorStr}`;
        if (errorStr.includes("NotAllowedError") || errorStr.includes("autoplay")) {
          this.status = "blocked";
        }
      }
    }

    // 2. Also warm up Web Audio if present
    try {
      const ctx = this.getOrCreateAudioContext();
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch {
      // Non-critical AudioContext
    }

    const success = audioElemUnlocked || (this.audioContext && this.audioContext.state === "running");

    if (success) {
      this.isUnlocked = true;
      this.status = "ready";
      this.lastAudioError = null;

      try {
        localStorage.setItem(STORAGE_UNLOCKED_KEY, "true");
        localStorage.setItem(STORAGE_SETUP_COMPLETE_KEY, "true");
      } catch {
        // Ignore storage error
      }

      // Haptic confirmation
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate([80, 40, 120]);
        } catch {
          // Ignore
        }
      }

      // Pleasant confirmation chime
      this.playConfirmationChime();
      console.log(`[INAI Audio] Unlocked successfully via ${source}. Ready.`);
    } else {
      if (this.status !== "blocked") {
        this.status = "blocked";
      }
      console.warn(`[INAI Audio] Unlock failed via ${source}.`);
    }

    this.notify();
    return Boolean(success);
  }

  /**
   * Play any audio URL or Blob URL safely through the persistent HTMLAudioElement.
   */
  public async playAudio(url: string, onEndedClean?: () => void): Promise<void> {
    await this.initialize();
    if (!this.audio) {
      throw new Error("HTMLAudioElement is not initialized");
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        if (this.audio) {
          this.audio.onended = null;
          this.audio.onerror = null;
        }
        this.isPlaying = false;
        if (onEndedClean) {
          try {
            onEndedClean();
          } catch {
            // Ignore
          }
        }
      };

      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.onEnd?.();
        resolve();
      };

      const finishError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.lastAudioError = err.message;
        this.onEnd?.();
        reject(err);
      };

      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = url;
        this.audio.volume = 1.0;

        this.audio.onended = finishSuccess;
        this.audio.onerror = () => {
          const errCode = this.audio?.error ? this.audio.error.code : "unknown";
          finishError(new Error(`HTMLAudioElement error code ${errCode}`));
        };

        this.isPlaying = true;
        const playPromise = this.audio.play();

        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            const errStr = String(err);
            console.error("[INAI Audio] Playback rejected:", errStr);
            if (errStr.includes("NotAllowedError")) {
              this.status = "blocked";
              this.notify();
            }
            finishError(new Error(errStr));
          });
        }
      } catch (err) {
        finishError(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Main INAI voice entrypoint:
   * Generates MP3 audio via existing TTS provider (ElevenLabs / Cloud TTS)
   * and plays sequentially through persistent HTMLAudioElement.
   */
  public async speak(
    text: string,
    options?: { priority?: "emergency" | "alert" | "guidance" | "chat"; interrupt?: boolean },
  ): Promise<void> {
    const clean = text.trim();
    if (!clean) return;

    const priority = options?.priority ?? "guidance";
    const interrupt = options?.interrupt ?? (priority === "emergency");

    return new Promise<void>((resolve, reject) => {
      const item: SpeechQueueItem = {
        text: clean,
        options: { priority, interrupt },
        resolve,
        reject,
      };

      if (interrupt) {
        // Immediate interrupt: stop current playback and clear non-emergency items
        this.stop();
        this.queue = this.queue.filter((q) => q.options.priority === "emergency");
        this.queue.unshift(item);
      } else {
        this.queue.push(item);
      }

      void this.processNextInQueue();
    });
  }

  /**
   * Sequential speech queue runner. Prevents overlapping audio.
   */
  private async processNextInQueue(): Promise<void> {
    if (this.isPlaying || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.activeItem = item;

    // Display captions and notify start
    this.onCaption?.(item.text, item.options.priority);
    this.onStart?.(item.text);

    let audioUrl = "";
    let revokeFn: (() => void) | undefined;

    try {
      // Generate real MP3 audio via TTS provider
      const generated = await generateINAIVoice(item.text);
      audioUrl = generated.audioUrl;
      revokeFn = generated.revoke;
      this.currentRevokeFn = revokeFn || null;

      if (!audioUrl) {
        throw new Error("No audio URL generated");
      }

      await this.playAudio(audioUrl, () => {
        if (revokeFn) {
          revokeFn();
          this.currentRevokeFn = null;
        }
      });

      this.activeItem = null;
      item.resolve();
    } catch (err) {
      console.warn("[INAI Audio] Speech item failed:", item.text, err);
      if (revokeFn) {
        revokeFn();
        this.currentRevokeFn = null;
      }
      this.activeItem = null;
      // Do not crash, resolve gracefully so calling components continue
      item.resolve();
    } finally {
      // Process next message in queue sequentially
      void this.processNextInQueue();
    }
  }

  /**
   * Stop all current playback and clear speech queue.
   */
  public stop(): void {
    if (this.currentRevokeFn) {
      try {
        this.currentRevokeFn();
      } catch {
        // Ignore
      }
      this.currentRevokeFn = null;
    }

    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = "";
      } catch {
        // Ignore
      }
    }

    // Resolve any pending items
    for (const item of this.queue) {
      item.resolve();
    }
    this.queue = [];
    this.isPlaying = false;
    this.activeItem = null;
    this.onEnd?.();
  }

  /**
   * Pause currently playing audio.
   */
  public pause(): void {
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Resume audio playback.
   */
  public async resume(): Promise<void> {
    if (this.audio && this.audio.paused && this.isPlaying) {
      try {
        await this.audio.play();
      } catch (err) {
        console.warn("[INAI Audio] Resume failed:", err);
      }
    }
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Ignore
      }
    }
  }

  public isReady(): boolean {
    return this.isUnlocked && this.status === "ready";
  }

  public isAudioUnlocked(): boolean {
    return this.isReady();
  }

  public getStatus(): AudioStatus {
    return this.status;
  }

  /**
   * Play a dual-tone confirmation chime using Web Audio.
   */
  public playConfirmationChime(): void {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (!ctx || ctx.state !== "running") return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Fallback
    }
  }

  public setMotionStatus(status: MotionStatus): void {
    this.motionStatus = status;
    this.notifyDiag();
  }

  public setMotionPermission(permission: MotionPermissionStatus): void {
    this.motionPermission = permission;
    this.notifyDiag();
  }

  public setShakeDetectorActive(active: boolean): void {
    this.shakeDetectorActive = active;
    this.notifyDiag();
  }

  public recordShake(magnitude: number): void {
    this.lastShake = {
      magnitude: Math.round(magnitude * 10) / 10,
      timestamp: Date.now(),
    };
    this.notifyDiag();
  }

  public getDiagnostics(): AudioDiagnostics {
    const audioCtxState = this.audioContext ? this.audioContext.state : "none";

    return {
      audioContextState: audioCtxState,
      audioStatus: this.status,
      isUnlocked: this.isUnlocked,
      motionStatus: this.motionStatus,
      motionPermission: this.motionPermission,
      shakeDetectorActive: this.shakeDetectorActive,
      ttsStatus: "ready",
      isWebView: this.isWebView(),
      lastAudioError: this.lastAudioError,
      lastShake: this.lastShake,
    };
  }

  public subscribe(listener: AudioStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public subscribeDiagnostics(listener: DiagnosticsListener): () => void {
    this.diagListeners.add(listener);
    listener(this.getDiagnostics());
    return () => {
      this.diagListeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.statusListeners) {
      try {
        listener(this.status);
      } catch {
        // Guard listener
      }
    }
    this.notifyDiag();
  }

  private notifyDiag(): void {
    const diag = this.getDiagnostics();
    for (const listener of this.diagListeners) {
      try {
        listener(diag);
      } catch {
        // Guard listener
      }
    }
  }
}

export const inaiAudioManager = INAIAudioManagerClass.getInstance();
