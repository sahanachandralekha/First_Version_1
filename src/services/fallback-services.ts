import type { AudioService, SceneService, SpeechService } from "./contracts";
import type { NormalizedEvent } from "./events";
export class ProtectedSceneService implements SceneService {
  readonly name = "Scene understanding"; readonly mode = "REAL" as const;
  readonly description = "Protected AI scene interpretation, connected in a later backend stage.";
  async understand(_image: Blob): Promise<string> { throw new Error("Scene understanding is temporarily unavailable. Raw detections can still continue."); }
}
export class MockAudioService implements AudioService {
  readonly name = "Sound direction"; readonly mode = "MOCK" as const;
  readonly description = "Direction and distance are simulated in this prototype.";
  async start(_stream: MediaStream) {} stop() {}
  subscribe(_listener: (event: NormalizedEvent) => void) { return () => {}; }
}
export class BrowserSpeechService implements SpeechService {
  readonly name = "Speech recognition"; readonly mode = "REAL" as const;
  readonly description = "Uses browser speech recognition where supported.";
  async start() { if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) throw new Error("Speech recognition is unavailable in this browser."); }
  stop() {}
  subscribe(_listener: (text: string, final: boolean) => void) { return () => {}; }
}
