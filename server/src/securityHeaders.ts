/**
 * Security headers for everything we serve (the Vercel site and the price
 * server's own static files).
 *
 * The Content-Security-Policy is deliberately tight: scripts only from our own
 * files (plus the OCR engine's CDN and WebAssembly), data only from the hosts the
 * app really talks to, nothing can frame the app, no plugins. If the app ever
 * needs a new host, add it here — a blocked request shows up in the browser
 * console as a CSP violation.
 */

export const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  // Camera for photo/barcode, location for "nearby" — nothing else.
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
};

export interface CspOptions {
  /** Extra hosts the app may fetch from (price snapshot host, custom API…). */
  connect?: string[];
}

export function contentSecurityPolicy(opts: CspOptions = {}): string {
  const connect = ["'self'", "https://world.openfoodfacts.org", "https://cdn.jsdelivr.net", "https://tessdata.projectnaptha.com", ...(opts.connect ?? [])];
  return [
    "default-src 'self'",
    // tesseract.js starts its OCR worker from a blob and loads its core from jsDelivr; the core needs WebAssembly.
    "script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    `connect-src ${[...new Set(connect)].join(" ")}`,
    "img-src 'self' data: blob: https://images.openfoodfacts.org",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** The origin of a URL ("https://x.github.io/app/data" → "https://x.github.io"), or null for relative/invalid ones. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return /^https?:/.test(url) ? new URL(url).origin : null;
  } catch {
    return null;
  }
}
