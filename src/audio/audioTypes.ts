export type AudioStatus =
  | "unknown"
  | "initializing"
  | "ready"
  | "blocked"
  | "unsupported"
  | "error";

export type MotionStatus =
  | "available"
  | "unavailable"
  | "unsupported"
  | "checking";

export type MotionPermissionStatus =
  | "granted"
  | "denied"
  | "unknown"
  | "unsupported";

export interface ShakeConfig {
  /** Minimum acceleration threshold in m/s^2 (default: 15) */
  threshold: number;
  /** Number of strong peaks needed within the time window (default: 2) */
  requiredCount: number;
  /** Time window in ms to accumulate shake count (default: 1200) */
  windowMs: number;
  /** Cooldown in ms after successful shake before next detection (default: 2500) */
  cooldownMs: number;
  /** Whether to log motion readings to console for tuning in dev */
  debugLogging: boolean;
}

export interface AudioDiagnostics {
  audioContextState: AudioContextState | "unavailable" | "none";
  audioStatus: AudioStatus;
  isUnlocked: boolean;
  motionStatus: MotionStatus;
  motionPermission: MotionPermissionStatus;
  shakeDetectorActive: boolean;
  ttsStatus: "ready" | "unavailable" | "error";
  isWebView: boolean;
  lastAudioError: string | null;
  lastShake: {
    magnitude: number;
    timestamp: number;
  } | null;
}

export type AudioStatusListener = (status: AudioStatus) => void;
export type DiagnosticsListener = (diagnostics: AudioDiagnostics) => void;
