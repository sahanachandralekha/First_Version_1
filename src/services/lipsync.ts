/**
 * Lip sync engine.
 *
 * Preferred path: route real audio through a WebAudio AnalyserNode (fftSize 512),
 * compute RMS per animation frame, smooth with an EMA (alpha 0.35), clamp to 0..1
 * and quantize to the six mouth overlay frames the avatar supports.
 *
 * Fallback path: browser speech synthesis does not expose an audio node, so the
 * synthetic driver shapes the mouth from `boundary` events — the upcoming word's
 * vowels choose a viseme class — with a light oscillation between words.
 */

export type Viseme = "closed" | "m" | "e" | "a" | "o" | "wide";
export const VISEME_FRAMES: Viseme[] = ["closed", "m", "e", "a", "o", "wide"];

const EMA_ALPHA = 0.35;

/** Openness 0..1 quantized onto the six overlay frames. */
export function quantizeMouth(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * (VISEME_FRAMES.length - 1)) / (VISEME_FRAMES.length - 1);
}

export function visemeForWord(word: string): Viseme {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return "closed";
  if (/^[mbp]/.test(letters)) return "m";
  const vowels = letters.match(/[aeiou]/g) ?? [];
  const vowel = vowels[0];
  if (vowel === "a") return "a";
  if (vowel === "o" || vowel === "u") return "o";
  if (vowel === "e" || vowel === "i") return "e";
  return letters.length > 6 ? "wide" : "e";
}

const visemeOpenness: Record<Viseme, number> = { closed: 0, m: 0.1, e: 0.4, a: 0.8, o: 0.6, wide: 1 };

export class LipSyncEngine {
  private frame?: number;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private buffer?: Float32Array;
  private smoothed = 0;
  private target = 0;
  private running = false;
  onFrame: (openness: number) => void = () => undefined;

  /** Analyser-backed path for real audio (MediaStream or media element). */
  attachAudio(source: MediaStream | HTMLMediaElement) {
    this.stop();
    if (typeof window === "undefined") return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return this.startSynthetic();
    try {
      const context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      const node = source instanceof MediaStream
        ? context.createMediaStreamSource(source)
        : context.createMediaElementSource(source);
      node.connect(analyser);
      if (!(source instanceof MediaStream)) analyser.connect(context.destination);
      this.context = context;
      this.analyser = analyser;
      this.buffer = new Float32Array(analyser.fftSize);
      this.running = true;
      this.loop();
    } catch {
      this.startSynthetic();
    }
  }

  /** Boundary-driven path used with browser speech synthesis. */
  startSynthetic() {
    this.stop();
    this.running = true;
    this.target = 0.45;
    this.loop();
  }

  /** Called from a speech `boundary` event with the upcoming word. */
  setWord(word: string) {
    this.target = visemeOpenness[visemeForWord(word)];
  }

  private loop = () => {
    if (!this.running || typeof window === "undefined") return;
    let level = this.target;
    if (this.analyser && this.buffer) {
      this.analyser.getFloatTimeDomainData(this.buffer);
      let sum = 0;
      for (const sample of this.buffer) sum += sample * sample;
      level = Math.sqrt(sum / this.buffer.length) * 6;
    } else {
      // gentle oscillation so the mouth never freezes between boundary events
      level = this.target * (0.7 + 0.3 * Math.abs(Math.sin(performance.now() / 90)));
    }
    this.smoothed = this.smoothed + EMA_ALPHA * (Math.min(1, Math.max(0, level)) - this.smoothed);
    this.onFrame(quantizeMouth(this.smoothed));
    this.frame = window.requestAnimationFrame(this.loop);
  };

  /** Always closes the mouth, so it never stays open after audio ends. */
  stop() {
    this.running = false;
    if (typeof window !== "undefined" && this.frame !== undefined) window.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.analyser = undefined;
    this.buffer = undefined;
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.smoothed = 0;
    this.target = 0;
    this.onFrame(0);
  }
}

export const lipSync = new LipSyncEngine();
