import type { ServiceDescriptor } from "./types";
export const serviceCatalog: ServiceDescriptor[] = [
  { name: "Vision detection", mode: "REAL", description: "Camera and local object detection" },
  { name: "Scene understanding", mode: "REAL", description: "Protected server-side AI interpretation" },
  { name: "Sound classification", mode: "REAL", description: "Browser audio pattern analysis" },
  { name: "Sound direction and distance", mode: "MOCK", description: "Seeded for this prototype" },
  { name: "Speech recognition", mode: "REAL", description: "Browser speech recognition where available" },
  { name: "Voice guidance", mode: "REAL", description: "Browser speech synthesis" },
  { name: "Validated ISL playback", mode: "REAL", description: "Registry playback after expert validation" },
  { name: "Arbitrary text-to-sign", mode: "FUTURE", description: "Not generated or improvised" },
  { name: "Device location", mode: "REAL", description: "Browser geolocation" },
  { name: "Indoor accessible places", mode: "MOCK", description: "Seeded prototype locations" },
  { name: "Emergency response", mode: "MOCK", description: "Simulated; no services are contacted" },
  { name: "Haptic alerts", mode: "REAL", description: "Device vibration when supported" },
  { name: "Demo Director", mode: "MOCK", description: "Scripted events, off by default" },
];
