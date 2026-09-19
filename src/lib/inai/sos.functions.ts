import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Real SOS email delivery.
 *
 * The API key never leaves the server. The handler reports the provider's own
 * failure back to the screen, so the UI can only show success when the email
 * provider actually accepted the message.
 */
export const sendSosEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      to: z.string().email(),
      name: z.string().max(120).default(""),
      latitude: z.number().nullable().default(null),
      longitude: z.number().nullable().default(null),
      accuracy: z.number().nullable().default(null),
      note: z.string().max(500).default(""),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) throw new Error("Emergency email is not configured yet.");
    const from = process.env["SOS_FROM_ADDRESS"] || "INAI Alerts <onboarding@resend.dev>";

    const when = new Date().toUTCString();
    const hasLocation = data.latitude != null && data.longitude != null;
    const mapLink = hasLocation
      ? `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`
      : null;

    const locationBlock = hasLocation
      ? `<p><strong>Location:</strong> ${data.latitude}, ${data.longitude}${data.accuracy ? ` (accurate to about ${Math.round(data.accuracy)} m)` : ""}<br/>
         <a href="${mapLink}">Open this location on a map</a></p>`
      : `<p><strong>Location:</strong> could not be obtained on the person's device.</p>`;

    const html = `
      <h2>Emergency SOS Alert</h2>
      <p>${data.name ? `${data.name} has` : "A person using INAI has"} triggered an emergency SOS alert from the INAI accessibility app.</p>
      <p><strong>Time of alert:</strong> ${when}</p>
      ${locationBlock}
      ${data.note ? `<p><strong>Message:</strong> ${data.note}</p>` : ""}
      <p>INAI cannot contact emergency services. Please check on this person or pass this on to the right responder.</p>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [data.to],
        subject: "Emergency SOS Alert",
        html,
        text: `Emergency SOS Alert\n\nTime: ${when}\n${hasLocation ? `Location: ${data.latitude}, ${data.longitude}\n${mapLink}` : "Location could not be obtained."}\n${data.note}`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("SOS email failed", response.status, detail.slice(0, 300));
      if (response.status === 403 || response.status === 422) {
        throw new Error("The email provider rejected this address. Please verify your sending domain.");
      }
      throw new Error("The email could not be sent just now.");
    }

    return { sent: true as const, at: when, locationIncluded: hasLocation };
  });
