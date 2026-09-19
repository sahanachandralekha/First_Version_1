import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
async function callGateway(system: string, user: unknown) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
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
    // Sort nearest-first so the model weighs what matters most, and keep confidence so it can discount shaky reads.
    const sorted = [...data.detections].sort((a, b) => (a.approxDistance ?? 99) - (b.approxDistance ?? 99));
    const listed = sorted
      .map((d) => {
        const bits = [d.label];
        if (d.approxDistance) bits.push(`about ${Math.round(d.approxDistance)} m away`);
        if (d.confidence !== undefined && d.confidence < 0.7) bits.push("uncertain detection");
        return bits.join(", ");
      })
      .join("; ") || "nothing recognised";
    const needs = [
      data.profile.visual && "limited vision (describe positions and obstacles concretely)",
      data.profile.hearing && "limited hearing (they cannot hear approaching vehicles or warnings)",
      data.profile.speech && "limited speech (keep guidance answerable without speaking)",
    ].filter(Boolean).join("; ") || "no specific limitation given";
    const raw = await callGateway(
      `You are the situational-awareness core of INAI, an accessibility companion. You receive on-device object detections from the person's camera and turn them into a short, truthful read of the scene.

Rules:
- Say what the scene IS (a corridor, a road crossing, a crowded room) only when the detections genuinely imply it; otherwise say what is there without naming a place.
- Anchor everything spatially: near/far, and left/ahead/right only if the list gives positions — never guess positions.
- Priority: the nearest moving thing that could affect the person (vehicle, bicycle, person approaching) decides "warn"/"critical"; "warn" only when something is within roughly 4 m, "critical" within roughly 2 m. Static furniture or distant people are "info"/"notice".
- Guidance must be one concrete physical action ("pause and hold the rail", "step left toward the open floor"), never vague advice like "be careful" or "stay alert".
- If previous guidance is given, do not repeat it unless nothing changed; say what changed instead.
- Distances are always approximate. Never invent objects, movement, exits, or signs that are not in the list.
- Adapt wording to the person's needs listed below.

Reply ONLY with JSON: {"summary":string,"priority":"info"|"notice"|"warn"|"critical","guidance":string,"hazards":string[]}. summary describes what is happening right now (under 30 words, spoken language, no object-list recital); guidance is the single most useful next action (under 20 words); hazards lists only the detections that genuinely threaten safety.`,
      `Detections (nearest first): ${listed}\nPerson's needs: ${needs}\nPrevious guidance: ${data.lastGuidance || "none"}${data.question ? `\nThe person asked: ${data.question}` : ""}`,
    );
    return parseJson(raw, fallback);
  });

/** 'summarize-transcript' — extracts the practical meaning of what was said. */
export const summarizeTranscript = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ transcript: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const raw = await callGateway(
      "Extract the practical meaning of a spoken announcement for someone who cannot hear it. Reply ONLY with JSON: {\"chip\":string,\"explanation\":string}. chip is at most four words, like \"Block B -> Classroom\". explanation is one short sentence.",
      data.transcript,
    );
    return parseJson(raw, { chip: "", explanation: "" });
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
    const context = `What INAI's own sensors report right now — seen: ${data.world.detections.join(", ") || "nothing detected"}; heard: ${data.world.sounds.join(", ") || "nothing detected"}; last speech heard: ${data.world.transcript || "none"}.`;
    const history = data.history.map((m) => `${m.role === "user" ? "Person" : "INAI"}: ${m.content}`).join("\n");
    const needs = [
      data.profile.visual && "limited vision",
      data.profile.hearing && "limited hearing",
      data.profile.speech && "limited speech",
    ].filter(Boolean).join(", ") || "not specified";
    const reply = await callGateway(
      `You are INAI, a warm accessibility companion speaking to a person with ${needs}.

Grounding rules:
- Answer using the sensor context below when the question is about their surroundings ("what's around me", "is anything coming", "what did they say"). Quote what was actually seen or heard, with approximate distances.
- If the sensor context does not contain the answer, say so plainly ("I can't see that from here") and suggest the concrete thing they can do (point the camera, tap Describe this scene) — never fill the gap with a plausible-sounding guess.
- Answer general questions (what is sign language, how do I change a setting) helpfully from your own knowledge, and keep them clearly separate from what the sensors report.
- At most three short sentences. Plain, warm, spoken language — never clinical. Distances are always approximate. Never claim to contact emergency services or anyone else.`,
      `${context}\n${history}\nPerson: ${data.message}`,
    );
    return { reply: reply || "I'm here with you, but I couldn't work that out just now." };
  });

/**
 * 'describe-scene' — sends ONE camera frame to the model, only when the person
 * asks for it, and gets back a real description of what is happening.
 */
export const describeScene = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      image: z.string().startsWith("data:image/"),
      profile: profileSchema,
      question: z.string().max(300).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const needs = [
      data.profile.visual && "cannot see the scene",
      data.profile.hearing && "cannot hear the scene",
    ].filter(Boolean).join(" and ") || "may not perceive the scene fully";
    const text = await callGateway(
      `You are INAI, describing one live camera frame to a person who ${needs}. This photo is their only window right now, so precision matters more than pleasantries.

Describe in this order:
1. The setting and overall activity in one clause (name the place type only if it is visually obvious).
2. Whatever is closest and most relevant to the person's body — obstacles, people, vehicles — with position (left, ahead, right) and approximate distance.
3. Anything that could hurt them or block their path, if present.
4. Readable text, signs, or door labels, quoted exactly.
5. The single most useful next step, only if one clearly follows from the scene.

Rules: 2-4 warm, plain sentences total. Report only what is actually visible — if part of the frame is blurry or dark, say so rather than guessing. If the person asked a specific question, answer that question first using the image, then add safety-relevant details. Distances are always approximate.`,
      [{
        role: "user",
        content: [
          { type: "input_text", text: data.question?.trim() || "Describe what is happening in front of me right now." },
          { type: "input_image", image_url: data.image },
        ],
      }],
    );
    return { description: text || "I couldn't make out enough from that view. Let me try again in a moment." };
  });
