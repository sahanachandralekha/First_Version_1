import type { AccessibilityProfile } from "@/stores/accessibility-store";
export interface NavItem { label: string; to: "/" | "/home" | "/vision" | "/map" | "/sound" | "/communicate" | "/inai" | "/profile"; icon: "home" | "assist" | "map" | "hearing" | "conversation" | "learn" | "mic" | "profile" }
export function resolveNavigation(profile: AccessibilityProfile): [NavItem, NavItem, NavItem, NavItem, NavItem] {
  const key = [profile.visual && "v", profile.hearing && "h", profile.speech && "s"].filter(Boolean).join("");
  const pairs: Record<string, [NavItem, NavItem]> = {
    v: [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Map", to: "/map", icon: "map" }],
    h: [{ label: "Hearing", to: "/sound", icon: "hearing" }, { label: "Learn", to: "/inai", icon: "learn" }],
    s: [{ label: "Conversation", to: "/communicate", icon: "conversation" }, { label: "Learn", to: "/inai", icon: "learn" }],
    vh: [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Map", to: "/map", icon: "map" }],
    vs: [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Communicate", to: "/communicate", icon: "conversation" }],
    hs: [{ label: "Hearing", to: "/sound", icon: "hearing" }, { label: "Communicate", to: "/communicate", icon: "conversation" }],
    vhs: [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Map", to: "/map", icon: "map" }],
    "": [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Map", to: "/map", icon: "map" }],
  };
  const fallbackPair: [NavItem, NavItem] = [{ label: "Assist", to: "/vision", icon: "assist" }, { label: "Map", to: "/map", icon: "map" }];
  const [second, fourth] = pairs[key] ?? fallbackPair;
  const micLabel = key === "s" || key === "hs" ? "Tap to Speak" : key === "vs" || key === "vhs" ? "Talk to INAI" : "INAI";
  return [
    { label: "Home", to: "/home", icon: "home" }, second,
    { label: micLabel, to: "/inai", icon: "mic" }, fourth,
    { label: "Profile", to: "/profile", icon: "profile" },
  ];
}
