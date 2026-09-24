import { SERVER_CONFIG } from "./config.ts";
import type { DB } from "./db.ts";

/**
 * Product photos from Open Food Facts (open data, CC-BY-SA). Coverage of
 * Israeli products is limited (~8% of popular items in a 2026-09 sample), so
 * this only fills in what exists; the app falls back to a category emoji.
 * Chains' own product photos are not used: we don't have rights to them.
 *
 * Lookups are cached (including "no photo") for 30 days and fetched politely:
 * at most 4 at a time, in the background, never blocking a search response.
 */

const RECHECK_MS = 30 * 86_400_000;
const inFlight = new Set<string>();
const queue: string[] = [];
let active = 0;

export function cachedImages(db: DB, barcodes: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!barcodes.length) return out;
  const rows = db
    .prepare(`SELECT barcode, url FROM product_images WHERE url IS NOT NULL AND barcode IN (${barcodes.map(() => "?").join(",")})`)
    .all(...barcodes) as { barcode: string; url: string }[];
  for (const r of rows) out.set(r.barcode, r.url);
  return out;
}

function needsCheck(db: DB, barcode: string): boolean {
  const row = db.prepare("SELECT checked_at FROM product_images WHERE barcode = ?").get(barcode) as { checked_at: string } | undefined;
  return !row || Date.now() - Date.parse(row.checked_at) > RECHECK_MS;
}

async function fetchOne(db: DB, barcode: string): Promise<string | null> {
  let url: string | null = null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=image_front_small_url,image_front_url`, {
      headers: { "User-Agent": SERVER_CONFIG.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status === 404) {
      const j = (await res.json().catch(() => ({}))) as { product?: { image_front_small_url?: string; image_front_url?: string } };
      url = j.product?.image_front_url || j.product?.image_front_small_url || null;
      db.prepare("INSERT OR REPLACE INTO product_images (barcode, url, checked_at) VALUES (?, ?, ?)").run(barcode, url, new Date().toISOString());
    }
  } catch {
    // network hiccup: don't record, try again next time
  }
  return url;
}

function pump(db: DB) {
  while (active < 4 && queue.length) {
    const barcode = queue.shift()!;
    active++;
    fetchOne(db, barcode).finally(() => {
      active--;
      inFlight.delete(barcode);
      pump(db);
    });
  }
}

/** Queue background lookups for barcodes we haven't checked recently. */
export function warmImages(db: DB, barcodes: string[]) {
  for (const b of barcodes) {
    if (inFlight.has(b) || queue.length > 500 || !needsCheck(db, b)) continue;
    inFlight.add(b);
    queue.push(b);
  }
  pump(db);
}

/** For a single product page it's worth waiting briefly for the photo. */
export async function imageFor(db: DB, barcode: string): Promise<string | null> {
  const cached = cachedImages(db, [barcode]).get(barcode);
  if (cached) return cached;
  if (!needsCheck(db, barcode)) return null;
  return fetchOne(db, barcode);
}
