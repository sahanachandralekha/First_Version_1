export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "warning" | "emergency" | "signing" | "guiding";
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "full";
export type AvatarDriverName = "sprite" | "rive" | "three";
export interface AvatarRenderState { state: AvatarState; gesture?: string; mouthOpenness: number; gaze?: "left" | "center" | "right"; size: AvatarSize; intensity: number; signSequence?: string[] }
export interface AvatarDriver { readonly name: AvatarDriverName; getPose(state: AvatarRenderState): string; getMouth(openness: number): string }
