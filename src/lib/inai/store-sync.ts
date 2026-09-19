import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAccessibilityStore } from "@/stores/accessibility-store";

let started = false;
let timer: number | undefined;

/**
 * Persists accessibility profile/preferences/INAI settings to the cloud
 * whenever the store changes (debounced). Offline-tolerant by design.
 */
export function startStoreSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  const sync = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) return;
        const { profile, prefs, inai, onboarded } = useAccessibilityStore.getState();
        const payload = JSON.parse(JSON.stringify({ profile, prefs, inai })) as {
          profile: Json; prefs: Json; inai: Json;
        };
        await supabase.from("accessibility_preferences").upsert(
          {
            user_id: user.id,
            ...payload,
            onboarded,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      } catch {
        // Cloud sync is best-effort; the local store remains the source of truth.
      }
    }, 1500);
  };

  sync();
  useAccessibilityStore.subscribe(sync);
}
