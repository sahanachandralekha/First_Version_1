/**
 * Google Gemini Vision Service
 *
 * Secure server-side integration for multimodal visual understanding, two-way
 * conversational assistant with memory and reference resolution, document OCR,
 * and currency recognition.
 *
 * Credentials are read exclusively from process.env.GEMINI_API_KEY or
 * process.env.GOOGLE_API_KEY and are NEVER exposed to client bundles.
 */

import {
  VISION_SYSTEM_PROMPT,
  OBSERVATION_USER_PROMPT,
  NAVIGATION_USER_PROMPT,
} from "./vision-prompts";
import type { VisionAnalysisResult } from "./vision-models";

export interface GeminiMessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiContentItem {
  role: "user" | "model";
  parts: GeminiMessagePart[];
}

export interface GeminiResponse {
  text: string;
  model: string;
  finishReason?: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function getGeminiApiKey(): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || process.env["VITE_GEMINI_API_KEY"];
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

/** Extracts JSON from raw text, handling markdown fences and surrounding commentary. */
export function cleanJsonResponse(rawText: string): string {
  const text = rawText.trim();
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    return objMatch[0].trim();
  }
  return text;
}

/**
 * Execute a multimodal generateContent request against Google Gemini REST API.
 */
export async function callGeminiApi(options: {
  contents: GeminiContentItem[];
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}): Promise<GeminiResponse> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Google Gemini API is not configured. Set GEMINI_API_KEY in .env.");
  }

  const model = options.model || DEFAULT_GEMINI_MODEL;
  const endpoint = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.maxOutputTokens ?? 1024,
  };

  if (options.responseMimeType) {
    generationConfig["responseMimeType"] = options.responseMimeType;
    generationConfig["response_mime_type"] = options.responseMimeType;
  }

  const body: Record<string, unknown> = {
    contents: options.contents,
    generationConfig,
  };

  if (options.systemInstruction) {
    body["systemInstruction"] = {
      role: "user",
      parts: [{ text: options.systemInstruction }],
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMessage = errorBody;
    try {
      const errJson = JSON.parse(errorBody);
      parsedMessage = errJson?.error?.message || errorBody;
    } catch {
      // Keep raw body
    }
    throw new Error(`Gemini API error (${response.status}): ${parsedMessage}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const candidateParts = candidate?.content?.parts || [];
  const text = candidateParts
    .map((p: { text?: string }) => p.text || "")
    .join("")
    .trim();

  return {
    text,
    model,
    finishReason: candidate?.finishReason,
    usage: data.usageMetadata,
  };
}

/**
 * Clean and format image base64 data for Gemini inlineData payload.
 */
function normalizeBase64Image(imageBase64: string): { mimeType: string; data: string } {
  let mimeType = "image/jpeg";
  let data = imageBase64;

  if (imageBase64.startsWith("data:")) {
    const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      mimeType = match[1];
      data = match[2];
    }
  }

  return { mimeType, data };
}

/**
 * Comprehensive visual analysis powered by Inai-1 structured schema and vision system prompt.
 */
export async function analyzeVisionFrameWithGemini(
  imageBase64: string,
  mode: "observation" | "navigation" = "observation",
  additionalContext?: string
): Promise<VisionAnalysisResult> {
  const imagePart = normalizeBase64Image(imageBase64);
  const userPrompt = mode === "observation" ? OBSERVATION_USER_PROMPT : NAVIGATION_USER_PROMPT;
  const promptText = additionalContext ? `${userPrompt} Note: ${additionalContext}` : userPrompt;

  const response = await callGeminiApi({
    systemInstruction: VISION_SYSTEM_PROMPT,
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } },
        ],
      },
    ],
    temperature: 0.2,
    responseMimeType: "application/json",
  });

  try {
    const cleaned = cleanJsonResponse(response.text);
    const parsed = JSON.parse(cleaned) as VisionAnalysisResult;
    return {
      pathStatus: parsed.pathStatus || "UNKNOWN",
      pathDescription: parsed.pathDescription || "Evaluating forward path.",
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
      hazards: Array.isArray(parsed.hazards) ? parsed.hazards : [],
      recommendedAction: parsed.recommendedAction || "CONTINUE",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
      singleObservationDescription:
        parsed.singleObservationDescription ||
        parsed.pathDescription ||
        "The forward camera view has been analyzed.",
    };
  } catch (err) {
    console.warn("Could not parse JSON from Gemini vision result:", response.text, err);
    return {
      pathStatus: "UNKNOWN",
      pathDescription: "I cannot clearly determine the path ahead.",
      objects: [],
      hazards: [],
      recommendedAction: "CAUTION",
      confidence: 0.5,
      singleObservationDescription:
        response.text && !response.text.includes("{")
          ? response.text
          : "I cannot clearly determine what is in front of you right now. Please adjust the camera angle and lighting.",
    };
  }
}

/**
 * Visual Scene Understanding via Gemini Vision (Inai-1 model logic).
 */
export async function describeSceneWithGemini(
  imageBase64: string,
  detectionsSummary?: string
): Promise<string> {
  const result = await analyzeVisionFrameWithGemini(imageBase64, "observation", detectionsSummary);
  return (
    result.singleObservationDescription ||
    result.pathDescription ||
    "In front of you, the view appears open. Let me know if you would like me to check for specific items."
  );
}

/**
 * Two-Way Conversational Vision Assistant with Multi-Turn Context and Reference Resolution (Inai-1 logic).
 */
export async function converseWithGeminiVision(options: {
  query: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }> | undefined;
  imageBase64?: string | undefined;
  detectionsSummary?: string | undefined;
}): Promise<string> {
  const systemInstruction = `You are INAI, an intelligent accessibility vision assistant helping a visually impaired person understand and safely navigate their immediate forward surroundings.

CRITICAL INSTRUCTIONS & CONVERSATIONAL RULES:
1. Prioritize information relevant to immediate awareness, safe movement, spatial orientation, and the user's specific question.
2. DO NOT merely list detected objects (e.g. NEVER say "Person. Chair. Table. Wall.").
3. Prioritize walking path analysis, obstacles, hazards, people, vehicles, bicycles, animals, stairs, steps, drops, curbs, holes, potholes, open drains, uneven surfaces, doors, signs, and important text.
4. Spatial understanding: accurately categorize objects as "center", "left", or "right", and approximate qualitative proximity ("very close", "near", "medium", "far").
5. Safety language rules:
   - NEVER say "The path is completely safe."
   - Always use cautious phrasing such as "The path ahead appears clear." or "The path seems open."
   - If uncertain or if the image is blurry/obscured, explicitly state uncertainty.
6. Resolve contextual references like "it", "that", "the same object", or "next to it" using the previous conversation history and the camera frame.
7. Explain what is visible thoroughly, naturally, and warmly in 2 to 3 fluid sentences designed to be spoken aloud.`;

  const contents: GeminiContentItem[] = [];

  // Add previous turns if provided
  if (options.conversationHistory && options.conversationHistory.length > 0) {
    const recentHistory = options.conversationHistory.slice(-6);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  // Build the current user turn
  const currentParts: GeminiMessagePart[] = [];
  let currentPrompt = options.query;
  if (options.detectionsSummary) {
    currentPrompt += ` (Context: detected in frame: ${options.detectionsSummary})`;
  }
  currentParts.push({ text: currentPrompt });

  if (options.imageBase64) {
    const imagePart = normalizeBase64Image(options.imageBase64);
    currentParts.push({
      inlineData: { mimeType: imagePart.mimeType, data: imagePart.data },
    });
  }

  contents.push({
    role: "user",
    parts: currentParts,
  });

  const response = await callGeminiApi({
    systemInstruction,
    contents,
    temperature: 0.25,
  });

  return response.text;
}

/**
 * High-precision Document & Sign OCR via Gemini Vision.
 */
export async function extractTextWithGemini(imageBase64: string): Promise<{
  hasText: boolean;
  rawText: string;
  lines: string[];
  readingOrderText: string;
  wordCount: number;
  unclearNote?: string | undefined;
}> {
  const systemInstruction = `You are a high-precision OCR text extractor for visually impaired users.
Transcribe all readable printed or handwritten text visible in this camera image.

STRICT ACCURACY RULES:
1. Extract text in natural reading order (top-to-bottom, left-to-right).
2. Preserve line breaks between headings, signs, menus, and document paragraphs.
3. NEVER invent or hallucinate missing words.
4. If a word is blurry, cut off, or illegible, write [unclear] or [blurry] instead of guessing.
5. If NO readable text is found, reply ONLY with: NO_TEXT_FOUND
6. Return ONLY the transcribed text without conversational commentary.`;

  const imagePart = normalizeBase64Image(imageBase64);
  const response = await callGeminiApi({
    systemInstruction,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Read all visible text in this camera frame. Preserve lines and reading order." },
          { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } },
        ],
      },
    ],
    temperature: 0.1,
  });

  const raw = response.text.trim();
  if (!raw || raw.includes("NO_TEXT_FOUND")) {
    return {
      hasText: false,
      rawText: "",
      lines: [],
      readingOrderText: "",
      wordCount: 0,
      unclearNote: "No readable text was found in this camera view.",
    };
  }

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const words = raw.split(/\s+/).filter(Boolean);
  const hasUncertainty = /(?:\[unclear\]|\[blurry\]|\[illegible\])/i.test(raw);

  return {
    hasText: true,
    rawText: raw,
    lines,
    readingOrderText: lines.join(". "),
    wordCount: words.length,
    unclearNote: hasUncertainty
      ? "Some words appear blurry or obscured and could not be verified with certainty."
      : undefined,
  };
}

/**
 * Banknote Verification via Gemini Vision.
 */
export async function identifyBanknoteWithGemini(
  imageBase64: string,
  preferredCurrency = "INR"
): Promise<{
  identified: boolean;
  currency?: string;
  denomination?: number | string;
  multipleNotes?: boolean;
  confident: boolean;
  explanation: string;
}> {
  const systemInstruction = `You are an assistive currency recognition model for visually impaired users.
Identify any banknote visible in this camera frame.

CRITICAL ASSISTIVE RULES:
1. Target Currency: ${preferredCurrency}. Pay special attention to Indian Rupee (INR ₹10, ₹20, ₹50, ₹100, ₹200, ₹500) and other major currencies.
2. If MULTIPLE banknotes appear in view, set "multipleNotes": true and "confident": false.
3. If the note is folded, cut off, blurry, or denomination cannot be verified, set "confident": false.
4. NEVER claim the banknote is genuine, counterfeit, or legal tender.
5. Return JSON ONLY with this exact format:
{
  "identified": boolean,
  "currency": "INR" | "USD" | "EUR" | "GBP" | null,
  "denomination": number | string | null,
  "multipleNotes": boolean,
  "confident": boolean,
  "explanation": "concise description of what is visible"
}`;

  const imagePart = normalizeBase64Image(imageBase64);
  const response = await callGeminiApi({
    systemInstruction,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Identify the banknote in this camera frame. Check denomination and currency." },
          { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } },
        ],
      },
    ],
    temperature: 0.1,
  });

  try {
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(cleanJson);
    return {
      identified: Boolean(parsed.identified && parsed.confident && parsed.denomination),
      currency: parsed.currency || undefined,
      denomination: parsed.denomination || undefined,
      multipleNotes: Boolean(parsed.multipleNotes),
      confident: Boolean(parsed.confident),
      explanation: parsed.explanation || "Banknote evaluated via Gemini Vision.",
    };
  } catch {
    return {
      identified: false,
      confident: false,
      explanation: "Unable to parse banknote identification response.",
    };
  }
}
