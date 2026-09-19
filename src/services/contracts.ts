import type { NormalizedEvent } from "./events";
import type { ServiceDescriptor } from "./types";

export interface VisionService extends ServiceDescriptor { start(video: HTMLVideoElement): Promise<void>; stop(): void }
export interface SceneService extends ServiceDescriptor { understand(image: Blob): Promise<string> }
export interface AudioService extends ServiceDescriptor { start(stream: MediaStream): Promise<void>; stop(): void; subscribe(listener: (event: NormalizedEvent) => void): () => void }
export interface SpeechService extends ServiceDescriptor { start(): Promise<void>; stop(): void; subscribe(listener: (text: string, final: boolean) => void): () => void }
export interface LocationService extends ServiceDescriptor { locate(): Promise<GeolocationPosition>; listAccessiblePlaces(): Promise<AccessiblePlace[]> }
export interface EmergencyService extends ServiceDescriptor { activate(): Promise<{ timeline: string[]; simulated: true }> }
export interface HapticService extends ServiceDescriptor { pulse(severity: NormalizedEvent["severity"]): void }
export interface DemoDirector extends ServiceDescriptor { run(): AsyncGenerator<NormalizedEvent> }
export interface AccessiblePlace { id: string; name: string; category: "hospital" | "exit" | "restroom" | "emergency"; distanceMetres: number; simulated: boolean }
