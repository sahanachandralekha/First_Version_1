import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODEL = "google/gemini-2.5-flash";

const detectionSchema = z.object({
  label: z.string(),
  approxDistance: z.number().optional(),
  confidence: z.number().optional(),
});
const profileSchema = z.object({ visual: z.boolean(), hearing: z.boolean(), speech: z.boolean() });

async function callGateway(system: string, user: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured.");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (response.status === 429) throw new Error("INAI is busy right now. Please try again in a moment.");
  if (response.status === 402) throw new Error("INAI's AI allowance is used up for now.");
  if (!response.ok) throw new Error("INAI could not reach its understanding service.");
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() ?? "";
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
