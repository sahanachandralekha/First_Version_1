import inaiAvatarImg from "@/assets/inai-avatar.png";
import type { AvatarDriver, AvatarRenderState } from "../types";

const poseByState: Record<AvatarRenderState["state"], string> = {
  idle: "idle_seated", listening: "listening", thinking: "thinking", speaking: "speaking_neutral",
  warning: "concerned", emergency: "urgent", signing: "open_palms", guiding: "point_right",
};
const allowed = new Set(["idle_seated", "idle_standing", "wave", "listening", "thinking", "speaking_neutral", "point_right", "point_left", "stop_palm", "concerned", "urgent", "thumbs_up", "open_palms"]);

export class SpriteAvatarDriver implements AvatarDriver {
  readonly name = "sprite" as const;
  getPose(renderState: AvatarRenderState) {
    const candidate = renderState.gesture && allowed.has(renderState.gesture) ? renderState.gesture : poseByState[renderState.state];
    return `/inai/poses/${candidate || "idle_seated"}.png` || inaiAvatarImg;
  }
  getMouth(_openness: number) {
    return "";
  }
}

