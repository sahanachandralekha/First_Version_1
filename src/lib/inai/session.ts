import { supabase } from "@/integrations/supabase/client";

let ensured: Promise<void> | null = null;

/**
 * Guarantees a cloud session on first load so the demo is never blocked by a
 * login wall: reuses an existing session, otherwise signs in anonymously.
 * Browser-only (call from a client effect).
 */
export function ensureAnonymousSession(): Promise<void> {
  ensured ??= (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (error) {
      console.warn("INAI is running without a cloud session.", error);
      ensured = null;
    }
  })();
  return ensured;
}

export function currentUser() {
  return supabase.auth.getUser();
}
