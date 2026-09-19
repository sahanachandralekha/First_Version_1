import fallbackAsset from "@/assets/inai-avatar.png.asset.json";
import type { AvatarDriver, AvatarRenderState } from "../types";

const poseByState: Record<AvatarRenderState["state"], string> = {
  idle: "idle_seated", listening: "listening", thinking: "thinking", speaking: "speaking_neutral",
  warning: "concerned", emergency: "urgent", signing: "open_palms", guiding: "point_right",
};
const allowed = new Set(["idle_seated", "idle_standing", "wave", "listening", "thinking", "speaking_neutral", "point_right", "point_left", "stop_palm", "concerned", "urgent", "thumbs_up", "open_palms"]);

// Approved transparent sprite sheets are not published yet; until the manifest
// flips to "ready" every pose resolves to the canonical bundled character so the
// app never requests a missing file.
const spritesReady = false;

export class SpriteAvatarDriver implements AvatarDriver {
  readonly name = "sprite" as const;
  getPose(renderState: AvatarRenderState) {
    if (!spritesReady) return fallbackAsset.url;
    const candidate = renderState.gesture && allowed.has(renderState.gesture) ? renderState.gesture : poseByState[renderState.state];
    return `/inai/poses/${candidate || "idle_seated"}.png`;
  }
  getMouth(openness: number) {
    if (!spritesReady) return "";
    const frame = openness <= 0.08 ? "mouth_closed" : openness < 0.28 ? "mouth_m" : openness < 0.48 ? "mouth_e" : openness < 0.68 ? "mouth_a" : openness < 0.86 ? "mouth_o" : "mouth_wide";
    return `/inai/mouths/${frame}.png`;
  }
}
