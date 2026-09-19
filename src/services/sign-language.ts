import type { ServiceDescriptor } from "./types";
export interface SignStep { order: number; gloss: string; description: string; assetUrl: string; durationMs: number }
export interface SignPhrase {
  id: string; language: "ISL"; text: string; category: string; steps: SignStep[];
  validation: { status: "validated" | "unvalidated"; source?: string; reviewedBy?: string };
}
const source = "Prototype registry — requires review by an accredited ISL expert before production use";
const signPhraseSeeds: Array<[string, string, string]> = [
  ["help_general", "I need help", "help"], ["medical_help", "I need medical help", "emergency"],
  ["restroom", "Where is the restroom?", "places"], ["dont_understand", "I don't understand", "conversation"],
  ["please_repeat", "Please repeat that", "conversation"], ["thank_you", "Thank you", "courtesy"],
  ["im_okay", "I'm okay", "safety"], ["please_be_patient", "Please be patient", "conversation"],
];
export const signPhrases: SignPhrase[] = signPhraseSeeds.map(([id, text, category]) => ({ id, text, category, language: "ISL", steps: [], validation: { status: "unvalidated", source } }));
export interface SignService extends ServiceDescriptor { get(id: string): SignPhrase | null; demoPhrases(): SignPhrase[] }
export class RegistrySignService implements SignService {
  readonly name = "ISL phrase playback"; readonly mode = "REAL" as const;
  readonly description = "Playback is limited to reviewed registry phrases.";
  get(id: string) { return signPhrases.find((phrase) => phrase.id === id) ?? null; }
  demoPhrases() { return signPhrases.filter((phrase) => phrase.validation.status === "validated"); }
}
export const missingSignMessage = "I don't have a verified sign for this yet";
