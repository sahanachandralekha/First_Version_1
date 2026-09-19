import type { AvatarDriver, AvatarRenderState } from "../types";
export class ThreeAvatarDriver implements AvatarDriver {
  readonly name = "three" as const;
  getPose(_state: AvatarRenderState): string { throw new Error("Three GLB morph-target avatar driver is not implemented."); }
  getMouth(_openness: number): string { throw new Error("Three GLB morph-target avatar driver is not implemented."); }
}
