/**
 * Vercel Function: POST /api/recognize — photo of a product → candidates.
 * Bundled by server/src/publish.ts (esbuild) into the static deployment, so the
 * public link can offer "צלם מוצר". Uses the same recognition code as the price
 * server (server/src/recognize.ts). ANTHROPIC_API_KEY lives only in Vercel's
 * environment settings; visitors never see it.
 *
 * Abuse guard: a public link means anyone can call this, and each call costs
 * money. Per-IP limits here (best effort — each function instance keeps its own
 * counters), plus a hard monthly spend limit you set in the Anthropic console.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { RateLimiter } from "../server/src/ratelimit.ts";
import { recognitionConfigured, recognizeImage } from "../server/src/recognize.ts";

const perHour = new RateLimiter(12, 3_600_000);
const perMinute = new RateLimiter(4, 60_000);

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<{ image?: string; mediaType?: string }> {
  if (req.body && typeof req.body === "object") return req.body as never; // already parsed by the platform
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4_000_000) throw new Error("too large");
  }
  return JSON.parse(raw || "{}");
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!recognitionConfigured()) return send(res, 503, { error: "AI recognition is not configured" });

  // Vercel sets x-forwarded-for; the first entry is the client as seen by Vercel's edge.
  const ip = String(req.headers["x-real-ip"] ?? req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
  const wait = perMinute.check(ip) || perHour.check(ip);
  if (wait) {
    res.setHeader("Retry-After", String(wait));
    return send(res, 429, { error: "too many photos, try again later" });
  }

  let body: { image?: string; mediaType?: string };
  try {
    body = await readBody(req);
  } catch {
    return send(res, 413, { error: "image too large" });
  }
  if (!body.image || body.image.length > 4_000_000) return send(res, 400, { error: "missing or oversized image" });

  try {
    const candidates = await recognizeImage(body.image, body.mediaType === "image/png" ? "image/png" : "image/jpeg");
    return send(res, 200, { candidates });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) return send(res, 503, { error: "AI credentials were rejected" });
    if (status === 429) return send(res, 429, { error: "AI service is busy, try again" });
    console.error(e);
    return send(res, 502, { error: "recognition failed" });
  }
}
