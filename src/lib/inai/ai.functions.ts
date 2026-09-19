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
    const listed = data.detections.map((d) => `${d.label}${d.approxDistance ? ` ~${Math.round(d.approxDistance)} m` : ""}`).join(", ") || "nothing recognised";
    const raw = await callGateway(
      "You help a person with visual, hearing or speech accessibility needs understand what is happening around them right now. Say what the scene actually is and what is going on in it — not just a list of objects: where things are (left, ahead, right), whether anything is moving toward the person, and what that means for their next step. Always describe distances as approximate. Never invent objects that are not listed. Reply ONLY with JSON: {\"summary\":string,\"priority\":\"info\"|\"notice\"|\"warn\"|\"critical\",\"guidance\":string,\"hazards\":string[]}. summary describes what is happening (under 30 words); guidance is the single most useful next action (under 20 words). Warm, plain, spoken language.",
      `Detections: ${listed}\nProfile: visual=${data.profile.visual}, hearing=${data.profile.hearing}, speech=${data.profile.speech}\nPrevious guidance: ${data.lastGuidance || "none"}${data.question ? `\nThe person asked: ${data.question}` : ""}`,
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
    const context = `Around the person right now — seen: ${data.world.detections.join(", ") || "nothing"}; heard: ${data.world.sounds.join(", ") || "nothing"}; last speech heard: ${data.world.transcript || "none"}.`;
    const history = data.history.map((m) => `${m.role === "user" ? "Person" : "INAI"}: ${m.content}`).join("\n");
    const reply = await callGateway(
      "You are INAI, a warm accessibility companion. Answer in at most three short sentences, plain language, never clinical. Distances are always approximate. Never claim to contact emergency services. Do not invent things that were not seen or heard.",
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
    const text = await callGateway(
      "You are INAI, describing a real photo to a person who may not be able to see or hear it. Say exactly what is happening in the scene: the place, the people and what they appear to be doing, objects and where they are relative to the viewer (left, ahead, right), any movement, text or signs you can read, and anything that could be a hazard. Never invent anything you cannot see. Distances are approximate. Speak in 2-4 warm, plain sentences, ending with the most useful next step if there is one.",
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
