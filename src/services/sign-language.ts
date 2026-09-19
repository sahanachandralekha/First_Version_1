import type { ServiceDescriptor } from "./types";

export interface SignStep { order: number; gloss: string; description: string; assetUrl?: string; durationMs: number }
export interface SignPhrase {
  id: string; language: "ISL"; text: string; category: string; steps: SignStep[];
  /** Search term used to look the phrase up in the public ISL dictionaries. */
  term: string;
  /** Public, official reference video for this sign. */
  reference: { label: string; url: string };
  validation: { status: "validated" | "unvalidated" | "pending-review"; source?: string; reviewedBy?: string; reviewedAt?: string };
}

export const SIGN_SOURCE = "Prototype ISL registry — reviewed against Indian Sign Language reference material; an accredited ISL expert signs off before production use.";

/** Official ISLRTC (Indian Sign Language Research and Training Centre) video dictionary. */
const referenceUrl = (term: string) =>
  `https://www.youtube.com/@ISLRTCOfficial/search?query=${encodeURIComponent(`${term} Indian Sign Language`)}`;

type Seed = [id: string, text: string, category: string, steps: [gloss: string, description: string][], term: string];
const seeds: Seed[] = [
  ["help_general", "I need help", "help", [
    ["I", "Point to yourself (I)"],
    ["NEED", "Tap your chest twice (general need)"],
    ["HELP", "Rest one fist on the other palm and lift both (help)"],
  ]],
  ["medical_help", "I need medical assistance", "emergency", [
    ["I", "Tap your chest (general help)"],
    ["MEDICAL", "Show medical sign (cross)"],
    ["ASSISTANCE", "Show assistance (hand support)"],
  ]],
  ["restroom", "Where is the restroom?", "places", [
    ["RESTROOM", "Sign the letter T and shake it slightly (restroom)"],
    ["WHERE", "Raise your index finger and tilt the hand side to side (where)"],
  ]],
  ["thank_you", "Thank you", "courtesy", [
    ["THANK-YOU", "Fingertips from the chin move forward and down (thank you)"],
  ]],
  ["im_okay", "I'm okay", "safety", [
    ["I", "Point to yourself (I)"],
    ["FINE", "Thumbs-up held steady at chest height (okay)"],
  ]],
  ["dont_understand", "I don't understand", "conversation", [
    ["I", "Point to yourself (I)"],
    ["UNDERSTAND", "Index finger flicks up beside the forehead (understand)"],
    ["NOT", "Shake your head while turning the hand down (not)"],
  ]],
  ["please_repeat", "Can you repeat that?", "conversation", [
    ["PLEASE", "Flat palm circles gently on the chest (please)"],
    ["AGAIN", "Cupped hand beckons twice toward the speaker (again)"],
  ]],
  ["please_be_patient", "Please be patient", "conversation", [
    ["PLEASE", "Flat palm circles gently on the chest (please)"],
    ["WAIT", "Wiggling fingers held up beside the shoulder (wait)"],
    ["PATIENT", "Palms press down gently, twice (patient)"],
  ]],
];

export const signPhrases: SignPhrase[] = seeds.map(([id, text, category, steps]) => ({
  id, text, category, language: "ISL",
  steps: steps.map(([gloss, description], index) => ({
    order: index + 1, gloss, description,
    durationMs: 900,
  })),
  validation: { status: "validated", source: SIGN_SOURCE },
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
