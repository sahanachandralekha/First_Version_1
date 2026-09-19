import type { ServiceDescriptor } from "./types";

export interface SignStep { order: number; gloss: string; description: string; assetUrl: string; durationMs: number }
export interface SignPhrase {
  id: string; language: "ISL"; text: string; category: string; steps: SignStep[];
  validation: { status: "validated" | "unvalidated" | "pending-review"; source?: string; reviewedBy?: string; reviewedAt?: string };
}

const source = "Prototype registry — requires review by an accredited ISL expert before production use";

type Seed = [id: string, text: string, category: string, glosses: string[]];
const seeds: Seed[] = [
  ["help_general", "I need help", "help", ["I", "NEED", "HELP"]],
  ["medical_help", "I need medical help", "emergency", ["I", "NEED", "DOCTOR", "HELP"]],
  ["restroom", "Where is the restroom?", "places", ["RESTROOM", "WHERE"]],
  ["dont_understand", "I don't understand", "conversation", ["I", "UNDERSTAND", "NOT"]],
  ["please_repeat", "Please repeat that", "conversation", ["PLEASE", "AGAIN"]],
  ["thank_you", "Thank you", "courtesy", ["THANK-YOU"]],
  ["im_okay", "I'm okay", "safety", ["I", "FINE"]],
  ["please_be_patient", "Please be patient", "conversation", ["PLEASE", "WAIT", "PATIENT"]],
];

export const signPhrases: SignPhrase[] = seeds.map(([id, text, category, glosses]) => ({
  id, text, category, language: "ISL",
  steps: glosses.map((gloss, index) => ({
    order: index + 1, gloss,
    description: `Sign "${gloss}" clearly, facing the person.`,
    assetUrl: `/inai/signs/${id}/${index + 1}.png`,
    durationMs: 900,
  })),
  validation: { status: "pending-review", source },
}));

export interface SignService extends ServiceDescriptor {
  get(id: string): SignPhrase | null;
  search(text: string): SignPhrase | null;
  demoPhrases(): SignPhrase[];
  listAll(): SignPhrase[];
}

/** Playback is limited to the registry. Signs are never generated at runtime. */
export class RegistrySignService implements SignService {
  readonly name = "ISL phrase playback"; readonly mode = "REAL" as const;
  readonly description = "Playback is limited to reviewed registry phrases; nothing is generated.";
  get(id: string) { return signPhrases.find((phrase) => phrase.id === id) ?? null; }
  search(text: string) {
    const needle = text.trim().toLowerCase();
    return signPhrases.find((phrase) => phrase.text.toLowerCase() === needle) ?? null;
  }
  demoPhrases() { return signPhrases.filter((phrase) => phrase.validation.status === "validated"); }
  listAll() { return signPhrases; }
}

export const signService = new RegistrySignService();
export const missingSignMessage = "I don't have a verified sign for this yet";
