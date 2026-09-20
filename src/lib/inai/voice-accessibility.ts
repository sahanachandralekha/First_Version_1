/**
 * Voice accessibility utilities for spoken natural language parsing,
 * intent matching, and spoken email conversion.
 */

/**
 * Converts a spoken representation of an email address to a valid email string.
 * Handles spoken tokens:
 * - "at", "at the rate of", "at the rate", "at symbol", "at sign" -> "@"
 * - "dot", "period", "point", "full stop" -> "."
 * - "underscore", "under score" -> "_"
 * - "dash", "hyphen", "minus" -> "-"
 * - "plus" -> "+"
 *
 * Examples:
 * - "pranavi at gmail dot com" -> "pranavi@gmail.com"
 * - "pranavi dot s at gmail dot com" -> "pranavi.s@gmail.com"
 * - "test underscore user at outlook dot com" -> "test_user@outlook.com"
 * - "john dash smith at company dot co dot in" -> "john-smith@company.co.in"
 */
export function convertSpokenToEmail(spoken: string): string {
  if (!spoken) return "";

  let text = spoken.toLowerCase().trim();

  // Normalize punctuation and spoken symbols
  text = text
    .replace(/\bat the rate of\b/g, " @ ")
    .replace(/\bat the rate\b/g, " @ ")
    .replace(/\bat symbol\b/g, " @ ")
    .replace(/\bat sign\b/g, " @ ")
    .replace(/\bat\b/g, " @ ")
    .replace(/\bdot\b/g, " . ")
    .replace(/\bperiod\b/g, " . ")
    .replace(/\bfull stop\b/g, " . ")
    .replace(/\bpoint\b/g, " . ")
    .replace(/\bunderscore\b/g, " _ ")
    .replace(/\bunder score\b/g, " _ ")
    .replace(/\bhyphen\b/g, " - ")
    .replace(/\bdash\b/g, " - ")
    .replace(/\bminus\b/g, " - ")
    .replace(/\bplus\b/g, " + ");

  // Collapse spaces around symbols
  text = text
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s*_\s*/g, "_")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\+\s*/g, "+");

  // Fix common domain names if speech recognition inserted space inside domain or handle
  text = text
    .replace(/g\s+mail/g, "gmail")
    .replace(/out\s+look/g, "outlook")
    .replace(/hot\s+mail/g, "hotmail")
    .replace(/i\s+cloud/g, "icloud")
    .replace(/ya\s+hoo/g, "yahoo");

  // If there's an '@', remove remaining spaces inside username and domain parts
  if (text.includes("@")) {
    const parts = text.split("@");
    if (parts.length === 2) {
      const user = parts[0]!.replace(/\s+/g, "");
      const domain = parts[1]!.replace(/\s+/g, "");
      text = `${user}@${domain}`;
    }
  } else {
    // If no '@' recognized directly, remove all interior spaces
    text = text.replace(/\s+/g, "");
  }

  // Strip trailing punctuation often appended by STT (e.g., periods or commas)
  text = text.replace(/[.,?!]+$/, "");

  return text;
}

/**
 * Validates if the string has a standard email format.
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Natural language intent parser for answering "Are you visually impaired?".
 */
export function matchYesNoIntent(spoken: string): "yes" | "no" | "unclear" {
  if (!spoken) return "unclear";

  const clean = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();

  // Explicit positive intents
  const yesPatterns = [
    /^(yes|yeah|yep|yup|aye|sure|correct|right|true|i am|yes i am|yes i m|i m visually impaired|yes i am visually impaired|yes i m visually impaired|visually impaired|blind|low vision|partially sighted|i have visual impairment|i am blind|help me see|yes please|that's right|thats right)$/i,
    /\b(yes i am|yes i'm|i am visually impaired|i'm visually impaired|i need visual assistance|i have low vision|i am blind|yes please|correct)\b/i,
    /^(yes|yeah|yep|yup|i am|correct)\b/i,
  ];

  // Explicit negative intents
  const noPatterns = [
    /^(no|nope|nah|not really|i am not|i m not|no i am not|no i m not|no i am not visually impaired|no i m not visually impaired|not visually impaired|not blind|i can see|neither|no thanks|no please|negative)$/i,
    /\b(no i am not|no i'm not|not visually impaired|not blind|i can see normally|no thank you|no thanks)\b/i,
    /^(no|nope|nah|negative)\b/i,
  ];

  for (const pattern of yesPatterns) {
    if (pattern.test(clean)) return "yes";
  }

  for (const pattern of noPatterns) {
    if (pattern.test(clean)) return "no";
  }

  return "unclear";
}

/**
 * Natural language intent parser for Visually Impaired Mode options:
 * - TWO-WAY COMMUNICATION
 * - NAVIGATION GUIDE
 * - SOS
 */
export function matchVisuallyImpairedOption(spoken: string): "communication" | "navigation" | "sos" | "unclear" {
  if (!spoken) return "unclear";

  const clean = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();

  // SOS / Emergency
  if (
    /\b(sos|emergency|emergency help|urgent|danger|send sos|help me|i need emergency help|i need help|call for help|alert)\b/i.test(clean)
  ) {
    return "sos";
  }

  // Communication
  if (
    /\b(two-way communication|two way communication|two-way|two way|communication|communicate|start communication|i need communication|help me communicate|i want to communicate|camera communication|visual communication|talk to me|visual conversation|camera|video|inspect|conversation|two)\b/i.test(clean)
  ) {
    return "communication";
  }

  // Navigation
  if (
    /\b(navigation guide|navigation|navigate|start navigation|i need navigation|help me navigate|i want navigation|guide me|guide|directions|find path|walk|walking|path|guiding|where to go)\b/i.test(clean)
  ) {
    return "navigation";
  }

  return "unclear";
}

/**
 * Natural language intent parser for SOS confirmation response:
 * - YES / SEND
 * - NO / CANCEL
 */
export function matchSosConfirmationIntent(spoken: string): "confirm" | "cancel" | "unclear" {
  if (!spoken) return "unclear";

  const clean = spoken.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();

  if (/\b(yes|yeah|yep|send|send it|confirm|yes send|proceed|okay|sure|dispatch)\b/i.test(clean)) {
    return "confirm";
  }

  if (/\b(no|nope|cancel|don't send|dont send|stop|abort|wait|change email)\b/i.test(clean)) {
    return "cancel";
  }

  return "unclear";
}
