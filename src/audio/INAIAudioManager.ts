import type {
  AudioDiagnostics,
  AudioStatus,
  AudioStatusListener,
  DiagnosticsListener,
  MotionPermissionStatus,
  MotionStatus,
} from "./audioTypes";

const SILENT_WAV_BASE64 =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

const STORAGE_UNLOCKED_KEY = "inai_audio_unlocked";
const STORAGE_SETUP_COMPLETE_KEY = "inai_audio_setup_complete";

class INAIAudioManagerClass {
  private static instance: INAIAudioManagerClass | null = null;

  private audioContext: AudioContext | null = null;
  private unlockAudioElement: HTMLAudioElement | null = null;
  private status: AudioStatus = "unknown";
  private isUnlocked = false;
  private lastAudioError: string | null = null;
  private lastShake: { magnitude: number; timestamp: number } | null = null;
  private motionStatus: MotionStatus = "checking";
  private motionPermission: MotionPermissionStatus = "unknown";
  private shakeDetectorActive = false;
  private statusListeners = new Set<AudioStatusListener>();
  private diagListeners = new Set<DiagnosticsListener>();
  private unlockPromise: Promise<boolean> | null = null;

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

    // Check Web Audio support
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      this.status = "unsupported";
      return;
    }

    // Check if previously unlocked
    try {
      const storedUnlocked = localStorage.getItem(STORAGE_UNLOCKED_KEY);
      const storedSetup = localStorage.getItem(STORAGE_SETUP_COMPLETE_KEY);
      if (storedUnlocked === "true" || storedSetup === "true") {
        // We know user completed setup, but browser may still require warm-up gesture
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
    // Standard Android WebView indicators
    const isAndroid = /Android/i.test(ua);
    const hasWv = /;\s*wv|Version\/[0-9.]+\s+Chrome/i.test(ua);
    const isAppilix = /Appilix/i.test(ua);
    return (isAndroid && hasWv) || isAppilix;
  }

  /** Lazy-create single AudioContext */
  private getOrCreateAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
        } catch (err) {
          console.error("[INAI Audio] Failed to construct AudioContext:", err);
          this.lastAudioError = String(err);
          this.status = "error";
          this.notify();
          return null;
        }
      }
    }
    return this.audioContext;
  }

  /** Lazy-create reusable HTMLAudioElement */
  private getOrCreateAudioElement(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!this.unlockAudioElement) {
      try {
        this.unlockAudioElement = new Audio();
        this.unlockAudioElement.preload = "auto";
        this.unlockAudioElement.playsInline = true;
      } catch (err) {
        console.warn("[INAI Audio] Failed to create HTMLAudioElement:", err);
      }
    }
    return this.unlockAudioElement;
  }

  /**
   * Unlock AudioContext and HTMLAudioElement inside user gesture or shake event.
   * Safe against concurrent calls.
   */
  public async unlockAudio(source: "button" | "shake" | "auto" = "button"): Promise<boolean> {
    if (this.isUnlocked && this.audioContext && this.audioContext.state === "running") {
      this.status = "ready";
      this.notify();
      return true;
    }

    if (this.unlockPromise) {
      return this.unlockPromise;
    }

    this.unlockPromise = this.performAudioUnlock(source);
    try {
      return await this.unlockPromise;
    } finally {
      this.unlockPromise = null;
    }
  }

  private async performAudioUnlock(source: "button" | "shake" | "auto"): Promise<boolean> {
    this.status = "initializing";
    this.notify();

    let ctxResumed = false;
    let audioElemUnlocked = false;

    // 1. Resume / Initialize AudioContext
    try {
      const ctx = this.getOrCreateAudioContext();
      if (ctx) {
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        // Play a silent 1ms buffer to ensure audio pipeline is active
        const buffer = ctx.createBuffer(1, 1, 22050);
        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = buffer;
        sourceNode.connect(ctx.destination);
        sourceNode.start(0);

        ctxResumed = ctx.state === "running";
      }
    } catch (err) {
      console.warn("[INAI Audio] AudioContext resume failed:", err);
      this.lastAudioError = `AudioContext resume: ${String(err)}`;
    }

    // 2. Play silent HTMLAudioElement to satisfy WebView media policy
    try {
      const audio = this.getOrCreateAudioElement();
      if (audio) {
        audio.src = SILENT_WAV_BASE64;
        audio.volume = 0.01;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          audio.pause();
          audio.currentTime = 0;
          audioElemUnlocked = true;
        }
      }
    } catch (err) {
      const errorStr = String(err);
      console.warn("[INAI Audio] HTMLAudioElement unlock failed:", errorStr);
      this.lastAudioError = `Audio element unlock: ${errorStr}`;
      // In WebView, if playback was blocked by policy:
      if (errorStr.includes("NotAllowedError") || errorStr.includes("autoplay")) {
        this.status = "blocked";
      }
    }

    // 3. Evaluate success
    const success = ctxResumed || audioElemUnlocked;

    if (success) {
      this.isUnlocked = true;
      this.status = "ready";
      this.lastAudioError = null;

      try {
        localStorage.setItem(STORAGE_UNLOCKED_KEY, "true");
        localStorage.setItem(STORAGE_SETUP_COMPLETE_KEY, "true");
      } catch {
        // Ignore storage errors
      }

      // Haptic confirmation
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate([80, 40, 120]);
        } catch {
          // Ignore vibration failure
        }
      }

      // Gentle confirmation chime via Web Audio (non-intrusive)
      this.playConfirmationChime();

      console.log(`[INAI Audio] Unlocked successfully via ${source}. State: ready.`);
    } else {
      if (this.status !== "blocked") {
        this.status = "blocked";
      }
      console.warn(`[INAI Audio] Unlock failed via ${source}. State: blocked.`);
    }

    this.notify();
    return success;
  }

  /**
   * Play a pleasant dual-tone confirmation chime using Web Audio.
   */
  public playConfirmationChime(): void {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (!ctx || ctx.state !== "running") return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Non-critical chime fallback
    }
  }

  /**
   * Safe TTS adapter: speaks text through TTS service with AudioContext readiness check.
   */
  public async speak(
    text: string,
    options?: { priority?: "emergency" | "alert" | "guidance" | "chat"; interrupt?: boolean }
  ): Promise<void> {
    const { ttsService } = await import("@/services/tts");
    // Ensure suspended AudioContext is resumed if needed
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch {
        // Continue to TTS
      }
    }
    return ttsService.speak(text, {
      priority: options?.priority ?? "guidance",
      interrupt: options?.interrupt ?? false,
    });
  }

  /**
   * Play an audio URL safely with full Promise rejection handling.
   */
  public async playAudio(url: string): Promise<void> {
    const audio = this.getOrCreateAudioElement();
    if (!audio) {
      throw new Error("HTMLAudioElement is not supported in this environment");
    }

    try {
      audio.src = url;
      audio.volume = 1.0;
      await audio.play();
    } catch (err) {
      const errStr = String(err);
      console.error("[INAI Audio] Playback failed for URL:", url, err);
      this.lastAudioError = `playAudio failed: ${errStr}`;
      if (errStr.includes("NotAllowedError")) {
        this.status = "blocked";
        this.notify();
      }
      throw err;
    }
  }

  /**
   * Stop any current audio element playback.
   */
  public stop(): void {
    if (this.unlockAudioElement) {
      try {
        this.unlockAudioElement.pause();
        this.unlockAudioElement.currentTime = 0;
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Pause current audio element.
   */
  public pause(): void {
    if (this.unlockAudioElement) {
      try {
        this.unlockAudioElement.pause();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Resume current audio element or AudioContext.
   */
  public async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn("[INAI Audio] AudioContext resume failed:", err);
      }
    }
    if (this.unlockAudioElement && this.unlockAudioElement.paused) {
      try {
        await this.unlockAudioElement.play();
      } catch (err) {
        console.warn("[INAI Audio] Audio resume failed:", err);
      }
    }
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked && this.status === "ready";
  }

  public getStatus(): AudioStatus {
    return this.status;
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
    const ttsReady =
      typeof window !== "undefined" && "speechSynthesis" in window
        ? "ready"
        : "unavailable";

    return {
      audioContextState: audioCtxState,
      audioStatus: this.status,
      isUnlocked: this.isUnlocked,
      motionStatus: this.motionStatus,
      motionPermission: this.motionPermission,
      shakeDetectorActive: this.shakeDetectorActive,
      ttsStatus: ttsReady,
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
        // Guard listener failure
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
        // Guard listener failure
      }
    }
  }
}

export const inaiAudioManager = INAIAudioManagerClass.getInstance();
