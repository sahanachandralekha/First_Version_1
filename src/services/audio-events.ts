import type { ServiceDescriptor } from "./types";
import { eventBus, nextEventId, type NormalizedEvent } from "./events";

export type SoundClass = "siren" | "horn" | "alarm" | "doorbell" | "speech";

export interface SoundEvent {
  id: string; soundClass: SoundClass; label: string; confidence: number;
  /** Direction and distance are simulated — always rendered with a MOCK badge. */
  direction: "left" | "right" | "front" | "back";
  distance: number; mock: true; ts: number;
}

const labels: Record<SoundClass, string> = {
  siren: "Emergency siren", horn: "Vehicle horn", alarm: "Alarm",
  doorbell: "Doorbell", speech: "People talking",
};
const severityFor: Record<SoundClass, NormalizedEvent["severity"]> = {
  siren: "critical", horn: "warn", alarm: "warn", doorbell: "notice", speech: "info",
};
const directions: Array<SoundEvent["direction"]> = ["left", "right", "front", "back"];

/** Heuristic classifier over an FFT magnitude frame. Exported for testing. */
export function classifyFrame(bins: Float32Array, sampleRate: number, history: number[]): { soundClass: SoundClass; confidence: number } | null {
  const binHz = sampleRate / 2 / bins.length;
  const energy = (from: number, to: number) => {
    let sum = 0; let count = 0;
    for (let i = Math.floor(from / binHz); i < Math.min(bins.length, Math.ceil(to / binHz)); i += 1) { sum += bins[i] ?? -140; count += 1; }
    return count ? sum / count : -140;
  };
  const total = energy(80, 8000);
  if (total < -85) return null;

  const low = energy(80, 300);
  const voice = energy(300, 3000);
  const high = energy(2000, 5000);

  // dominant peak, used for siren sweeps and steady alarm tones
  let peakIndex = 0; let peakValue = -Infinity;
  for (let i = 0; i < bins.length; i += 1) { const value = bins[i] ?? -140; if (value > peakValue) { peakValue = value; peakIndex = i; } }
  const peakHz = peakIndex * binHz;
  history.push(peakHz);
  if (history.length > 24) history.shift();
  const spread = Math.max(...history) - Math.min(...history);
  const steady = spread < 60;

  if (peakHz > 500 && peakHz < 1800 && spread > 250) return { soundClass: "siren", confidence: Math.min(0.95, 0.5 + spread / 2000) };
  if (peakHz > 1800 && steady && high > -70) return { soundClass: "alarm", confidence: 0.7 };
  if (low > voice + 6 && high < -75) return { soundClass: "horn", confidence: 0.65 };
  if (peakHz > 600 && peakHz < 1200 && steady && total < -60) return { soundClass: "doorbell", confidence: 0.55 };
  if (voice > high + 8 && voice > -75) return { soundClass: "speech", confidence: 0.6 };
  return null;
}

type SoundListener = (event: SoundEvent) => void;

export class BrowserAudioEventService implements ServiceDescriptor {
  readonly name = "Sound classification"; readonly mode = "REAL" as const;
  readonly description = "Browser audio analysis with heuristic sound classes. Direction and distance are simulated.";
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  private timer?: number;
  private history: number[] = [];
  private lastEmitted = new Map<SoundClass, number>();
  private listeners = new Set<SoundListener>();
  /** Live input level 0..1 for the waveform display. */
  level = 0;

  subscribe(listener: SoundListener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctor();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    const bins = new Float32Array(this.analyser.frequencyBinCount);
    const wave = new Float32Array(this.analyser.fftSize);
    this.timer = window.setInterval(() => {
      if (!this.analyser || !this.context) return;
      this.analyser.getFloatFrequencyData(bins);
      this.analyser.getFloatTimeDomainData(wave);
      let sum = 0; for (const sample of wave) sum += sample * sample;
      this.level = Math.min(1, Math.sqrt(sum / wave.length) * 5);
      const result = classifyFrame(bins, this.context.sampleRate, this.history);
      if (!result) return;
      const last = this.lastEmitted.get(result.soundClass) ?? 0;
      if (Date.now() - last < 6000) return;
      this.lastEmitted.set(result.soundClass, Date.now());
      this.publish(result.soundClass, result.confidence);
    }, 200);
  }

  /** Simulated direction and distance, always tagged mock. */
  private publish(soundClass: SoundClass, confidence: number) {
    const direction = directions[Math.floor(Math.random() * directions.length)] ?? "left";
    const distance = soundClass === "siren" ? 20 : soundClass === "speech" ? 8 : 12;
    const event: SoundEvent = {
      id: nextEventId("sound"), soundClass, label: labels[soundClass], confidence,
      direction, distance, mock: true, ts: Date.now(),
    };
    this.listeners.forEach((listener) => listener(event));
    eventBus.emit({
      id: event.id, source: "audio", type: "sound", subtype: soundClass, label: event.label,
      confidence, severity: severityFor[soundClass],
      message: `${event.label} detected on your ${direction}, about ${distance} metres away.`,
      direction, distance, proximity: distance, mock: true,
      relevantNeeds: ["hearing"], timestamp: event.ts,
    });
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.level = 0;
  }
}

export const audioEventService = new BrowserAudioEventService();

export const microphoneUnavailableError = {
  title: "Microphone is not available",
  whatHappened: "INAI could not listen through the microphone, so sound alerts are paused.",
  whatYouCanDo: "Allow microphone access for this site, then tap Try again. The rest of this screen still works.",
};
