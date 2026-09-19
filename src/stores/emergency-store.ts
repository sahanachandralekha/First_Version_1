import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EmergencyState {
  /** Address the SOS alert is sent to. Saved on this device. */
  contactEmail: string;
  contactName: string;
  setContactEmail: (email: string) => void;
  setContactName: (name: string) => void;
}

export const useEmergencyStore = create<EmergencyState>()(
  persist(
    (set) => ({
      contactEmail: "",
      contactName: "",
      setContactEmail: (contactEmail) => set({ contactEmail }),
      setContactName: (contactName) => set({ contactName }),
    }),
    { name: "inai-emergency" },
  ),
);
