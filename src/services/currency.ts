/**
 * Indian Rupee (INR) Banknote Recognition Engine
 *
 * Dedicated visual and textual analysis for Mahatma Gandhi New Series banknotes:
 * ₹10 (Chocolate Brown), ₹20 (Greenish Yellow), ₹50 (Fluorescent Blue),
 * ₹100 (Lavender), ₹200 (Bright Yellow/Orange), ₹500 (Stone Grey).
 *
 * Designed specifically for blind and visually impaired users.
 * STRICT SAFETY RULE: Assistive identification only. Never claims counterfeit
 * status, authenticity, or legal tender validity.
 */

export interface INRBanknoteProfile {
  denomination: 10 | 20 | 50 | 100 | 200 | 500;
  name: string;
  colorName: string;
  motif: string;
  hueRange: [number, number]; // in degrees [min, max]
  minSaturation: number;
  maxSaturation: number;
  minBrightness: number;
}

export const INR_PROFILES: Record<number, INRBanknoteProfile> = {
  10: {
    denomination: 10,
    name: "10 rupees",
    colorName: "Chocolate Brown",
    motif: "Sun Temple, Konark",
    hueRange: [15, 38],
    minSaturation: 0.25,
    maxSaturation: 0.85,
    minBrightness: 0.3,
  },
  20: {
    denomination: 20,
    name: "20 rupees",
    colorName: "Greenish Yellow",
    motif: "Ellora Caves",
    hueRange: [60, 95],
    minSaturation: 0.3,
    maxSaturation: 0.9,
    minBrightness: 0.45,
  },
  50: {
    denomination: 50,
    name: "50 rupees",
    colorName: "Fluorescent Blue",
    motif: "Hampi with Chariot",
    hueRange: [175, 215],
    minSaturation: 0.35,
    maxSaturation: 0.95,
    minBrightness: 0.4,
  },
  100: {
    denomination: 100,
    name: "100 rupees",
    colorName: "Lavender",
    motif: "Rani ki Vav",
    hueRange: [245, 290],
    minSaturation: 0.2,
    maxSaturation: 0.75,
    minBrightness: 0.4,
  },
  200: {
    denomination: 200,
    name: "200 rupees",
    colorName: "Bright Yellow-Orange",
    motif: "Sanchi Stupa",
    hueRange: [38, 58],
    minSaturation: 0.5,
    maxSaturation: 1.0,
    minBrightness: 0.55,
  },
  500: {
    denomination: 500,
    name: "500 rupees",
    colorName: "Stone Grey",
    motif: "Red Fort",
    hueRange: [0, 360],
    minSaturation: 0.0,
    maxSaturation: 0.22, // Stone Grey has very low saturation
    minBrightness: 0.35,
  },
};

export interface INRRecognitionResult {
  identified: boolean;
  currency: "INR";
  denomination?: number | undefined;
  spokenText: string;
  status: "confident" | "uncertain" | "multiple_notes" | "no_currency_found";
  confidence: "high" | "medium" | "low";
  multipleNotesDetected: boolean;
  colorDetected?: string | undefined;
  motif?: string | undefined;
  source: "inr-color-extractor" | "text-numeral" | "multimodal-ai";
  guidanceNote?: string | undefined;
}

/**
 * Convert RGB (0-255) to HSV (h: 0-360, s: 0-1, v: 0-1).
 */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const normR = r / 255;
  const normG = g / 255;
  const normB = b / 255;
  const max = Math.max(normR, normG, normB);
  const min = Math.min(normR, normG, normB);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === normR) {
      h = ((normG - normB) / diff) % 6;
    } else if (max === normG) {
      h = (normB - normR) / diff + 2;
    } else {
      h = (normR - normG) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return { h, s, v };
}

/**
 * Extract dominant color statistics from an image canvas or pixel buffer.
 */
export function matchINRProfileByColor(h: number, s: number, v: number): {
  profile?: INRBanknoteProfile | undefined;
  score: number;
} {
  // If saturation is extremely low and brightness is moderate, matches ₹500 Stone Grey
  if (s <= 0.22 && v >= 0.3 && v <= 0.85) {
    return { profile: INR_PROFILES[500], score: 0.85 };
  }

  let bestMatch: INRBanknoteProfile | undefined;
  let highestScore = 0;

  for (const denom of [10, 20, 50, 100, 200]) {
    const profile = INR_PROFILES[denom];
    if (!profile) continue;

    const [hMin, hMax] = profile.hueRange;
    const inHue = h >= hMin && h <= hMax;
    const inSat = s >= profile.minSaturation && s <= profile.maxSaturation;
    const inVal = v >= profile.minBrightness;

    if (inHue && inSat && inVal) {
      // Calculate score based on center distance
      const hCenter = (hMin + hMax) / 2;
      const hDist = Math.abs(h - hCenter) / ((hMax - hMin) / 2);
      const score = Math.max(0.6, 1 - hDist * 0.3);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = profile;
      }
    }
  }

  return { profile: bestMatch, score: highestScore };
}

/**
 * Scan raw OCR text strings for Indian Rupee numeral tokens and markers.
 */
export function matchINRFromText(text: string): {
  denomination?: number;
  confidence: "high" | "medium" | "low";
} {
  const upper = text.toUpperCase();

  const inrIndicators = [
    "RESERVE BANK",
    "BHARATIYA",
    "RUPEE",
    "RUPEES",
    "CENTRAL GOVERNMENT",
    "PROMISE TO PAY",
    "GANDHI",
  ];
  const hasInrMarker = inrIndicators.some((marker) => upper.includes(marker));

  // Check denominations in descending order to avoid partial prefix confusion (e.g. 50 vs 500)
  const denoms = [500, 200, 100, 50, 20, 10];
  for (const d of denoms) {
    // Regex looking for whole word number or surrounded by symbols
    const numRegex = new RegExp(`(?:^|[^0-9])(?:₹|RS\\.?\\s*)?${d}(?:[^0-9]|$)`, "i");
    if (numRegex.test(upper)) {
      return {
        denomination: d,
        confidence: hasInrMarker ? "high" : "medium",
      };
    }
  }

  // Check for Devnagari numerals
  if (/५००/.test(text)) return { denomination: 500, confidence: "high" };
  if (/२००/.test(text)) return { denomination: 200, confidence: "high" };
  if (/१००/.test(text)) return { denomination: 100, confidence: "high" };
  if (/५०/.test(text)) return { denomination: 50, confidence: "high" };
  if (/२०/.test(text)) return { denomination: 20, confidence: "high" };
  if (/१०/.test(text)) return { denomination: 10, confidence: "high" };

  return { confidence: "low" };
}

/**
 * High-level Indian Rupee banknote evaluation.
 */
export function evaluateINRBanknote(options: {
  text?: string | undefined;
  colorHsv?: { h: number; s: number; v: number } | undefined;
  multipleNotes?: boolean | undefined;
  blurry?: boolean | undefined;
}): INRRecognitionResult {
  if (options.multipleNotes) {
    return {
      identified: false,
      currency: "INR",
      status: "multiple_notes",
      spokenText:
        "Multiple banknotes appear in view. Please scan one Indian Rupee note at a time for accurate identification.",
      confidence: "high",
      multipleNotesDetected: true,
      guidanceNote: "Please scan one note at a time for accurate identification.",
      source: "inr-color-extractor",
    };
  }

  if (options.blurry) {
    return {
      identified: false,
      currency: "INR",
      status: "uncertain",
      spokenText:
        "I can't identify the banknote denomination confidently. Please hold one note flat with good lighting.",
      confidence: "low",
      multipleNotesDetected: false,
      guidanceNote: "Hold the note flat and steady in the center of the camera view.",
      source: "inr-color-extractor",
    };
  }

  // 1. First priority: text / numeral match
  if (options.text) {
    const textMatch = matchINRFromText(options.text);
    if (textMatch.denomination) {
      const profile = INR_PROFILES[textMatch.denomination];
      return {
        identified: true,
        currency: "INR",
        denomination: textMatch.denomination,
        spokenText: `This appears to be a ${textMatch.denomination}-rupee banknote.`,
        status: "confident",
        confidence: textMatch.confidence,
        multipleNotesDetected: false,
        colorDetected: profile?.colorName,
        motif: profile?.motif,
        source: "text-numeral",
      };
    }
  }

  // 2. Second priority: Color histogram analysis
  if (options.colorHsv) {
    const colorMatch = matchINRProfileByColor(
      options.colorHsv.h,
      options.colorHsv.s,
      options.colorHsv.v
    );
    if (colorMatch.profile && colorMatch.score >= 0.7) {
      return {
        identified: true,
        currency: "INR",
        denomination: colorMatch.profile.denomination,
        spokenText: `This appears to be a ${colorMatch.profile.denomination}-rupee banknote.`,
        status: "confident",
        confidence: "medium",
        multipleNotesDetected: false,
        colorDetected: colorMatch.profile.colorName,
        motif: colorMatch.profile.motif,
        source: "inr-color-extractor",
      };
    }
  }

  return {
    identified: false,
    currency: "INR",
    status: "no_currency_found",
    spokenText:
      "I couldn't identify any Indian banknote in this view. Please hold a banknote flat in front of the camera with good lighting.",
    confidence: "high",
    multipleNotesDetected: false,
    source: "inr-color-extractor",
  };
}
