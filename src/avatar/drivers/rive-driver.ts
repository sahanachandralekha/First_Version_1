import type { AvatarDriver, AvatarRenderState } from "../types";
export class RiveAvatarDriver implements AvatarDriver {
  readonly name = "rive" as const;
  getPose(_state: AvatarRenderState): string { throw new Error("Rive avatar driver is not implemented."); }
  getMouth(_openness: number): string { throw new Error("Rive avatar driver is not implemented."); }
}
