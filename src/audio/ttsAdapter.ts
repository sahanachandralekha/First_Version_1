import { synthesizeSpeech } from "@/lib/inai/tts.functions";

export interface GeneratedVoiceAudio {
  audioUrl: string;
  revoke?: () => void;
  provider: string;
}

/**
 * Abstraction to generate playable MP3 / Blob audio URL from text
 * using the real TTS provider (ElevenLabs / Google Cloud MP3).
 */
export async function generateINAIVoice(
  text: string,
  language = "en",
): Promise<GeneratedVoiceAudio> {
  const cleanText = text.trim();
  if (!cleanText) {
    return { audioUrl: "", provider: "empty" };
  }

  // 1. Primary: Server-side TTS synthesis (ElevenLabs if key exists, else Google MP3 stream)
  try {
    const res = await synthesizeSpeech({ data: { text: cleanText, language } });
    if (res?.audioBase64) {
      const binaryString = atob(res.audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: res.mimeType || "audio/mpeg" });
      const audioUrl = URL.createObjectURL(blob);

      return {
        audioUrl,
        revoke: () => {
          try {
            URL.revokeObjectURL(audioUrl);
          } catch {
            // Ignore revoke error
          }
        },
        provider: res.provider || "server-mp3",
      };
    }
  } catch (err) {
    console.warn("[INAI TTS Adapter] Server speech synthesis failed, using direct URL fallback:", err);
  }

  // 2. Direct HTML Audio URL fallback (HTMLAudioElement can load audio URLs directly)
  const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText.slice(0, 160))}&tl=${encodeURIComponent(language)}&client=tw-ob`;
  return {
    audioUrl: fallbackUrl,
    provider: "client-direct",
  };
}
