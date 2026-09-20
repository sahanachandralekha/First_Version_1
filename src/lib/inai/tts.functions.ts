import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function splitIntoChunks(text: string, maxLen = 160): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + " " + s).trim().length <= maxLen) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      if (s.length > maxLen) {
        const words = s.split(" ");
        current = "";
        for (const w of words) {
          if ((current + " " + w).trim().length <= maxLen) {
            current = (current + " " + w).trim();
          } else {
            if (current) chunks.push(current);
            current = w;
          }
        }
      } else {
        current = s;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface SynthesizeSpeechResult {
  audioBase64: string;
  mimeType: string;
  provider: string;
}

/**
 * Server function to generate MP3 audio from text using ElevenLabs (if configured)
 * or Google Translate TTS stream without requiring external client CORS.
 */
export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      text: z.string().max(3000),
      language: z.string().default("en"),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<SynthesizeSpeechResult> => {
    const text = data.text.trim();
    if (!text) {
      return { audioBase64: "", mimeType: "audio/mpeg", provider: "none" };
    }

    // 1. Check ElevenLabs API Key in environment
    const elevenKey = process.env["ELEVENLABS_API_KEY"];
    if (elevenKey) {
      try {
        const voiceId = process.env["ELEVENLABS_VOICE_ID"] || "21m00Tcm4TlvDq8ikWAM"; // Rachel
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_monolingual_v1",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });

        if (res.ok) {
          const buffer = await res.arrayBuffer();
          return {
            audioBase64: Buffer.from(buffer).toString("base64"),
            mimeType: "audio/mpeg",
            provider: "elevenlabs",
          };
        }
      } catch (err) {
        console.warn("[INAI TTS] ElevenLabs generation failed, falling back:", err);
      }
    }

    // 2. High-performance Cloud MP3 TTS service (Google Cloud TTS stream)
    try {
      const chunks = splitIntoChunks(text, 160);
      const buffers = await Promise.all(
        chunks.map(async (chunk) => {
          const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(data.language)}&client=tw-ob`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          });
          if (!res.ok) {
            throw new Error(`Google TTS status: ${res.status}`);
          }
          return Buffer.from(await res.arrayBuffer());
        }),
      );

      const merged = Buffer.concat(buffers);
      return {
        audioBase64: merged.toString("base64"),
        mimeType: "audio/mpeg",
        provider: "google-tts",
      };
    } catch (err) {
      console.error("[INAI TTS] Cloud MP3 synthesis failed:", err);
      throw err;
    }
  });
