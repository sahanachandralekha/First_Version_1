import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  isGeminiConfigured,
  describeSceneWithGemini,
  analyzeVisionFrameWithGemini,
  converseWithGeminiVision,
  extractTextWithGemini,
  identifyBanknoteWithGemini,
  callGeminiApi,
} from "./gemini.service.ts";
import { narrationService } from "./narration.service.ts";
import type { VisionAnalysisResult } from "./vision-models.ts";
import { evaluateINRBanknote } from "../../services/currency.ts";

const MODEL = "openai/gpt-6-astra";

const detectionSchema = z.object({
  label: z.string(),
  approxDistance: z.number().optional(),
  confidence: z.number().optional(),
});
const profileSchema = z.object({ visual: z.boolean(), hearing: z.boolean(), speech: z.boolean() });

/**
 * Reasoning models run long, so the gateway call always streams and the text is
 * accumulated server-side — these features only need the finished sentence.
 */
async function callGateway(system: string, user: string, imageBase64?: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey && isGeminiConfigured()) {
    // Forward to Gemini Vision API
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: user }];
    if (imageBase64) {
      let mimeType = "image/jpeg";
      let data = imageBase64;
      if (imageBase64.startsWith("data:")) {
        const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          mimeType = match[1];
          data = match[2];
        }
      }
      parts.push({ inlineData: { mimeType, data } });
    }
    const res = await callGeminiApi({
      systemInstruction: system,
      contents: [{ role: "user", parts }],
    });
    return res.text;
  }

  const apiKey = lovableKey;
  if (!apiKey) throw new Error("AI is not configured. Set GEMINI_API_KEY or LOVABLE_API_KEY in .env.");

  // If imageBase64 is provided, use multimodal completions endpoint
  if (imageBase64) {
    const formattedUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: user },
                { type: "image_url", image_url: { url: formattedUrl } },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }
    } catch (err) {
      console.warn("Multimodal completions failed, trying standard endpoint:", err);
    }
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: system,
      input: user,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
    }),
  });
  if (response.status === 429) throw new Error("INAI is busy right now. Please try again in a moment.");
  if (response.status === 402) throw new Error("INAI's AI allowance is used up for now.");
  if (!response.ok || !response.body) throw new Error("INAI could not reach its understanding service.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        if (event.type === "response.completed" && !text && event.response?.output_text) text = event.response.output_text;
      } catch { /* partial frame */ }
    }
  }
  return text.trim();
}

function parseJson<T>(raw: string, fallback: T): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try { return JSON.parse(match[0]) as T; } catch { return fallback; }
}

/** 'understand-scene' — turns detections into short, safe guidance. */
export const understandScene = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      detections: z.array(detectionSchema),
      profile: profileSchema,
      lastGuidance: z.string().default(""),
      question: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const fallback = { summary: "", priority: "info", guidance: "", hazards: [] as string[] };
    const listed = data.detections.map((d) => `${d.label}${d.approxDistance ? ` ~${Math.round(d.approxDistance)} m` : ""}`).join(", ") || "nothing recognised";
    const raw = await callGateway(
      "You help a person with visual, hearing or speech accessibility needs understand a scene. Always describe distances as approximate. Never invent objects that are not listed. Reply ONLY with JSON: {\"summary\":string,\"priority\":\"info\"|\"notice\"|\"warn\"|\"critical\",\"guidance\":string,\"hazards\":string[]}. Keep summary and guidance under 25 words each, warm and plain.",
      `Detections: ${listed}\nProfile: visual=${data.profile.visual}, hearing=${data.profile.hearing}, speech=${data.profile.speech}\nPrevious guidance: ${data.lastGuidance || "none"}${data.question ? `\nThe person asked: ${data.question}` : ""}`,
    );
    return parseJson(raw, fallback);
  });

/** 'analyze-visual-frame' — examines a camera frame snapshot with strict visual ground-truth (Inai-1 logic). */
export const analyzeVisualFrame = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      imageBase64: z.string().optional(),
      detections: z.array(z.object({
        label: z.string(),
        approxDistance: z.number().optional(),
        confidence: z.number().optional(),
        position: z.enum(["left", "center", "right"]).optional(),
      })).default([]),
      prompt: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // 1. Google Gemini Vision Analysis with Inai-1 Model Output & Schema
    if (isGeminiConfigured() && data.imageBase64) {
      try {
        const detectedContext = data.detections.length > 0
          ? `Detected local objects: ${data.detections.map((d) => `${d.label} (${d.position ?? "ahead"}, approx ${Math.round(d.approxDistance ?? 1)} m)`).join(", ")}.`
          : undefined;
        const result: VisionAnalysisResult = await analyzeVisionFrameWithGemini(
          data.imageBase64,
          "observation",
          detectedContext
        );

        const description =
          result.singleObservationDescription ||
          result.pathDescription ||
          narrationService.generateDisplayText(result);

        if (description && description.trim().length > 0) {
          return {
            description: description.trim(),
            source: "ai" as const,
            identifiedCount: result.objects.length || data.detections.length,
            pathStatus: result.pathStatus,
            recommendedAction: result.recommendedAction,
            objects: result.objects,
            hazards: result.hazards,
            confidence: result.confidence,
          };
        }
      } catch (err) {
        console.warn("Gemini scene analysis failed, trying gateway fallback:", err);
      }
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      try {
        const detectedContext = data.detections.length > 0
          ? `Detected objects in view: ${data.detections.map((d) => `${d.label} (${d.position ?? "ahead"}, approx ${Math.round(d.approxDistance ?? 1)} m)`).join(", ")}.`
          : "No distinct large objects detected automatically.";

        const system = `You are INAI, an intelligent accessibility vision assistant helping a visually impaired person understand and safely navigate their immediate forward surroundings.
Explain clearly what is in front of the user in 2 to 3 fluid, natural sentences designed to be spoken aloud.
${detectedContext}
CRITICAL SAFETY & TRUTH RULES:
- Never guess, invent, or hallucinate objects or distances that are not supported.
- If the image is dark, blurry, or nothing distinct is recognized, say: "I cannot clearly identify any distinct objects in this view. Try adjusting the camera angle or lighting."
- Prioritize walking path analysis, obstacles, hazards, and relative positions (left, center, right).
- Never claim the path is completely safe. Use cautious phrasing like 'The path ahead appears clear.'`;

        const reply = await callGateway(system, data.prompt || "Describe what is in front of me based on this camera frame.");
        if (reply && reply.trim().length > 0) {
          return {
            description: reply.trim(),
            source: "ai" as const,
            identifiedCount: data.detections.length,
          };
        }
      } catch (err) {
        console.warn("Gateway frame analysis failed, falling back to local grounded detector:", err);
      }
    }

    // Local ground-truth analysis based directly on actual detections in this exact frame using Inai-1 narration logic
    if (data.detections.length === 0) {
      return {
        description: "The forward camera view appears open and free of immediate obstacles. The path ahead appears clear.",
        source: "local-detector" as const,
        identifiedCount: 0,
      };
    }

    const description = narrationService.generateFallbackObservationDescription(data.detections, "CLEAR");

    return {
      description,
      source: "local-detector" as const,
      identifiedCount: data.detections.length,
    };
  });

const SYNONYMS: Record<string, string[]> = {
  phone: ["phone", "cell phone", "mobile", "smartphone", "telephone"],
  chair: ["chair", "seat", "bench", "couch", "sofa", "stool"],
  table: ["table", "dining table", "desk", "counter"],
  bottle: ["bottle", "water bottle", "flask", "thermos"],
  cup: ["cup", "mug", "glass", "tumbler"],
  bag: ["bag", "backpack", "handbag", "suitcase", "purse"],
  laptop: ["laptop", "computer", "notebook", "screen", "tv"],
  door: ["door", "doorway", "entrance", "exit"],
  person: ["person", "someone", "human", "friend"],
};

export function extractTargetObject(query: string): string {
  const clean = query.trim().toLowerCase();
  const patterns = [
    /(?:where\s+(?:is|are)\s+(?:the|my|a|an)?\s*)([^.?!,;]+)/i,
    /(?:can\s+you\s+(?:see|find|spot|locate)\s+(?:the|my|a|an)?\s*)([^.?!,;]+)/i,
    /(?:find\s+(?:the|my|a|an)?\s*)([^.?!,;]+)/i,
    /(?:is\s+there\s+(?:the|my|a|an)?\s*)([^.?!,;]+?)(?:\s+(?:in\s+front|around|near|here|ahead)|\?|$)/i,
    /(?:look\s+for\s+(?:the|my|a|an)?\s*)([^.?!,;]+)/i,
    /(?:do\s+you\s+see\s+(?:the|my|a|an)?\s*)([^.?!,;]+)/i,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m && m[1]) {
      return m[1].replace(/\b(please|for me|right now|in front of me|ahead|around|in this view)\b/gi, "").trim();
    }
  }
  return clean.replace(/[?.,!]/g, "").replace(/\b(please|find|locate|search for)\b/gi, "").trim();
}

/** 'find-object-in-scene' — searches for user-requested object using visual evidence. */
export const findObjectInScene = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      query: z.string().min(1),
      imageBase64: z.string().optional(),
      detections: z.array(z.object({
        label: z.string(),
        rawClass: z.string().optional(),
        approxDistance: z.number().optional(),
        confidence: z.number().optional(),
        position: z.enum(["left", "center", "right"]).optional(),
      })).default([]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const query = data.query.trim();
    const target = extractTargetObject(query);
    if (!target) {
      return {
        target: "",
        found: false,
        spoken: "I heard your request, but I couldn't tell which object you want to find. Please say something like 'Where is my bottle?' or 'Can you see a chair?'",
        source: "local-detector" as const,
      };
    }

    const targetLower = target.toLowerCase();

    // 1. Check local on-device detections first
    const matched = data.detections.find((d) => {
      const labelLower = d.label.toLowerCase();
      const rawLower = (d.rawClass || "").toLowerCase();
      if (labelLower.includes(targetLower) || targetLower.includes(labelLower)) return true;
      if (rawLower && (rawLower.includes(targetLower) || targetLower.includes(rawLower))) return true;

      // Check synonyms
      for (const [key, syns] of Object.entries(SYNONYMS)) {
        if (targetLower.includes(key) || syns.some((s) => targetLower.includes(s))) {
          if (labelLower.includes(key) || syns.some((s) => labelLower.includes(s)) || rawLower.includes(key)) {
            return true;
          }
        }
      }
      return false;
    });

    if (matched) {
      const pos = matched.position || "center";
      const posText =
        pos === "left"
          ? "near the left side of the view"
          : pos === "right"
          ? "near the right side of the view"
          : "directly in front of you";

      const distText = matched.approxDistance
        ? `, about ${Math.round(matched.approxDistance)} metre${Math.round(matched.approxDistance) === 1 ? "" : "s"} away`
        : "";

      const spoken = `I can see what looks like a ${matched.label.toLowerCase()} ${posText}${distText}.`;

      return {
        target,
        found: true,
        matchedLabel: matched.label,
        spoken,
        source: "local-detector" as const,
      };
    }

    // 2. If not found locally, and cloud AI is configured, check VLM
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      try {
        const prompt = `You are INAI, helping a visually impaired user find an object.
User asked: "${query}". Target: "${target}".
Existing detected objects: ${data.detections.map((d) => `${d.label} (${d.position ?? "center"})`).join(", ") || "none"}.
STRICT RULES:
- If you can clearly confirm the object, describe its approximate position (e.g. "I can see what looks like a ${target} near the left side of the view").
- If the object is NOT clearly identifiable, say: "I can't clearly identify the ${target} in this view. Try slowly turning the camera."
- Output ONLY 1 short, natural sentence for text-to-speech. Never invent positions or safe paths.`;

        const reply = await callGateway(prompt, query);
        if (reply && reply.trim().length > 0) {
          return {
            target,
            found: !reply.toLowerCase().includes("can't clearly identify") && !reply.toLowerCase().includes("cannot identify"),
            spoken: reply.trim(),
            source: "ai" as const,
          };
        }
      } catch (err) {
        console.warn("Gateway object search failed, using cautious local response:", err);
      }
    }

    // 3. Grounded, honest response when object is not in visual evidence
    return {
      target,
      found: false,
      spoken: `I can't clearly identify ${target} in this view. Try slowly turning the camera to scan around.`,
      source: "local-detector" as const,
    };
  });

/** Resolves natural, multi-turn two-way voice communication grounded in live camera evidence. */
export async function resolveVisionConversation(data: {
  query: string;
  imageBase64?: string | undefined;
  detections: Array<{
    label: string;
    rawClass?: string | undefined;
    approxDistance?: number | undefined;
    confidence?: number | undefined;
    position?: "left" | "center" | "right" | undefined;
  }>;
  lastTarget?: string | undefined;
  history?: Array<{ role: "user" | "assistant"; content: string }> | undefined;
  cameraActive?: boolean | undefined;
}) {
  const cleanQuery = data.query.trim().replace(/[.,?!]+$/, "");
  const history = data.history ?? [];
  const cameraActive = data.cameraActive ?? true;

  // 1. Camera inactive guard
  if (!cameraActive) {
    return {
      reply: "The camera is paused. Please tap Start Camera so I can see what is in front of you.",
      targetObject: data.lastTarget,
      source: "system" as const,
    };
  }

  // 2. Interruption / Stop command
  if (/^(?:stop|be quiet|shut up|hush|silence|stop talking|stop listening|pause|stop announcements)$/i.test(cleanQuery)) {
    return {
      reply: "I have stopped announcements. I'm listening whenever you are ready.",
      targetObject: data.lastTarget,
      source: "system" as const,
      action: "stop" as const,
    };
  }

  // 2b. Stop reading command ("Stop reading", "Stop reading text")
  if (/\b(?:stop reading|stop reading text|cancel reading)\b/i.test(cleanQuery)) {
    return {
      reply: "I have stopped reading.",
      targetObject: data.lastTarget,
      source: "system" as const,
      action: "stop_reading" as const,
    };
  }

  // 2c. Read aloud command ("Read the text aloud", "Read aloud", "Read it aloud")
  if (/\b(?:read (?:the )?text aloud|read aloud|read it aloud)\b/i.test(cleanQuery)) {
    return {
      reply: "Reading the recognized text aloud.",
      targetObject: "text",
      source: "system" as const,
      action: "read_aloud" as const,
    };
  }

  // 2d. Read this / Read the sign / Read the text ("Read this", "Read the sign", "Read the menu", "Read the label")
  if (/\b(?:read (?:this|the sign|the text|the label|the menu|the document|what is written)|can you read this|read this sign)\b/i.test(cleanQuery)) {
    return {
      reply: "Checking the camera view for readable text…",
      targetObject: "text",
      source: "system" as const,
      action: "read_text" as const,
    };
  }

  // 2e. Ambiguous read request ("Read", "Can you read?")
  if (/^(?:read|can you read)$/i.test(cleanQuery)) {
    return {
      reply: "Would you like me to read the visible text, sign, or document in front of you? Say 'Read this' or tap Capture and Read Text.",
      targetObject: "text",
      source: "system" as const,
      action: "clarify_read" as const,
    };
  }

  // 2f. Read currency result ("Read the currency result", "Read currency result", "Read money result")
  if (/\b(?:read (?:the )?currency(?: result)?|read (?:the )?money(?: result)?)\b/i.test(cleanQuery)) {
    return {
      reply: "Reading the currency recognition result.",
      targetObject: "currency",
      source: "system" as const,
      action: "read_currency" as const,
    };
  }

  // 2g. Identify currency / Banknote ("Identify this money", "What currency is this?", "What denomination is this?", "Scan this banknote")
  if (
    /\b(?:identify (?:this |the )?money|what currency is this|what denomination is this|identify (?:this |the )?banknote|identify (?:this |the )?cash|what note is this|how much is this note|check this money)\b/i.test(
      cleanQuery
    )
  ) {
    return {
      reply: "Checking the camera view for visible banknotes…",
      targetObject: "currency",
      source: "system" as const,
      action: "identify_currency" as const,
    };
  }

  // 2h. Ambiguous money request ("Money", "Currency", "Banknote", "Cash")
  if (/^(?:money|currency|banknote|cash)$/i.test(cleanQuery)) {
    return {
      reply: "Would you like me to identify a banknote in front of your camera? Say 'Identify this money' or tap Identify Banknote.",
      targetObject: "currency",
      source: "system" as const,
      action: "clarify_currency" as const,
    };
  }

  // 2i. Announce the selected person ("Announce the selected person", "Announce familiar person", "Who is selected?")
  if (/\b(?:announce (?:the )?selected person|announce familiar person|who is selected|read selected person)\b/i.test(cleanQuery)) {
    return {
      reply: "Announcing the selected familiar person.",
      targetObject: "person",
      source: "system" as const,
      action: "announce_familiar_person" as const,
    };
  }

  // 2j. Clear the selected person ("Clear the selected person", "Clear familiar person", "Deselect person")
  if (/\b(?:clear (?:the )?selected person|clear familiar person|deselect person|remove selected person)\b/i.test(cleanQuery)) {
    return {
      reply: "Cleared selected familiar person.",
      targetObject: "person",
      source: "system" as const,
      action: "clear_familiar_person" as const,
    };
  }

  // 2k. Select my familiar person ("Select my familiar person", "Select familiar person", "Choose familiar person")
  if (/\b(?:select (?:my )?familiar person|choose familiar person|pick familiar person)\b/i.test(cleanQuery)) {
    return {
      reply: "Please choose a consenting familiar person from your saved list, or say their name.",
      targetObject: "person",
      source: "system" as const,
      action: "select_familiar_person" as const,
    };
  }

  // 2l. Ambiguous familiar person request ("Who is this person?", "Recognize this person", "Who is in front of me?", "Familiar person")
  if (
    /\b(?:who is this(?: person)?|who is in front of me|identify this person|recognize this person|familiar person|who is that)\b/i.test(
      cleanQuery
    )
  ) {
    return {
      reply: "For privacy and consent, INAI does not use facial recognition on camera footage. You can manually select and announce a consenting person from your familiar person list. Would you like to select a familiar person?",
      targetObject: "person",
      source: "system" as const,
      action: "clarify_familiar_person" as const,
    };
  }

  // 3. Repetition / "What did you say?"
  if (/\b(?:what did you (?:just )?say|repeat (?:that|please)|say (?:that|it) again|pardon|what was that)\b/i.test(cleanQuery)) {
    const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
    if (lastAssistant && lastAssistant.content) {
      return {
        reply: `I said: ${lastAssistant.content}`,
        targetObject: data.lastTarget,
        source: "system" as const,
        action: "repeat" as const,
      };
    }
    return {
      reply: "I haven't said anything yet in this session. What would you like to explore?",
      targetObject: data.lastTarget,
      source: "system" as const,
    };
  }

  // 4. General Scene Overview inquiry
  const isGeneralScene = /\b(?:what is in front of me|what do you see|describe the scene|what is around|look around|tell me what you see|what's in front of me|what do you notice)\b/i.test(cleanQuery);
  if (isGeneralScene) {
    if (isGeminiConfigured() && data.imageBase64) {
      try {
        const detectedContext = data.detections.length > 0
          ? `Detected local objects: ${data.detections.map((d) => `${d.label} (${d.position ?? "center"})`).join(", ")}.`
          : undefined;
        const result = await analyzeVisionFrameWithGemini(data.imageBase64, "observation", detectedContext);
        const replyText =
          result.singleObservationDescription ||
          result.pathDescription ||
          narrationService.generateDisplayText(result);

        if (replyText && replyText.trim()) {
          return {
            reply: replyText.trim(),
            targetObject: undefined,
            source: "ai" as const,
          };
        }
      } catch (err) {
        console.warn("Gemini vision analysis for general scene inquiry failed:", err);
      }
    }

    if (data.detections.length === 0) {
      return {
        reply: "The forward camera view appears open and clear. I don't see any immediate blocking obstacles in front of you.",
        targetObject: undefined,
        source: "local-detector" as const,
      };
    }

    const fallbackDescription = narrationService.generateFallbackObservationDescription(data.detections, "CLEAR");
    return {
      reply: fallbackDescription,
      targetObject: undefined,
      source: "local-detector" as const,
    };
  }

  // 5. Follow-up pronoun & target extraction
  const isFollowUp = /\b(?:it|that|this|the object|beside it|next to it|another one|more about it)\b/i.test(cleanQuery);
  let target = extractTargetObject(cleanQuery);
  if (target && /^(?:it|that|this|the object|an object|something)$/i.test(target)) {
    target = "";
  }

  // If no target extracted or query is purely a follow-up referring to "it", resolve to lastTarget
  if ((!target || isFollowUp) && data.lastTarget) {
    target = data.lastTarget;
  }

  // If ambiguous reference with no previous target
  if (!target && isFollowUp) {
    return {
      reply: "Which object are you referring to? You can ask me to find a bottle, phone, chair, or another item.",
      targetObject: undefined,
      source: "system" as const,
      action: "clarify" as const,
    };
  }

  // If still no target detected at all
  if (!target) {
    return {
      reply: "I heard your request, but I'm not sure what you'd like to find. You can ask 'Where is my phone?' or 'What is in front of me?'",
      targetObject: undefined,
      source: "system" as const,
    };
  }

  const targetLower = target.toLowerCase();
  const matches = data.detections.filter((d) => {
    const labelLower = d.label.toLowerCase();
    const rawLower = (d.rawClass || "").toLowerCase();
    if (labelLower.includes(targetLower) || targetLower.includes(labelLower)) return true;
    if (rawLower && (rawLower.includes(targetLower) || targetLower.includes(rawLower))) return true;
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (targetLower.includes(key) || syns.some((s) => targetLower.includes(s))) {
        if (labelLower.includes(key) || syns.some((s) => labelLower.includes(s)) || rawLower.includes(key)) {
          return true;
        }
      }
    }
    return false;
  });
  const matched = matches[0];

  // 6. Check specific conversational intents on the target

  // "Tell me more about it" / "Describe it"
  if (/\b(?:tell me more|more about|describe (?:it|that|this)|what does it look like|more info|details)\b/i.test(cleanQuery)) {
    if (!matched) {
      return {
        reply: `I can no longer clearly see the ${target} in this view. Try slowly turning the camera to scan around.`,
        targetObject: target,
        source: "local-detector" as const,
      };
    }
    const posText = matched.position === "left" ? "near the left side of your view" : matched.position === "right" ? "near the right side of your view" : "directly in front of you";
    const distText = matched.approxDistance ? `, about ${Math.round(matched.approxDistance)} metre${Math.round(matched.approxDistance) === 1 ? "" : "s"} away` : "";
    return {
      reply: `The ${target} is located ${posText}${distText}. It appears clearly in front of the camera.`,
      targetObject: target,
      source: "local-detector" as const,
    };
  }

  // "Can you see another one?" / "Are there more?"
  if (/\b(?:another\s+(?:one|item|object|[a-z]+)|any\s+more|second\s+one|other\s+one|see\s+another|are\s+there\s+more)\b/i.test(cleanQuery)) {
    const second = matches[1];
    if (second) {
      const posText = second.position === "left" ? "near the left side" : second.position === "right" ? "near the right side" : "directly in front of you";
      return {
        reply: `Yes, I can see another ${target} ${posText} of your view.`,
        targetObject: target,
        source: "local-detector" as const,
      };
    }
    if (matches.length === 1) {
      return {
        reply: `I only see one ${target} in this view right now.`,
        targetObject: target,
        source: "local-detector" as const,
      };
    }
    return {
      reply: `I don't see any ${target} in this view right now.`,
      targetObject: target,
      source: "local-detector" as const,
    };
  }

  // "Is there anything beside it?" / "Next to it"
  if (/\b(?:beside|next to|near|around|by)\s*(?:it|that|this)?\b/i.test(cleanQuery)) {
    if (!matched) {
      return {
        reply: `I can't clearly see the ${target} in this view, so I can't tell what is beside it. Try slowly turning the camera.`,
        targetObject: target,
        source: "local-detector" as const,
      };
    }
    const neighbors = data.detections.filter((d) => d !== matched);
    const neighbor = neighbors[0];
    if (neighbor) {
      const pos = neighbor.position === "left" ? "to the left" : neighbor.position === "right" ? "to the right" : "near the center";
      return {
        reply: `Beside the ${target}, I can see what looks like a ${neighbor.label.toLowerCase()} ${pos}.`,
        targetObject: target,
        source: "local-detector" as const,
      };
    }
    return {
      reply: `I don't clearly see any other objects right beside the ${target} in this view.`,
      targetObject: target,
      source: "local-detector" as const,
    };
  }

  // Standard object search / "Where is it?"
  if (matched) {
    const posText = matched.position === "left" ? "near the left side of the view" : matched.position === "right" ? "near the right side of the view" : "directly in front of you";
    const distText = matched.approxDistance ? `, about ${Math.round(matched.approxDistance)} metre${Math.round(matched.approxDistance) === 1 ? "" : "s"} away` : "";
    return {
      reply: `I can see what looks like a ${matched.label.toLowerCase()} ${posText}${distText}.`,
      targetObject: target,
      source: "local-detector" as const,
    };
  }

  // 6.5. Google Gemini Multimodal Vision Assistant with Context Memory & Reference Resolution
  if (isGeminiConfigured()) {
    try {
      const detectedContext = data.detections.map((d) => `${d.label} (${d.position ?? "center"})`).join(", ") || undefined;
      const geminiReply = await converseWithGeminiVision({
        query: cleanQuery,
        conversationHistory: history,
        imageBase64: data.imageBase64,
        detectionsSummary: detectedContext,
      });
      if (geminiReply && geminiReply.trim()) {
        return {
          reply: geminiReply.trim(),
          targetObject: target,
          source: "ai" as const,
        };
      }
    } catch (err) {
      console.warn("Gemini converseInScene failed, trying gateway fallback:", err);
    }
  }

  // 7. Cloud AI Multimodal Fallback if configured
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (apiKey) {
    try {
      const historyLines = history.slice(-4).map((h) => `${h.role === "user" ? "Person" : "INAI"}: ${h.content}`).join("\n");
      const prompt = `You are INAI, an accessibility AI companion conversing with a visually impaired user.
Active detected objects: ${data.detections.map((d) => `${d.label} (${d.position ?? "center"})`).join(", ") || "none"}.
Target object: ${target}.
Conversation so far:
${historyLines}

User just said: "${cleanQuery}"

STRICT HONESTY RULES:
- If the object is not clearly identified in this view, say: "I can't clearly identify the ${target} in this view. Try slowly turning the camera."
- Never invent exact positions, shelf numbers, or distances.
- Reply in 1 to 2 short, calm sentences for text-to-speech.`;

      const reply = await callGateway(prompt, cleanQuery);
      if (reply && reply.trim()) {
        return {
          reply: reply.trim(),
          targetObject: target,
          source: "ai" as const,
        };
      }
    } catch (err) {
      console.warn("Gateway converseInScene failed, using local grounding:", err);
    }
  }

  // 8. Honest uncertainty response
  return {
    reply: `I can't clearly identify ${target} in this view. Try slowly turning the camera to scan around.`,
    targetObject: target,
    source: "local-detector" as const,
  };
}

/** 'converse-in-scene' — handles natural, multi-turn two-way voice communication grounded in live camera evidence. */
export const converseInScene = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      query: z.string().min(1),
      imageBase64: z.string().optional(),
      detections: z.array(z.object({
        label: z.string(),
        rawClass: z.string().optional(),
        approxDistance: z.number().optional(),
        confidence: z.number().optional(),
        position: z.enum(["left", "center", "right"]).optional(),
      })).default([]),
      lastTarget: z.string().optional(),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).max(10).default([]),
      cameraActive: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    return resolveVisionConversation(data);
  });

/** Generates intelligent, descriptive guidance and environment knowledge for obstacle awareness. */
export function generateIntelligentObstacleGuidance(
  allDetections: Array<{
    label: string;
    box: { x: number; y: number; width: number; height: number };
    confidence?: number;
    rawClass?: string;
    approxDistance?: number;
  }>,
  frame: { width: number; height: number },
  primaryDetection?: {
    label: string;
    box: { x: number; y: number; width: number; height: number };
    confidence?: number;
    rawClass?: string;
    approxDistance?: number;
  },
): { text: string; sectorKey: string; hPos: "left" | "center" | "right"; vPos: "upper" | "middle" | "lower"; tone: "warn" | "info" } {
  const width = frame.width || 640;
  const height = frame.height || 480;

  const validDetections = (allDetections || []).filter((d) => (d.rawClass || d.label).toLowerCase() !== "pathway");
  const primary = primaryDetection || validDetections[0] || { label: "obstacle", box: { x: width * 0.35, y: height * 0.5, width: 50, height: 50 } };

  const cx = primary.box.x + primary.box.width / 2;
  const cy = primary.box.y + primary.box.height / 2;

  const hPos: "left" | "center" | "right" = cx < width * 0.35 ? "left" : cx > width * 0.65 ? "right" : "center";
  const vPos: "upper" | "middle" | "lower" = cy < height * 0.35 ? "upper" : cy > height * 0.65 ? "lower" : "middle";

  const rawLabel = primary.label.trim();
  const label = rawLabel.toLowerCase();

  // Categorize all detections across horizontal zones
  const byZone = {
    left: validDetections.filter((d) => (d.box.x + d.box.width / 2) < width * 0.35),
    center: validDetections.filter((d) => {
      const x = d.box.x + d.box.width / 2;
      return x >= width * 0.35 && x <= width * 0.65;
    }),
    right: validDetections.filter((d) => (d.box.x + d.box.width / 2) > width * 0.65),
  };

  const hasLeft = byZone.left.length > 0;
  const hasCenter = byZone.center.length > 0;
  const hasRight = byZone.right.length > 0;

  const centerPeopleCount = byZone.center.filter((d) => (d.rawClass || d.label).toLowerCase() === "person").length;
  const leftPeopleCount = byZone.left.filter((d) => (d.rawClass || d.label).toLowerCase() === "person").length;
  const rightPeopleCount = byZone.right.filter((d) => (d.rawClass || d.label).toLowerCase() === "person").length;

  let text = "";

  // Check for critical hazards first (vehicles/approaching)
  const isVehicle = label.includes("car") || label.includes("vehicle") || label.includes("bus") || label.includes("truck") || label.includes("motorcycle");
  if (isVehicle) {
    text = `Stop. A ${label} is detected directly in front of you. Please pause and stay in place.`;
    return { text, sectorKey: `vehicle-${hPos}`, hPos, vPos, tone: "warn" };
  }

  // Case 1: Multiple People blocking the path in center
  if (centerPeopleCount >= 2) {
    if (!hasRight) {
      text = `${centerPeopleCount === 2 ? "Two people" : `${centerPeopleCount} people`} are directly in front of you and the path is blocked. There is open space on your right, so you can move around to the right side.`;
    } else if (!hasLeft) {
      text = `${centerPeopleCount === 2 ? "Two people" : `${centerPeopleCount} people`} are directly in front of you and the path is blocked. There is open space on your left, so you can move around to the left side.`;
    } else {
      text = `${centerPeopleCount === 2 ? "Two people" : `${centerPeopleCount} people`} are in front of you and the path is blocked. Please pause a moment, ask them to move, or wait until the way clears.`;
    }
    return { text, sectorKey: `people-center-${centerPeopleCount}`, hPos: "center", vPos, tone: "warn" };
  }

  // Case 2: One person in center blocking direct path
  if (centerPeopleCount === 1) {
    if (!hasRight) {
      text = `A person is in front of you and the direct path is blocked. There is space on your right, so you can move on the right side.`;
    } else if (!hasLeft) {
      text = `A person is in front of you and the direct path is blocked. There is space on your left, so you can move on the left side.`;
    } else {
      text = `A person is in front of you and the path is blocked on both sides. Please pause a moment and ask them to excuse you.`;
    }
    return { text, sectorKey: `person-center-blocked`, hPos: "center", vPos, tone: "warn" };
  }

  // Case 3: Other obstacle in center
  if (hasCenter) {
    const centerObstacle = byZone.center[0]?.label.toLowerCase() || label;
    if (!hasRight) {
      text = `A ${centerObstacle} is in front of you. There is clear space on your right, so you can move on the right side.`;
    } else if (!hasLeft) {
      text = `A ${centerObstacle} is in front of you. There is clear space on your left, so you can move on the left side.`;
    } else {
      text = `A ${centerObstacle} is in front of you and obstacles are on both sides. The path is blocked; please stop and proceed carefully.`;
    }
    return { text, sectorKey: `obstacle-center-${centerObstacle}`, hPos: "center", vPos, tone: "warn" };
  }

  // Case 4: Item on LEFT only
  if (hasLeft && !hasRight) {
    const isPerson = leftPeopleCount > 0;
    const name = isPerson ? "person" : byZone.left[0]?.label.toLowerCase() || label;
    text = `The ${name} is detected on your left and there is space on your right, so you can move on the right side.`;
    return { text, sectorKey: `${name}-left-open-right`, hPos: "left", vPos, tone: "info" };
  }

  // Case 5: Item on RIGHT only
  if (hasRight && !hasLeft) {
    const isPerson = rightPeopleCount > 0;
    const name = isPerson ? "person" : byZone.right[0]?.label.toLowerCase() || label;
    text = `The ${name} is detected on your right and there is space on your left, so you can move on the left side.`;
    return { text, sectorKey: `${name}-right-open-left`, hPos: "right", vPos, tone: "info" };
  }

  // Case 6: Items on both LEFT and RIGHT, Center is clear
  if (hasLeft && hasRight && !hasCenter) {
    text = `There are objects on your left and right, but the center path is open. You can walk straight ahead with care.`;
    return { text, sectorKey: `corridor-open-center`, hPos: "center", vPos, tone: "info" };
  }

  // Default fallback with position and guidance
  const side = hPos === "left" ? "left" : hPos === "right" ? "right" : "center";
  const openSide = side === "left" ? "right" : "left";
  text = `A ${label} is detected on your ${side}. There is space on your ${openSide}, so you can move on the ${openSide} side.`;
  return { text, sectorKey: `${label}-${hPos}-${vPos}`, hPos, vPos, tone: "info" };
}

/** Generates cautious image-space descriptions for obstacle awareness. */
export function describeImageSpaceObstacle(
  detection: {
    label: string;
    box: { x: number; y: number; width: number; height: number };
    confidence?: number;
    rawClass?: string;
  },
  frame: { width: number; height: number },
  allDetections?: Array<{
    label: string;
    box: { x: number; y: number; width: number; height: number };
    confidence?: number;
    rawClass?: string;
    approxDistance?: number;
  }>,
): { text: string; sectorKey: string; hPos: "left" | "center" | "right"; vPos: "upper" | "middle" | "lower" } {
  const result = generateIntelligentObstacleGuidance(
    allDetections && allDetections.length > 0 ? allDetections : [detection],
    frame,
    detection,
  );
  return {
    text: result.text,
    sectorKey: result.sectorKey,
    hPos: result.hPos,
    vPos: result.vPos,
  };
}

export interface TextRecognitionResult {
  hasText: boolean;
  rawText: string;
  lines: string[];
  readingOrderText: string;
  wordCount: number;
  confidence: "high" | "medium" | "low" | "uncertain";
  source: "ai" | "local-ocr" | "heuristic";
  message: string;
  unclearNote?: string | undefined;
}

export async function processFrameTextRecognition(data: {
  imageBase64?: string | undefined;
  hints?: string[] | undefined;
  testText?: string | undefined;
}): Promise<TextRecognitionResult> {
  // 1. Direct test text override (for deterministic test suites & offline validation)
  if (data.testText !== undefined) {
    const raw = data.testText.trim();
    if (!raw || raw === "NO_TEXT_FOUND") {
      return {
        hasText: false,
        rawText: "",
        lines: [],
        readingOrderText: "",
        wordCount: 0,
        confidence: "high",
        source: "local-ocr",
        message: "I couldn't find any readable text in this view. Try adjusting the camera angle, bringing it closer, or improving lighting.",
      };
    }
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const words = raw.split(/\s+/).filter(Boolean);
    const hasUncertainty = /(?:\[unclear\]|\[blurry\]|\[illegible\]|\?)/i.test(raw);
    const unclearNote = hasUncertainty
      ? "Some words appear blurry or obscured and could not be verified with certainty."
      : undefined;

    return {
      hasText: true,
      rawText: raw,
      lines,
      readingOrderText: lines.join(". "),
      wordCount: words.length,
      confidence: hasUncertainty ? "uncertain" : "high",
      source: "local-ocr",
      message: `Recognized ${words.length} word${words.length === 1 ? "" : "s"}.`,
      unclearNote,
    };
  }

  // 1.8. Google Gemini Multimodal OCR if configured
  if (isGeminiConfigured() && data.imageBase64) {
    try {
      const geminiOcr = await extractTextWithGemini(data.imageBase64);
      if (geminiOcr.hasText && geminiOcr.lines.length > 0) {
        return {
          hasText: true,
          rawText: geminiOcr.rawText,
          lines: geminiOcr.lines,
          readingOrderText: geminiOcr.readingOrderText,
          wordCount: geminiOcr.wordCount,
          confidence: geminiOcr.unclearNote ? "medium" : "high",
          source: "ai",
          message: `Recognized ${geminiOcr.wordCount} word${geminiOcr.wordCount === 1 ? "" : "s"} from camera view via Gemini Vision.`,
          unclearNote: geminiOcr.unclearNote,
        };
      }
    } catch (err) {
      console.warn("Gemini OCR failed, trying gateway fallback:", err);
    }
  }

  // 2. Multimodal AI OCR via Lovable Gateway if apiKey is available
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (apiKey && data.imageBase64) {
    try {
      const system = `You are a high-precision OCR text extractor for blind and visually impaired users.
Transcribe all readable printed or handwritten text visible in this camera image.

STRICT ACCURACY RULES:
1. Extract text in natural reading order (top-to-bottom, left-to-right).
2. Preserve line breaks between headings, menu items, signs, and document paragraphs.
3. NEVER invent, hallucinate, or fill in missing words.
4. If a word is blurry, cut off, or illegible, write [unclear] or [blurry] instead of guessing.
5. If NO text is legible in the image, reply ONLY with: NO_TEXT_FOUND
6. Return ONLY the transcribed text. Do not add conversational greetings or explanations.`;

      const prompt = "Read all visible text in this camera frame. Preserve lines and reading order.";
      const extracted = await callGateway(system, prompt, data.imageBase64);

      if (extracted && extracted.trim() && !extracted.includes("NO_TEXT_FOUND")) {
        const raw = extracted.trim();
        const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
        const words = raw.split(/\s+/).filter(Boolean);
        const hasUncertainty = /(?:\[unclear\]|\[blurry\]|\[illegible\])/i.test(raw);
        const unclearNote = hasUncertainty
          ? "Some words appear blurry or obscured and could not be verified with certainty."
          : undefined;

        return {
          hasText: true,
          rawText: raw,
          lines,
          readingOrderText: lines.join(". "),
          wordCount: words.length,
          confidence: hasUncertainty ? "medium" : "high",
          source: "ai",
          message: `Recognized ${words.length} word${words.length === 1 ? "" : "s"} from camera view.`,
          unclearNote,
        };
      }
    } catch (err) {
      console.warn("Gateway OCR failed, checking local evidence:", err);
    }
  }

  // 3. Hints-based extraction (e.g. if COCO-SSD or camera detected signs, books, or text objects)
  const textHints = (data.hints || []).filter((h) =>
    /sign|book|label|menu|paper|screen|stop sign|traffic light/i.test(h)
  );
  const hintLabel = textHints[0];
  if (hintLabel) {
    const raw = `${hintLabel}`;
    return {
      hasText: true,
      rawText: raw,
      lines: [raw],
      readingOrderText: raw,
      wordCount: raw.split(/\s+/).length,
      confidence: "medium",
      source: "local-ocr",
      message: `Detected visible ${hintLabel.toLowerCase()} in view.`,
      unclearNote: "For full text extraction of fine print, ensure camera is centered and well-lit.",
    };
  }

  // 4. Default no-text response
  return {
    hasText: false,
    rawText: "",
    lines: [],
    readingOrderText: "",
    wordCount: 0,
    confidence: "high",
    source: "local-ocr",
    message: "I couldn't find any readable text in this view. Try adjusting the camera angle, bringing it closer, or improving lighting.",
  };
}

/** 'recognize-text-in-frame' — extracts text from camera frames preserving reading order and multi-line structures. */
export const recognizeTextInFrame = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      imageBase64: z.string().optional(),
      hints: z.array(z.string()).default([]),
      testText: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    return processFrameTextRecognition(data);
  });

export interface CurrencyRecognitionResult {
  identified: boolean;
  currency?: "USD" | "INR" | "EUR" | "GBP" | string | undefined;
  currencyName?: string | undefined;
  currencySymbol?: string | undefined;
  denomination?: number | string | undefined;
  spokenText: string;
  status: "confident" | "uncertain" | "multiple_notes" | "unknown_currency" | "no_currency_found";
  confidence: "high" | "medium" | "low";
  multipleNotesDetected: boolean;
  notesCount?: number | undefined;
  details?: string | undefined;
  guidanceNote?: string | undefined;
  source: "ai" | "local-recognizer";
}

const CURRENCY_SPECS: Record<string, { name: string; symbol: string; unit: string; denominations: number[] }> = {
  USD: { name: "US Dollar", symbol: "$", unit: "dollar", denominations: [1, 2, 5, 10, 20, 50, 100] },
  INR: { name: "Indian Rupee", symbol: "₹", unit: "rupee", denominations: [10, 20, 50, 100, 200, 500, 2000] },
  EUR: { name: "Euro", symbol: "€", unit: "euro", denominations: [5, 10, 20, 50, 100, 200] },
  GBP: { name: "British Pound", symbol: "£", unit: "pound", denominations: [5, 10, 20, 50] },
};

function formatConfidentBanknoteSpeech(denom: number | string, currencyKey: string): string {
  const spec = CURRENCY_SPECS[currencyKey] || { unit: "currency note" };
  return `This appears to be a ${denom}-${spec.unit} banknote.`;
}

export async function processCurrencyRecognition(data: {
  imageBase64?: string | undefined;
  preferredCurrency?: string | undefined;
  hints?: string[] | undefined;
  testInput?: {
    text?: string | undefined;
    multipleNotes?: boolean | undefined;
    blurry?: boolean | undefined;
    denomination?: number | string | undefined;
    currency?: string | undefined;
  } | undefined;
}): Promise<CurrencyRecognitionResult> {
  const pref = (data.preferredCurrency || "AUTO").toUpperCase();

  // 1. Direct testInput override (for deterministic test suites & offline validation)
  if (data.testInput !== undefined) {
    const t = data.testInput;
    if (t.multipleNotes) {
      return {
        identified: false,
        status: "multiple_notes",
        spokenText: "Multiple banknotes appear in view. Please scan one note at a time for accurate identification.",
        confidence: "high",
        multipleNotesDetected: true,
        guidanceNote: "Separate the bills and place only one banknote flat in the camera frame.",
        source: "local-recognizer",
      };
    }

    if (t.blurry) {
      return {
        identified: false,
        status: "uncertain",
        spokenText: "I can't identify the denomination confidently. Please scan one note in better lighting.",
        confidence: "low",
        multipleNotesDetected: false,
        guidanceNote: "Hold the note flat, avoid folds, and hold the camera steady in good light.",
        source: "local-recognizer",
      };
    }

    if (t.currency && t.denomination) {
      const cKey = t.currency.toUpperCase();
      const spec = CURRENCY_SPECS[cKey] || { name: cKey, symbol: "", unit: "unit" };
      return {
        identified: true,
        currency: cKey,
        currencyName: spec.name,
        currencySymbol: spec.symbol,
        denomination: t.denomination,
        spokenText: formatConfidentBanknoteSpeech(t.denomination, cKey),
        status: "confident",
        confidence: "high",
        multipleNotesDetected: false,
        details: `${spec.name} (${spec.symbol}${t.denomination})`,
        source: "local-recognizer",
      };
    }

    if (t.text) {
      if (pref === "INR" || pref === "AUTO") {
        const inrRes = evaluateINRBanknote({ text: t.text, multipleNotes: t.multipleNotes, blurry: t.blurry });
        if (inrRes.identified && inrRes.denomination) {
          const spec = CURRENCY_SPECS["INR"] || { name: "Indian Rupee", symbol: "₹", unit: "rupee" };
          return {
            identified: true,
            currency: "INR",
            currencyName: spec.name,
            currencySymbol: spec.symbol,
            denomination: inrRes.denomination,
            spokenText: inrRes.spokenText,
            status: "confident",
            confidence: inrRes.confidence,
            multipleNotesDetected: false,
            details: `${spec.name} (${spec.symbol}${inrRes.denomination})`,
            guidanceNote: inrRes.motif ? `Features motif: ${inrRes.motif}` : undefined,
            source: "local-recognizer",
          };
        }
      }
      return parseTextForCurrency(t.text, pref);
    }

    return {
      identified: false,
      status: "no_currency_found",
      spokenText: "I couldn't identify any banknote in this view. Please hold a banknote flat in front of the camera with good lighting.",
      confidence: "high",
      multipleNotesDetected: false,
      source: "local-recognizer",
    };
  }

  // 1.8. Google Gemini Banknote Vision if configured
  if (isGeminiConfigured() && data.imageBase64) {
    try {
      const geminiNote = await identifyBanknoteWithGemini(data.imageBase64, pref);
      if (geminiNote.multipleNotes) {
        return {
          identified: false,
          status: "multiple_notes",
          spokenText: "Multiple banknotes appear in view. Please scan one note at a time for accurate identification.",
          confidence: "high",
          multipleNotesDetected: true,
          guidanceNote: "Please scan one note at a time for accurate identification.",
          source: "ai",
        };
      }
      if (geminiNote.identified && geminiNote.denomination && geminiNote.currency) {
        const cKey = String(geminiNote.currency).toUpperCase();
        const spec = CURRENCY_SPECS[cKey] || { name: cKey, symbol: "", unit: "unit" };
        return {
          identified: true,
          currency: cKey,
          currencyName: spec.name,
          currencySymbol: spec.symbol,
          denomination: geminiNote.denomination,
          spokenText: formatConfidentBanknoteSpeech(geminiNote.denomination, cKey),
          status: "confident",
          confidence: "high",
          multipleNotesDetected: false,
          details: `${spec.name} (${spec.symbol}${geminiNote.denomination})`,
          guidanceNote: geminiNote.explanation,
          source: "ai",
        };
      }
    } catch (err) {
      console.warn("Gemini currency recognition failed, trying gateway fallback:", err);
    }
  }

  // 2. Multimodal AI Currency Recognition via Lovable Gateway if apiKey is available
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (apiKey && data.imageBase64) {
    try {
      const system = `You are a currency recognition assistive engine for visually impaired users.
Identify any banknote visible in the camera frame.

CRITICAL RULES:
1. If MULTIPLE banknotes appear, set "multipleNotes": true.
2. If the note is blurry, folded, cut off, or denomination is unclear, set "confident": false.
3. Supported currencies include USD ($), INR (₹), EUR (€), GBP (£).
4. User preferred currency context: ${pref}.
5. NEVER claim the banknote is genuine, counterfeit, or valid.
6. Reply ONLY with JSON:
{
  "identified": boolean,
  "currency": "USD" | "INR" | "EUR" | "GBP" | null,
  "denomination": number | string | null,
  "multipleNotes": boolean,
  "confident": boolean,
  "unclearReason": string | null
}`;
      const prompt = "Identify the banknote in this camera frame. Check denomination and currency.";
      interface GatewayCurrencyPayload {
        currency?: string | null | undefined;
        denomination?: number | string | null | undefined;
        multipleNotes?: boolean | undefined;
        confident?: boolean | undefined;
        unclearReason?: string | null | undefined;
      }
      const raw = await callGateway(system, prompt, data.imageBase64);
      const parsed = parseJson<GatewayCurrencyPayload | null>(raw, null);

      if (parsed) {
        if (parsed.multipleNotes) {
          return {
            identified: false,
            status: "multiple_notes",
            spokenText: "Multiple banknotes appear in view. Please scan one note at a time for accurate identification.",
            confidence: "high",
            multipleNotesDetected: true,
            guidanceNote: "Please scan one note at a time for accurate identification.",
            source: "ai",
          };
        }

        if (!parsed.confident || !parsed.denomination || !parsed.currency) {
          return {
            identified: false,
            status: "uncertain",
            spokenText: "I can't identify the denomination confidently. Please scan one note in better lighting.",
            confidence: "low",
            multipleNotesDetected: false,
            guidanceNote: parsed.unclearReason || "Ensure the entire banknote is visible, flat, and well-lit.",
            source: "ai",
          };
        }

        const cKey = String(parsed.currency).toUpperCase();
        const spec = CURRENCY_SPECS[cKey] || { name: cKey, symbol: "", unit: "unit" };
        return {
          identified: true,
          currency: cKey,
          currencyName: spec.name,
          currencySymbol: spec.symbol,
          denomination: parsed.denomination,
          spokenText: formatConfidentBanknoteSpeech(parsed.denomination, cKey),
          status: "confident",
          confidence: "high",
          multipleNotesDetected: false,
          details: `${spec.name} (${spec.symbol}${parsed.denomination})`,
          source: "ai",
        };
      }
    } catch (err) {
      console.warn("Gateway currency recognition failed, falling back to local analyzer:", err);
    }
  }

  // 3. Hints & local inspection check
  const hints = data.hints || [];
  const hasMoneyHint = hints.some((h) => /money|dollar|rupee|euro|pound|cash|banknote|paper/i.test(h));
  if (hasMoneyHint && pref !== "AUTO") {
    return {
      identified: false,
      status: "uncertain",
      spokenText: "I can't identify the denomination confidently. Please scan one note in better lighting.",
      confidence: "low",
      multipleNotesDetected: false,
      guidanceNote: "Hold the note flat and centered in good light.",
      source: "local-recognizer",
    };
  }

  // 4. Default no currency found response
  return {
    identified: false,
    status: "no_currency_found",
    spokenText: "I couldn't identify any banknote in this view. Please hold a banknote flat in front of the camera with good lighting.",
    confidence: "high",
    multipleNotesDetected: false,
    source: "local-recognizer",
  };
}

function parseTextForCurrency(raw: string, pref: string): CurrencyRecognitionResult {
  const lower = raw.toLowerCase();

  // Check for multiple notes indicator
  if (/\b(?:multiple notes|two notes|three notes|several bills|more than one note)\b/i.test(lower)) {
    return {
      identified: false,
      status: "multiple_notes",
      spokenText: "Multiple banknotes appear in view. Please scan one note at a time for accurate identification.",
      confidence: "high",
      multipleNotesDetected: true,
      guidanceNote: "Separate the bills and place only one banknote flat in the camera frame.",
      source: "local-recognizer",
    };
  }

  // Check for blurry/unclear indicator
  if (/(?:\[blurry\]|\[unclear\]|folded|obscured|illegible|blurry)/i.test(lower)) {
    return {
      identified: false,
      status: "uncertain",
      spokenText: "I can't identify the denomination confidently. Please scan one note in better lighting.",
      confidence: "low",
      multipleNotesDetected: false,
      guidanceNote: "Hold the note flat, avoid folds, and hold the camera steady in good light.",
      source: "local-recognizer",
    };
  }

  // Identify currency family
  let detectedCurr = pref !== "AUTO" ? pref : "";
  if (/\$|dollar|federal reserve|united states/i.test(raw)) {
    detectedCurr = "USD";
  } else if (/₹|rs|rupee|reserve bank of india/i.test(raw)) {
    detectedCurr = "INR";
  } else if (/€|euro|bce|ecb/i.test(raw)) {
    detectedCurr = "EUR";
  } else if (/£|pound|bank of england/i.test(raw)) {
    detectedCurr = "GBP";
  }

  // Extract candidate denomination numbers
  const numberMatches = raw.match(/\b(2000|500|200|100|50|20|10|5|2|1)\b/g);
  if (!numberMatches || numberMatches.length === 0) {
    return {
      identified: false,
      status: "no_currency_found",
      spokenText: "I couldn't identify any banknote in this view. Please hold a banknote flat in front of the camera with good lighting.",
      confidence: "high",
      multipleNotesDetected: false,
      source: "local-recognizer",
    };
  }

  // If multiple distinct numbers appear, could be multiple notes
  const uniqueNumbers = Array.from(new Set(numberMatches));
  if (uniqueNumbers.length > 1) {
    return {
      identified: false,
      status: "multiple_notes",
      spokenText: "Multiple banknotes appear in view. Please scan one note at a time for accurate identification.",
      confidence: "high",
      multipleNotesDetected: true,
      guidanceNote: "Separate the bills and place only one banknote flat in the camera frame.",
      source: "local-recognizer",
    };
  }

  const denomStr = uniqueNumbers[0];
  if (!denomStr) {
    return {
      identified: false,
      status: "no_currency_found",
      spokenText: "I couldn't identify any banknote in this view. Please hold a banknote flat in front of the camera with good lighting.",
      confidence: "high",
      multipleNotesDetected: false,
      source: "local-recognizer",
    };
  }
  const denom = Number(denomStr);

  // If currency is still unknown
  if (!detectedCurr || detectedCurr === "AUTO") {
    return {
      identified: false,
      denomination: denom,
      status: "unknown_currency",
      spokenText: `I see denomination ${denom}, but the currency country is unclear. Please select your currency context.`,
      confidence: "medium",
      multipleNotesDetected: false,
      guidanceNote: "Select US Dollar, Indian Rupee, Euro, or British Pound from the currency context selector.",
      source: "local-recognizer",
    };
  }

  const spec = CURRENCY_SPECS[detectedCurr] || { name: detectedCurr, symbol: "", unit: "unit" };
  return {
    identified: true,
    currency: detectedCurr,
    currencyName: spec.name,
    currencySymbol: spec.symbol,
    denomination: denom,
    spokenText: formatConfidentBanknoteSpeech(denom, detectedCurr),
    status: "confident",
    confidence: "high",
    multipleNotesDetected: false,
    details: `${spec.name} (${spec.symbol}${denom})`,
    source: "local-recognizer",
  };
}

/** 'identify-currency-in-frame' — identifies banknotes, currency type, and denomination with grounded confidence. */
export const identifyCurrencyInFrame = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      imageBase64: z.string().optional(),
      preferredCurrency: z.string().default("AUTO"),
      hints: z.array(z.string()).default([]),
      testInput: z.object({
        text: z.string().optional(),
        multipleNotes: z.boolean().optional(),
        blurry: z.boolean().optional(),
        denomination: z.union([z.number(), z.string()]).optional(),
        currency: z.string().optional(),
      }).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    return processCurrencyRecognition(data);
  });

export interface FamiliarPerson {
  id: string;
  name: string;
  relationship: string;
  consentGranted: boolean;
  notes?: string | undefined;
  createdAt: string;
}

export function formatFamiliarPersonAnnouncement(
  person: FamiliarPerson | null,
  personVisibleInCamera: boolean
): { text: string; disclaimer: string } {
  if (!person) {
    return {
      text: "No familiar person is currently selected.",
      disclaimer: "No facial recognition is performed. Selection is entirely user-controlled.",
    };
  }

  const cameraContext = personVisibleInCamera
    ? "A person is currently visible in the camera view. "
    : "";

  const text = `${cameraContext}User-selected familiar person: ${person.name}${person.relationship ? ` (${person.relationship})` : ""}. Note: This label is user-provided and not verified by camera or facial recognition.`;

  return {
    text,
    disclaimer: "User-provided label only. No facial recognition, biometric templates, or biometric matching are used.",
  };
}

export function localSemanticSummarize(transcript: string): { chip: string; explanation: string } {
  const clean = transcript.trim();
  if (!clean) return { chip: "", explanation: "" };

  const lower = clean.toLowerCase();

  // 1. Direct Questions Asking for User Information or Actions
  // Example 1: "What is your name?" -> "Tell that person your name."
  if (
    /\b(?:what(?:'s|\s+is)\s+your\s+name|may\s+i\s+(?:know|have)\s+your\s+name|who\s+are\s+you)\b/i.test(lower) ||
    /(?:உன்|உங்கள்)\s+பெயர்\s+என்ன/i.test(lower)
  ) {
    return {
      chip: "Name Requested",
      explanation: "Tell that person your name.",
    };
  }

  // Example: "How old are you?"
  if (
    /\b(?:how\s+old\s+are\s+you|what\s+is\s+your\s+age)\b/i.test(lower) ||
    /(?:உன்|உங்கள்)\s+வயது\s+என்ன/i.test(lower)
  ) {
    return {
      chip: "Age Asked",
      explanation: "They are asking how old you are.",
    };
  }

  // Example: "Where are you from?" / "Where do you live?"
  if (
    /\b(?:where\s+are\s+you\s+from|where\s+do\s+you\s+live|where\s+were\s+you\s+born)\b/i.test(lower) ||
    /(?:எங்கிருந்து\s+வருகிறீர்கள்|எங்கே\s+வசிக்கிறீர்கள்)/i.test(lower)
  ) {
    return {
      chip: "Origin / Address",
      explanation: "They want to know where you live or where you came from.",
    };
  }

  // Example: "Can you hear me?"
  if (/\b(?:can\s+you\s+hear\s+me|are\s+you\s+listening)\b/i.test(lower)) {
    return {
      chip: "Sound Check",
      explanation: "They are checking if you can hear them. Let them know you communicate using text or signs.",
    };
  }

  // Example: "Do you need help?" / "Can I help you?"
  if (
    /\b(?:do\s+you\s+need\s+help|can\s+i\s+help\s+you|need\s+any\s+assistance)\b/i.test(lower) ||
    /(?:உதவி\s+தேவையா)/i.test(lower)
  ) {
    return {
      chip: "Help Offered",
      explanation: "They are asking if you need help or assistance.",
    };
  }

  // 2. Requests to Bring or Give Something
  // Example 2: "Can you please bring me a glass of water?" -> "They are asking you to bring them a glass of water."
  const bringMatch =
    lower.match(/(?:can|could|would)\s+you\s+(?:please\s+)?(?:bring|give|pass|get|fetch|hand)\s+(?:me\s+)?([^.?!,;]+)/i) ||
    lower.match(/(?:please\s+)?(?:bring|give|pass|get|fetch|hand)\s+(?:me\s+)?([^.?!,;]+)/i);
  if (bringMatch && bringMatch[1] && !lower.includes("meeting")) {
    let cleanItem = bringMatch[1].trim();
    cleanItem = cleanItem.replace(/\b(for me|to me|please)\b/gi, "").trim();
    // Prepend 'a' if not having an article or possessive
    if (!/^(a|an|the|my|some|your)\s+/i.test(cleanItem)) {
      cleanItem = `a ${cleanItem}`;
    }
    const chipWord = cleanItem.replace(/^(a|an|the|some)\s+/i, "").trim();
    const chipFormatted = chipWord.length > 15 ? `${chipWord.slice(0, 14)}…` : chipWord;
    return {
      chip: `Bring ${chipFormatted.charAt(0).toUpperCase() + chipFormatted.slice(1)}`,
      explanation: `They are asking you to bring them ${cleanItem}.`,
    };
  }

  // 3. Schedules, Meetings, Deadlines with Early Arrival Calculations
  // Example 3: "We have a meeting tomorrow at 10 AM. Please bring your documents and arrive 15 minutes early."
  // -> "You have a meeting tomorrow at 10 AM. Bring your documents and arrive by 9:45 AM."
  const isMeetingOrSchedule = /\b(?:meeting|session|interview|class|exam|appointment|call)\b/i.test(lower);
  const timeRegex = /\b(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/i;
  const timeMatch = clean.match(timeRegex);
  const dayMatch = clean.match(/\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);

  if (isMeetingOrSchedule || timeMatch) {
    const timeStr = timeMatch && timeMatch[1] && timeMatch[2] ? `${timeMatch[1]} ${timeMatch[2].toUpperCase()}` : "";
    const dayStr = dayMatch && dayMatch[1] ? dayMatch[1].toLowerCase() : "upcoming";
    const earlyMatch = lower.match(/(\d+)\s*minutes?\s*(?:early|before|prior)/i);

    let calculatedTime = "";
    if (timeMatch && timeMatch[1] && timeMatch[2] && earlyMatch && earlyMatch[1]) {
      const minutesEarly = parseInt(earlyMatch[1], 10);
      const [hStr, mStr] = timeMatch[1].split(":");
      const hour = hStr ? parseInt(hStr, 10) : 0;
      const minute = mStr ? parseInt(mStr, 10) : 0;
      const period = timeMatch[2].toUpperCase();

      let totalMinutes = (hour % 12) * 60 + minute - minutesEarly;
      if (totalMinutes < 0) totalMinutes += 12 * 60;
      let newHour = Math.floor(totalMinutes / 60);
      if (newHour === 0) newHour = 12;
      const newMinute = totalMinutes % 60;
      calculatedTime = `${newHour}:${newMinute < 10 ? "0" + newMinute : newMinute} ${period}`;
    }

    const bringDocMatch = lower.match(/(?:bring|carry|take)\s+(?:your\s+)?([^.?!,;]+?)(?:\s+(?:and\s+)?arrive|\s+before|\s+at|$|[.?!,;])/i);
    const docItem = bringDocMatch && bringDocMatch[1] ? bringDocMatch[1].replace(/\b(and|please|arrive|by|at|your)\b/gi, "").trim() : "";
    const docNote = docItem ? ` Bring your ${docItem}` : "";
    const arrivalNote = calculatedTime ? `arrive by ${calculatedTime}.` : (earlyMatch && earlyMatch[1] ? `arrive ${earlyMatch[1]} minutes early.` : "");

    let actionClause = "";
    if (docNote && arrivalNote) {
      actionClause = `${docNote} and ${arrivalNote}`;
    } else if (docNote) {
      actionClause = `${docNote}.`;
    } else if (arrivalNote) {
      actionClause = ` Arrive ${arrivalNote}`;
    }

    return {
      chip: `Meeting ${timeStr || dayStr.toUpperCase()}`,
      explanation: `You have a meeting ${dayStr}${timeStr ? ` at ${timeStr}` : ""}.${actionClause}`,
    };
  }

  // 4. Relocations, Rooms, Venues, Classrooms
  const roomMoveMatch = lower.match(
    /(?:classroom|class|lecture|meeting|office|exam|session).*(?:moved|shifted|rescheduled|held in|going to|relocated).*?(block\s+[a-z0-9]+|room\s+[a-z0-9]+|hall\s+[a-z0-9]+|auditorium|[a-z]+\s+lab)/i,
  );
  if (roomMoveMatch) {
    const dest = roomMoveMatch[1]?.toUpperCase() ?? "another room";
    return {
      chip: `Moved to ${dest}`,
      explanation: `Your session or classroom has been moved to ${dest}. Please proceed there.`,
    };
  }

  // 5. Emergency, Danger, Evacuation
  if (/\b(emergency|fire|danger|hazard|siren|alarm|evacuate|police|hospital)\b/i.test(lower)) {
    if (/\b(fire|alarm)\b/i.test(lower)) {
      return { chip: "Fire Alarm", explanation: "An emergency fire alarm notice was given. Please evacuate through the nearest safe exit." };
    }
    if (/\b(siren)\b/i.test(lower)) {
      return { chip: "Emergency Siren", explanation: "An emergency siren was heard nearby. Stay alert." };
    }
    return { chip: "Safety Notice", explanation: "An urgent safety notice was announced. Follow safety instructions." };
  }

  // 6. Direct Instructions to User
  if (/\b(?:please\s+)?wait\s+(?:here|outside|a\s+moment|for\s+me)\b/i.test(lower)) {
    return { chip: "Please Wait", explanation: "They are asking you to wait here for a moment." };
  }
  if (/\b(?:please\s+)?(?:sign|fill|complete)\s+(.+)/i.test(lower)) {
    const formMatch = clean.match(/(?:sign|fill|complete)\s+(?:the\s+|this\s+)?([^.?!,;]+)/i);
    const item = formMatch && formMatch[1] ? formMatch[1].trim() : "the document";
    return { chip: "Action Required", explanation: `You need to sign or fill out ${item}.` };
  }
  if (/\b(?:please\s+)?(?:sit\s+down|take\s+a\s+seat)\b/i.test(lower)) {
    return { chip: "Take a Seat", explanation: "They are inviting you to sit down." };
  }
  if (/\b(?:please\s+)?(?:follow\s+me|come\s+with\s+me)\b/i.test(lower)) {
    return { chip: "Follow Them", explanation: "They want you to follow them." };
  }

  // 7. General Questions
  if (/\bwhere\s+is\s+(?:the\s+)?([^.?!,;]+)/i.test(lower)) {
    const placeMatch = clean.match(/where\s+is\s+(?:the\s+)?([^.?!,;]+)/i);
    const place = placeMatch && placeMatch[1] ? placeMatch[1].trim() : "a place";
    return {
      chip: "Directions Asked",
      explanation: `They are asking you for directions to ${place}.`,
    };
  }

  if (/\?$/.test(clean) || /\b(can you|could you|would you|do you know|what time|who is|why)\b/i.test(lower)) {
    return {
      chip: "Question Asked",
      explanation: "They asked a question. Tell them your answer or response.",
    };
  }

  // 8. Multi-sentence / Long Conversation Synthesis
  const sentences = clean.split(/[.?!]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) {
    const actionSentence = sentences.find((s) => /\b(need to|must|should|please|bring|make sure|remember|submit|attend)\b/i.test(s));
    const infoSentence = sentences.find((s) => s !== actionSentence && s.length > 15) || sentences[0];

    const actionText = actionSentence ? ` Action for you: ${actionSentence}.` : "";
    return {
      chip: "Discussion Summary",
      explanation: `Key point: ${infoSentence}.${actionText}`,
    };
  }

  // Fallback for single informative statements
  const firstSentence = sentences[0] || clean;
  return {
    chip: "Important Note",
    explanation: `Key information shared: ${firstSentence}.`,
  };
}

/** 'summarize-transcript' — extracts the practical meaning of what was said. */
export const summarizeTranscript = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ transcript: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      try {
        const raw = await callGateway(
          `You are INAI's understanding engine for deaf and hard-of-hearing individuals.
Explain what the speaker wants or what action the user must take — NEVER repeat or merely rephrase the transcript.

RULES:
1. QUESTIONS: Explain what the user is being asked to answer or do.
   - Example: "What is your name?" -> chip: "Name Requested", explanation: "Tell that person your name."
   - Example: "Where do you live?" -> chip: "Location Asked", explanation: "They want to know where you live."
2. REQUESTS: Explain what the speaker is asking the user to do.
   - Example: "Can you please bring me a glass of water?" -> chip: "Bring Water", explanation: "They are asking you to bring them a glass of water."
3. SCHEDULES & INSTRUCTIONS: State the meeting/deadline and preparatory action.
   - Example: "We have a meeting tomorrow at 10 AM. Please bring your documents and arrive 15 minutes early." -> chip: "Meeting Tomorrow", explanation: "You have a meeting tomorrow at 10 AM. Bring your documents and arrive by 9:45 AM."
4. LONG CONVERSATIONS: Synthesize the key points, decisions, and required next steps for the user. Do NOT repeat the full text.
5. TAMIL: If in Tamil, explain the meaning clearly.
6. Reply ONLY with JSON: {"chip": string, "explanation": string}.
   - "chip": 2 to 4 word badge.
   - "explanation": 1 to 2 concise sentences addressing the user directly.`,
          data.transcript,
        );
        const parsed = parseJson(raw, { chip: "", explanation: "" });
        if (parsed.chip && parsed.explanation) {
          return parsed;
        }
      } catch (err) {
        console.warn("Gateway summarization failed, falling back to local semantic summarizer:", err);
      }
    }
    return localSemanticSummarize(data.transcript);
  });


/** 'inai-chat' — the conversation screen. */
export const inaiChat = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      message: z.string().min(1),
      profile: profileSchema,
      world: z.object({ detections: z.array(z.string()), sounds: z.array(z.string()), transcript: z.string() }),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).default([]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const context = `Around the person right now — seen: ${data.world.detections.join(", ") || "nothing"}; heard: ${data.world.sounds.join(", ") || "nothing"}; last speech heard: ${data.world.transcript || "none"}.`;
    const history = data.history.map((m) => `${m.role === "user" ? "Person" : "INAI"}: ${m.content}`).join("\n");
    const reply = await callGateway(
      "You are INAI, a warm accessibility companion. Answer in at most three short sentences, plain language, never clinical. Distances are always approximate. Never claim to contact emergency services. Do not invent things that were not seen or heard.",
      `${context}\n${history}\nPerson: ${data.message}`,
    );
    return { reply: reply || "I'm here with you, but I couldn't work that out just now." };
  });

/** 'ai-service-status' — transparent reporting of active server AI models. */
export const getAIServiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  const gemini = isGeminiConfigured();
  const lovable = Boolean(process.env["LOVABLE_API_KEY"]);
  return {
    geminiConfigured: gemini,
    lovableConfigured: lovable,
    activeProvider: gemini ? "Google Gemini Vision" : lovable ? "Lovable Gateway" : "On-Device Local Engine",
  };
});

