import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor Configuration for Native Android Packaging
 * Enables bundling the INAI Vision Board into a native Android APK
 * with native Camera, Microphone, and Audio permissions.
 */
const config: CapacitorConfig = {
  appId: "com.inai.vision",
  appName: "INAI Vision Board",
  webDir: ".output/public",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
