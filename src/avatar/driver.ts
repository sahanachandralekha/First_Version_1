import { RiveAvatarDriver } from "./drivers/rive-driver";
import { SpriteAvatarDriver } from "./drivers/sprite-driver";
import { ThreeAvatarDriver } from "./drivers/three-driver";
import type { AvatarDriver, AvatarDriverName } from "./types";
export function createAvatarDriver(name = (import.meta.env["VITE_AVATAR_DRIVER"] ?? "sprite") as AvatarDriverName): AvatarDriver {
  if (name === "rive") return new RiveAvatarDriver();
  if (name === "three") return new ThreeAvatarDriver();
  return new SpriteAvatarDriver();
}
