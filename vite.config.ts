import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * `npm run dev`        → http://localhost:5197 (desktop)
 * `npm run dev:phone`  → https://<your-LAN-IP>:5197 for phones on the same Wi-Fi.
 *   HTTPS is required for the camera (barcode/photo) on phones; the certificate
 *   is self-signed, so the phone shows a one-time warning to accept.
 *
 * `/pw-api/*` is proxied to the price server on this computer, so the phone
 * never needs to reach "localhost" itself (which would be the phone).
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "phone" ? [basicSsl({ name: "pricewise-dev" })] : [])],
  // Relative base so the build also works inside Capacitor (iOS / Android WebView).
  base: "./",
  server: {
    port: 5197,
    host: true,
    proxy: {
      "/pw-api": {
        target: process.env.PRICEWISE_API ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pw-api/, ""),
      },
    },
  },
}));
