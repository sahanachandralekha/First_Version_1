import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAccessibilityStore } from "@/stores/accessibility-store";

export async function saveAccessibilityPreferences() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { profile, prefs, inai, onboarded } = useAccessibilityStore.getState();
  const payload = JSON.parse(JSON.stringify({ profile, prefs, inai })) as {
    profile: Json;
    prefs: Json;
    inai: Json;
  };
  const { error } = await supabase.from("accessibility_preferences").upsert(
    {
      user_id: data.user.id,
      ...payload,
      onboarded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return !error;
}

export async function getRecentAssistanceEvents() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return [];
  const response = await supabase
    .from("assistance_events")
    .select("id,event_type,severity,payload,created_at")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false })
    .limit(3);
  if (response.error) return [];
  return response.data;
}