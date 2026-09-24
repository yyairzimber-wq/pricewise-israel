import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { CHAIN_NAMES } from "./config.ts";
import type { DB } from "./db.ts";
import { clientIp, RateLimiter } from "./ratelimit.ts";
import { RecognitionUnavailable, recognitionConfigured, recognizeImage, Anthropic } from "./recognize.ts";
import { barcodeFromId, branches, history, productByBarcode, quotesFor, searchProducts, status } from "./repo.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Human-readable landing page, so opening the server in a browser shows something useful. */
function statusPage(s: ReturnType<typeof status>): string {
  const c = s.counts as Record<string, number>;
  const fmt = (n: number) => Number(n ?? 0).toLocaleString("he-IL");
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—");
  const rows = (s.files as Record<string, string | number>[])
    .filter((f) => f.kind !== "stores")
    .map((f) => `<tr><td>${esc(CHAIN_NAMES[String(f.chain_id)] ?? f.chain_id)}</td><td>${f.kind === "pricefull" ? "מחירים" : "מבצעים"}</td><td>${fmt(Number(f.files))}</td><td>${fmt(Number(f.rows))}</td><td>${esc(when(String(f.latest)))}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PriceWise API</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#111;background:#f5f6f8}h1{margin:0 0 4px}p{color:#555}
.k{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.k div{background:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 1px 3px #0001}.k b{display:block;font-size:22px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px #0001}td,th{padding:8px 12px;text-align:start;border-bottom:1px solid #eee;font-size:14px}th{color:#777;font-weight:600}
code{background:#e9ecf1;padding:1px 6px;border-radius:6px}@media(prefers-color-scheme:dark){body{background:#0b0c0f;color:#eee}.k div,table{background:#16171c}td,th{border-color:#2a2c33}p{color:#aaa}code{background:#23262e}}</style></head><body>
<h1>✓ שרת המחירים של PriceWise פועל</h1><p>נתונים מקובצי שקיפות המחירים של הרשתות. חברו את האפליקציה: הגדרות ← מקור נתונים ← שרת מחירים ← <code>http://localhost:8787</code></p>
<div class="k"><div><b>${fmt(c.products)}</b>מוצרים</div><div><b>${fmt(c.prices)}</b>מחירים</div><div><b>${fmt(c.promos)}</b>מבצעים</div><div><b>${fmt(c.stores)}</b>סניפים (${fmt(c.geocodedStores)} עם מיקום)</div></div>
<table><tr><th>רשת</th><th>סוג</th><th>קבצים</th><th>שורות</th><th>קובץ אחרון</th></tr>${rows}</table>
<p>נקודות קצה: <code>/products?barcode=</code> · <code>/products?q=</code> · <code>/prices?barcode=</code> · <code>/branches?lat=&amp;lng=</code> · <code>/status</code></p></body></html>`;
}

/** Implements the contract in docs/API.md. Read-only; ingestion runs separately. */
type Send = (status: number, body: unknown, maxAge?: number) => void;

// AI calls cost money: 20 photos per IP per hour. Everything else: 300 requests per IP per minute.
const aiLimiter = new RateLimiter(20, 3_600_000);
const apiLimiter = new RateLimiter(300, 60_000);

async function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleRecognize(req: http.IncomingMessage, _res: http.ServerResponse, send: Send) {
  if (!recognitionConfigured()) return send(503, { error: "AI recognition is not configured on this server (set ANTHROPIC_API_KEY)" });
  let body: { image?: string; mediaType?: string };
  try {
    body = JSON.parse(await readBody(req, 9_000_000));
  } catch {
    return send(413, { error: "invalid or oversized image" });
  }
  if (!body.image) return send(400, { error: "missing image" });
  try {
    const candidates = await recognizeImage(body.image, body.mediaType === "image/png" ? "image/png" : "image/jpeg");
    return send(200, { candidates });
  } catch (e) {
    if (e instanceof RecognitionUnavailable) return send(503, { error: "AI recognition is not configured" });
    if (e instanceof Anthropic.RateLimitError) return send(429, { error: "rate limited" });
    if (e instanceof Anthropic.AuthenticationError) return send(503, { error: "AI credentials were rejected" });
    if (e instanceof Anthropic.APIError) return send(502, { error: "recognition service error" });
    console.error(e);
    return send(500, { error: "internal error" });
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".json": "application/json",
};

/** Hash-routed SPA: "/" → index.html, everything else must be a real file under dist/. */
function serveStatic(dir: string, pathname: string, res: http.ServerResponse): boolean {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(dir, rel);
  if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const immutable = rel.startsWith("assets/");
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  fs.createReadStream(file).pipe(res);
  return true;
}

export function createApiServer(db: DB, opts: { corsOrigin?: string; staticDir?: string } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown, maxAge = 0) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": opts.corsOrigin ?? "*",
        "Cache-Control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      });
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": opts.corsOrigin ?? "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      return res.end();
    }

    // The app calls the API under /pw-api (same origin in production and in phone
    // dev mode); plain paths keep working for direct use.
    const isApiPrefixed = url.pathname === "/pw-api" || url.pathname.startsWith("/pw-api/");
    const apiPath = (isApiPrefixed ? url.pathname.slice(7) : url.pathname).replace(/\/+$/, "") || "/";

    const ip = clientIp(req.headers, req.socket.remoteAddress);
    const tooMany = (wait: number) => {
      res.setHeader("Retry-After", String(wait));
      return send(429, { error: "too many requests, try again later" });
    };

    if (req.method === "POST" && apiPath === "/recognize") {
      const wait = aiLimiter.check(ip);
      if (wait) return tooMany(wait);
      return handleRecognize(req, res, send);
    }
    if (isApiPrefixed || !opts.staticDir) {
      const wait = apiLimiter.check(ip);
      if (wait) return tooMany(wait);
    }
    if (req.method !== "GET") return send(405, { error: "GET only" });

    // Serve the built app (npm run build → dist/) for non-API paths, if present.
    if (!isApiPrefixed && opts.staticDir && serveStatic(opts.staticDir, url.pathname, res)) return;

    const p = url.searchParams;
    const list = (k: string) => p.get(k)?.split(",").map((s) => s.trim()).filter(Boolean) || undefined;
    const numParam = (k: string) => (p.get(k) != null && p.get(k) !== "" ? Number(p.get(k)) : undefined);

    try {
      const path = apiPath;

      if (path === "/health" || path === "/status") return send(200, { ok: true, ai: recognitionConfigured(), ...status(db) });

      if (path === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(statusPage(status(db)));
      }

      if (path === "/products") {
        const barcode = p.get("barcode");
        if (barcode) {
          const product = await productByBarcode(db, barcode.trim());
          return product ? send(200, product, 300) : send(404, { error: "not found" });
        }
        return send(200, searchProducts(db, p.get("q") ?? "", numParam("limit") ?? 20), 60);
      }

      const productMatch = path.match(/^\/products\/(.+)$/);
      if (productMatch) {
        const barcode = barcodeFromId(decodeURIComponent(productMatch[1]));
        const product = barcode ? await productByBarcode(db, barcode) : null;
        return product ? send(200, product, 300) : send(404, { error: "not found" });
      }

      if (path === "/prices") {
        const barcode = p.get("barcode") ?? barcodeFromId(p.get("productId"));
        if (!barcode) return send(200, []); // e.g. a demo product id: we have no real prices for it
        const productId = p.get("productId") ?? `api:${barcode}`;
        const branchIds = list("branchIds");
        if (branchIds) return send(200, branchIds.slice(0, 100).flatMap((branchId) => quotesFor(db, barcode, { branchId, productId })), 60);
        return send(200, quotesFor(db, barcode, { chains: list("chains"), branchId: p.get("branchId") ?? undefined, productId }), 60);
      }

      if (path === "/prices/history") {
        const barcode = barcodeFromId(p.get("productId")) ?? p.get("barcode");
        const chainId = p.get("chainId");
        if (!barcode || !chainId) return send(400, { error: "productId and chainId are required" });
        return send(200, history(db, barcode, chainId, Math.min(numParam("days") ?? 30, 365)), 300);
      }

      if (path === "/branches") {
        return send(200, branches(db, { lat: numParam("lat"), lng: numParam("lng"), radiusKm: numParam("radiusKm"), chains: list("chains"), limit: numParam("limit") }), 300);
      }

      return send(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      return send(500, { error: "internal error" });
    }
  });
}
