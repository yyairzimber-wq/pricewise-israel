import fs from "node:fs";
import readline from "node:readline";
import { Readable } from "node:stream";
import zlib from "node:zlib";
import { compactImage } from "../../src/core/services/offImage.ts";
import { SERVER_CONFIG } from "./config.ts";
import type { DB } from "./db.ts";

/**
 * Product photos for the whole catalog in one pass, from Open Food Facts' daily
 * CSV export (open data, CC-BY-SA) — instead of one API call per product, which
 * OFF rate-limits. We keep only products that exist in our price database.
 *
 * The result is saved to server/images.json (committed, like geocache.json) so
 * the cloud refresh can restore it without downloading 1.3 GB every run.
 */

export const OFF_DUMP_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz";
export const IMAGES_CACHE = "server/images.json";

export interface ImageSyncReport {
  scanned: number;
  matched: number;
  withPhoto: number;
}

export async function syncImagesFromDump(
  db: DB,
  opts: { source?: string; log?: (m: string) => void } = {},
): Promise<ImageSyncReport> {
  const log = opts.log ?? (() => {});
  const source = opts.source ?? OFF_DUMP_URL;
  const ours = new Set((db.prepare("SELECT barcode FROM products").all() as { barcode: string }[]).map((r) => r.barcode));
  // OFF stores some codes without leading zeros.
  const stripped = new Map<string, string>();
  for (const b of ours) stripped.set(b.replace(/^0+/, ""), b);

  let input: Readable;
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": SERVER_CONFIG.userAgent } });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    input = Readable.fromWeb(res.body as never);
  } else {
    input = fs.createReadStream(source);
  }
  const lines = readline.createInterface({ input: source.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input, crlfDelay: Infinity });

  let codeCol = -1;
  let frontCol = -1;
  const report: ImageSyncReport = { scanned: 0, matched: 0, withPhoto: 0 };
  const insert = db.prepare("INSERT OR REPLACE INTO product_images (barcode, url, checked_at) VALUES (?, ?, ?)");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for await (const line of lines) {
      if (codeCol < 0) {
        const header = line.split("\t");
        codeCol = header.indexOf("code");
        frontCol = header.indexOf("image_url");
        if (codeCol !== 0 || frontCol < 0) throw new Error("unexpected dump format (no code / image_url column)");
        continue;
      }
      if (++report.scanned % 500_000 === 0) log(`  ${(report.scanned / 1e6).toFixed(1)}M מוצרים נסרקו · ${report.withPhoto} תמונות`);
      const tab = line.indexOf("\t");
      const code = line.slice(0, tab);
      const barcode = ours.has(code) ? code : stripped.get(code.replace(/^0+/, ""));
      if (!barcode) continue;
      report.matched++;
      const url = line.split("\t")[frontCol];
      if (!url || !/^https:\/\/images\.openfoodfacts\.org\//.test(url)) continue;
      insert.run(barcode, compactImage(barcode, url), now);
      report.withPhoto++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return report;
}

export function exportImages(db: DB, file = IMAGES_CACHE): number {
  const rows = db.prepare("SELECT barcode, url FROM product_images WHERE url IS NOT NULL ORDER BY barcode").all() as { barcode: string; url: string }[];
  fs.writeFileSync(file, JSON.stringify(rows.map((r) => [r.barcode, r.url])));
  return rows.length;
}

export function importImages(db: DB, file = IMAGES_CACHE): number {
  if (!fs.existsSync(file)) return 0;
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as [string, string][];
  const insert = db.prepare("INSERT OR REPLACE INTO product_images (barcode, url, checked_at) VALUES (?, ?, ?)");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  for (const [barcode, url] of rows) insert.run(barcode, url, now);
  db.exec("COMMIT");
  return rows.length;
}
