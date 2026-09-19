import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface DispatchResult {
  dispatched: boolean;
  to: string | null;
  reason: string;
}

const inputSchema = z.object({
  location: z.string().max(200).default(""),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  needs: z.object({ visual: z.boolean(), hearing: z.boolean(), speech: z.boolean() }),
  note: z.string().max(500).default(""),
});

/**
 * Sends a real email alert to the configured campus security address.
 * The address comes from the person's own settings first, then the
 * project-wide CAMPUS_SECURITY_EMAIL. Without a mail key or address the
 * activation is still logged and the UI says plainly that nobody was emailed.
 */
export const dispatchEmergencyAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    const { supabase, userId } = context;

    const { data: settingsRow } = await supabase
      .from("inai_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
    const personal = typeof settings["securityEmail"] === "string" ? (settings["securityEmail"] as string).trim() : "";
    const to = personal || process.env["CAMPUS_SECURITY_EMAIL"]?.trim() || "";
    const apiKey = process.env["RESEND_API_KEY"];

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const name = profileRow?.display_name?.trim() || "An INAI user";

    const needsList = [
      data.needs.visual ? "visual support" : null,
      data.needs.hearing ? "hearing support" : null,
      data.needs.speech ? "speech support" : null,
    ].filter(Boolean).join(", ") || "not specified";

    const mapLink = data.latitude !== null && data.longitude !== null
      ? `https://www.google.com/maps?q=${data.latitude},${data.longitude}`
      : null;

    let result: DispatchResult;

    if (!to) {
      result = { dispatched: false, to: null, reason: "No campus security email is set yet. Add one in Emergency settings." };
    } else if (!apiKey) {
      result = { dispatched: false, to, reason: "Email sending is not configured yet, so no message was sent." };
    } else {
      const body = [
        `${name} has activated emergency help in INAI.`,
        `Time: ${new Date().toISOString()}`,
        `Location: ${data.location || "not available"}`,
        mapLink ? `Map: ${mapLink}` : null,
        `Assistance needs: ${needsList}`,
        data.note ? `Note: ${data.note}` : null,
        "",
        "This alert was sent automatically by the INAI accessibility companion.",
      ].filter(Boolean).join("\n");

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            from: process.env["EMERGENCY_FROM_EMAIL"]?.trim() || "INAI Alerts <onboarding@resend.dev>",
            to: [to],
            subject: `URGENT: ${name} needs help — INAI emergency alert`,
            text: body,
          }),
        });
        if (response.ok) {
          result = { dispatched: true, to, reason: `Alert emailed to ${to}.` };
        } else {
          const detail = await response.text();
          console.error("[INAI] emergency email failed", response.status, detail);
          result = { dispatched: false, to, reason: "The alert email could not be delivered. Please call for help directly." };
        }
      } catch (error) {
        console.error("[INAI] emergency email error", error);
        result = { dispatched: false, to, reason: "The alert email could not be delivered. Please call for help directly." };
      }
    }

    await supabase.from("emergency_events").insert({
      user_id: userId,
      kind: "activated",
      is_simulated: !result.dispatched,
      payload: {
        location: data.location,
        latitude: data.latitude,
        longitude: data.longitude,
        needs: data.needs,
        notified_email: result.to,
        dispatched: result.dispatched,
        reason: result.reason,
      },
    });

    return result;
  });

/** Saves the campus security address the alert should go to. */
export const saveSecurityEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().email().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("inai_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle();
    const settings = { ...((existing?.settings ?? {}) as Record<string, unknown>), securityEmail: data.email };
    const { error } = await supabase
      .from("inai_settings")
      .upsert({ user_id: userId, settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error("Could not save that address. Please try again.");
    return { email: data.email };
  });
