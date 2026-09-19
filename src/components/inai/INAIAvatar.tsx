import { useMemo } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { createAvatarDriver } from "@/avatar/driver";
import type { AvatarRenderState, AvatarSize, AvatarState } from "@/avatar/types";
import { CaptionRegion } from "./CaptionRegion";
import avatarAsset from "@/assets/inai-avatar.png.asset.json";

interface INAIAvatarProps { state?: AvatarState; gesture?: string; mouthOpenness?: number; gaze?: AvatarRenderState["gaze"]; size?: AvatarSize; intensity?: number; signSequence?: string[]; speech?: string }
const sizeClasses: Record<AvatarSize, string> = { xs: "size-16", sm: "size-24", md: "size-40", lg: "size-60", full: "h-[52vh] w-full" };
const labels: Record<AvatarState, string> = { idle: "INAI is ready", listening: "INAI is listening", thinking: "INAI is thinking", speaking: "INAI is speaking", warning: "INAI is sharing a warning", emergency: "INAI is supporting an emergency flow", signing: "INAI is demonstrating a sign", guiding: "INAI is guiding you" };
export function INAIAvatar({ state = "idle", gesture, mouthOpenness = 0, gaze = "center", size = "md", intensity = 1, signSequence, speech = "" }: INAIAvatarProps) {
  const driver = useMemo(() => createAvatarDriver("sprite"), []);
  const renderState: AvatarRenderState = { state, mouthOpenness, gaze, size, intensity };
  if (gesture !== undefined) renderState.gesture = gesture;
  if (signSequence !== undefined) renderState.signSequence = signSequence;
  return <>
    <motion.div role="img" aria-label={labels[state]} className={`relative isolate overflow-hidden ${sizeClasses[size]}`} animate={{ scale: [1, 1.015, 1] }} transition={{ duration: 4, repeat: Infinity }}>
      <img className="absolute inset-0 size-full object-contain" src={avatarAsset.url} alt="" />
      {state === "speaking" && <span className="absolute bottom-4 left-1/2 size-3 -translate-x-1/2 animate-pulse rounded-full bg-live" aria-hidden="true" />}
    </motion.div>
    <CaptionRegion message={speech} critical={state === "warning" || state === "emergency"} />
  </>;
}
