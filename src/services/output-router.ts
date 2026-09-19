import type { AccessibilityProfile } from "@/stores/accessibility-store";
import type { AssistanceDirective } from "./events";
import { hapticStrength, visualEmphasis } from "./context-engine";
import { ttsService } from "./tts";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface RoutedOutput {
  speak: boolean;
  caption: boolean;
  sign: boolean;
  haptic: "none" | "medium" | "strong";
  visual: "standard" | "maximum";
}

const patterns: Record<"medium" | "strong", number[]> = { medium: [120, 60, 120], strong: [260, 90, 260, 90, 260] };

/** Fans a directive out to every channel the profile needs. */
export function routeDirective(
  directive: AssistanceDirective,
  profile: AccessibilityProfile,
  options: { voiceEnabled: boolean; hapticEnabled: boolean; signEnabled: boolean; onCaption: (text: string, critical: boolean) => void },
): RoutedOutput {
  const output: RoutedOutput = {
    speak: directive.modalities.includes("speech") && options.voiceEnabled,
    caption: true,
    sign: directive.modalities.includes("sign") && options.signEnabled,
    haptic: directive.modalities.includes("haptic") && options.hapticEnabled ? hapticStrength(profile) : "none",
    visual: visualEmphasis(profile),
  };
  options.onCaption(directive.message, directive.severity === "critical");
  if (output.speak) {
    void ttsService.speak(directive.message, {
      priority: directive.severity === "critical" ? "emergency" : directive.severity === "warn" ? "alert" : "guidance",
    }).catch(() => undefined);
  }
  if (output.haptic !== "none" && typeof navigator !== "undefined") navigator.vibrate?.(patterns[output.haptic]);
  queueDirective(directive);
  return output;
}

/** Debounced persistence so a burst of events becomes one write. */
let pending: AssistanceDirective[] = [];
let timer: number | undefined;

export function queueDirective(directive: AssistanceDirective) {
  if (typeof window === "undefined") return;
  pending.push(directive);
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void flushDirectives(); }, 2500);
}

export async function flushDirectives() {
  const batch = pending;
  pending = [];
  if (!batch.length) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("assistance_events").insert(
    batch.map((directive) => ({
      user_id: data.user!.id,
      event_type: directive.eventId.split("-")[0] ?? "assistance",
      severity: directive.severity,
      payload: JSON.parse(JSON.stringify(directive)) as Json,
    })),
  );
}
