import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Need = "visual" | "hearing" | "speech";
export type TextSize = "A" | "AA" | "AAA";
export type Contrast = "default" | "high";
export type AlertIntensity = "low" | "medium" | "high";

export interface AccessibilityProfile {
  visual: boolean;
  hearing: boolean;
  speech: boolean;
}

export interface AccessibilityPreferences {
  voiceEnabled: boolean;
  signEnabled: boolean;
  hapticEnabled: boolean;
  textSize: TextSize;
  contrast: Contrast;
  alertIntensity: AlertIntensity;
  language: string;
  reducedMotion: boolean;
}

export interface INAISettings {
  voiceId: string;
  speakingRate: number;
  pitch: number;
  signMode: "captions" | "isl";
  animationSpeed: 0.5 | 1;
  avatarVariant: "classic" | "calm" | "bright";
}

interface AccessibilityState {
  profile: AccessibilityProfile;
  prefs: AccessibilityPreferences;
  inai: INAISettings;
  onboarded: boolean;
  announcement: string;
  setNeed: (need: Need, active: boolean) => void;
  setProfile: (profile: AccessibilityProfile) => void;
  setPref: <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => void;
  setPreference: <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => void;
  setINAISetting: <K extends keyof INAISettings>(key: K, value: INAISettings[K]) => void;
  setOnboarded: (value: boolean) => void;
  reset: () => void;
  clearAnnouncement: () => void;
}

const defaultProfile: AccessibilityProfile = { visual: true, hearing: true, speech: false };
const defaultPrefs: AccessibilityPreferences = {
  voiceEnabled: true, signEnabled: false, hapticEnabled: true, textSize: "A",
  contrast: "default", alertIntensity: "medium", language: "en-IN", reducedMotion: false,
};
const defaultInai: INAISettings = {
  voiceId: "auto-en-IN", speakingRate: 1, pitch: 1, signMode: "captions",
  animationSpeed: 1, avatarVariant: "classic",
};

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      profile: defaultProfile,
      prefs: defaultPrefs,
      inai: defaultInai,
      onboarded: false,
      announcement: "",
      setNeed: (need, active) =>
        set((state) => ({
          profile: { ...state.profile, [need]: active },
          announcement: "I've updated your experience.",
        })),
      setProfile: (profile) => set({ profile, announcement: "I've updated your experience." }),
      setPref: (key, value) => set((state) => ({ prefs: { ...state.prefs, [key]: value } })),
      setPreference: (key, value) => set((state) => ({ prefs: { ...state.prefs, [key]: value } })),
      setINAISetting: (key, value) => set((state) => ({ inai: { ...state.inai, [key]: value } })),
      setOnboarded: (onboarded) => set({ onboarded }),
      reset: () => set({ profile: defaultProfile, prefs: defaultPrefs, inai: defaultInai, onboarded: false }),
      clearAnnouncement: () => set({ announcement: "" }),
    }),
    { name: "inai-accessibility", skipHydration: true },
  ),
);

export const selectedNeeds = (profile: AccessibilityProfile): Need[] =>
  (["visual", "hearing", "speech"] as const).filter((need) => profile[need]);
