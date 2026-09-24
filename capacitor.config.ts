import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells (Android now; iOS needs a Mac). The web build is bundled into
 * the app. Build it with `npm run build:native`, which reads .env.native — set
 * VITE_API_BASE_URL there to your deployed server (https://<domain>/pw-api).
 */
const config: CapacitorConfig = {
  appId: "il.pricewise.app",
  appName: "PriceWise",
  webDir: "dist",
  android: {
    // The app talks only to your HTTPS server.
    allowMixedContent: false,
  },
};

export default config;
