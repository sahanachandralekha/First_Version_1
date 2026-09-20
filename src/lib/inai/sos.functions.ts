import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function getResendKey(): string {
  const envKey = process.env["RESEND_API_KEY"] || process.env["VITE_RESEND_API_KEY"];
  if (envKey && envKey.trim()) return envKey.trim();

  try {
    const envPath = resolve(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/RESEND_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {
    // ignore
  }
  return "";
}

function getFromAddress(): string {
  const envFrom = process.env["SOS_FROM_ADDRESS"] || process.env["VITE_SOS_FROM_ADDRESS"];
  if (envFrom && envFrom.trim()) return envFrom.trim();

  try {
    const envPath = resolve(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/SOS_FROM_ADDRESS\s*=\s*["']?([^"'\r\n]+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {
    // ignore
  }
  return "INAI Alerts <onboarding@resend.dev>";
}

/**
 * Check if the email service has an API key configured.
 */
export const checkEmailConfig = createServerFn({ method: "GET" })
  .handler(async () => {
    const apiKey = getResendKey();
    const from = getFromAddress();
    return {
      configured: Boolean(apiKey && apiKey.length > 0),
      from,
    };
  });

/**
 * Real SOS email delivery via Resend.
 *
 * The API key never leaves the server. The handler parses Resend's exact response
 * and surfaces any domain or recipient constraints back to the screen.
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
    const apiKey = getResendKey();
    if (!apiKey) {
      throw new Error(
        "Emergency email service is not configured. Please add RESEND_API_KEY to your .env file."
      );
    }

    const from = getFromAddress();
    const when = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "medium",
    });
    const hasLocation = data.latitude != null && data.longitude != null;
    const mapLink = hasLocation
      ? `https://www.google.com/maps/search/?api=1&query=${data.latitude},${data.longitude}`
      : null;

    const personName = data.name.trim() || "An INAI user";

    const locationBlockHtml = hasLocation
      ? `
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin:16px 0;">
          <p style="margin:0; font-weight:bold; color:#991b1b;">🚨 Emergency Location Detected:</p>
          <p style="margin:4px 0 8px 0; color:#374151; font-family:monospace; font-size:14px;">
            Coordinates: ${data.latitude}, ${data.longitude} ${data.accuracy ? `(±${Math.round(data.accuracy)} m)` : ""}
          </p>
          <a href="${mapLink}" style="display:inline-block; background:#dc2626; color:#ffffff; text-decoration:none; padding:8px 16px; border-radius:6px; font-weight:bold; font-size:13px;" target="_blank">
            📍 Open Location in Google Maps
          </a>
        </div>
      `
      : `
        <div style="background:#f3f4f6; border-radius:8px; padding:12px; margin:16px 0; color:#6b7280;">
          Location: GPS coordinates could not be retrieved from the device.
        </div>
      `;

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f9fafb; padding:20px; color:#111827;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; border:2px solid #ef4444; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <div style="background:#ef4444; color:#ffffff; padding:18px 24px;">
            <h1 style="margin:0; font-size:22px; font-weight:900; letter-spacing:0.5px;">🚨 URGENT SOS ALERT — INAI ACCESSIBILITY</h1>
          </div>
          <div style="padding:24px;">
            <p style="font-size:16px; line-height:1.5; margin:0 0 12px 0;">
              <strong>${personName}</strong> has triggered an emergency SOS alert from the INAI Accessibility application.
            </p>
            <p style="font-size:13px; color:#6b7280; margin:0 0 16px 0;">
              <strong>Time Sent:</strong> ${when} (IST)
            </p>
            ${locationBlockHtml}
            ${
              data.note
                ? `<div style="background:#f9fafb; border-left:4px solid #ef4444; padding:10px 14px; margin:14px 0; font-style:italic;">"${data.note}"</div>`
                : ""
            }
            <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; line-height:1.4;">
              <p style="margin:0;"><strong>Important Notice:</strong> INAI is an accessibility support application. If this is a life-threatening situation, please contact local emergency authorities (112 / 911 / police) directly.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `🚨 URGENT SOS ALERT — INAI ACCESSIBILITY

${personName} has triggered an emergency SOS alert.
Time: ${when}
${hasLocation ? `Location: ${data.latitude}, ${data.longitude}\nGoogle Maps: ${mapLink}` : "Location: Not available"}
${data.note ? `Message: ${data.note}\n` : ""}
Please verify and assist immediately.`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        from,
        to: [data.to.trim()],
        subject: `🚨 EMERGENCY SOS ALERT: ${personName} needs assistance`,
        html,
        text: textContent,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("SOS email failed:", response.status, detail);

      let parsedMessage = "";
      try {
        const parsed = JSON.parse(detail) as { message?: string };
        if (parsed.message) parsedMessage = parsed.message;
      } catch {
        parsedMessage = detail;
      }

      if (response.status === 403 || response.status === 422) {
        if (parsedMessage.toLowerCase().includes("testing emails")) {
          throw new Error(
            `Resend sandbox restriction: With 'onboarding@resend.dev', you can only send test emails to your registered Resend account email. (${parsedMessage})`
          );
        }
        throw new Error(parsedMessage || "The email provider rejected this recipient or sender address.");
      }

      if (response.status === 401) {
        throw new Error("Invalid RESEND_API_KEY. Please verify your API key in the .env file.");
      }

      throw new Error(parsedMessage || `Email dispatch failed with status ${response.status}.`);
    }

    const resJson = (await response.json().catch(() => ({}))) as { id?: string };

    return {
      sent: true as const,
      emailId: resJson.id || "",
      at: when,
      locationIncluded: hasLocation,
    };
  });
