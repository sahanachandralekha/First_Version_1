import type { DemoDirector } from "./contracts";
import type { NormalizedEvent } from "./events";
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const script: Array<Omit<NormalizedEvent, "id" | "timestamp">> = [
  { source: "vision", type: "stairs", message: "Stairs are about three metres ahead.", severity: "warn", proximity: 3, relevantNeeds: ["visual"] },
  { source: "audio", type: "siren", message: "A siren is detected nearby.", severity: "warn", relevantNeeds: ["hearing"] },
  { source: "speech", type: "transcript", message: "Your classroom has been moved to Block B.", severity: "notice", relevantNeeds: ["hearing"] },
  { source: "speech", type: "communication-request", message: "Communication support is ready.", severity: "notice", relevantNeeds: ["speech"] },
  { source: "emergency", type: "simulated-emergency", message: "The simulated emergency flow is ready.", severity: "critical" },
];
export class ScriptedDemoDirector implements DemoDirector {
  readonly name = "Demo Director"; readonly mode = "MOCK" as const;
  readonly description = "A clearly labelled, user-started demonstration sequence.";
  async *run() { for (const [index, event] of script.entries()) { if (index) await wait(1200); yield { ...event, id: `demo-${index}`, timestamp: Date.now() }; } }
}
