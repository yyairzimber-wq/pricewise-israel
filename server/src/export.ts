import fs from "node:fs";
import path from "node:path";
import { chainQuote, cleanManufacturer, guessCategory, parseSize, type StorePrice, type StorePromo } from "./aggregate.ts";
import { CHAIN_NAMES, SOURCES } from "./config.ts";
import type { DB } from "./db.ts";

/**
 * Static snapshot of the whole price database, for hosting on a static CDN
 * (Vercel) where no server or database runs. Compact by design — Vercel Hobby
 * allows 100 MB and 15,000 files per deployment:
 *
 *   data/meta.json            chains, generation time, counts, enum tables
 *   data/branches.json        every branch that has prices (per-chain order = store index)
 *   data/search-0.json        [barcode, name, brand, chainCount, cat, sizeAmount, sizeUnit][] (2+ chains)
 *   data/search-1.json        same, single-chain products (loaded on demand)
 *   data/p/<000-999>.json     products + quotes, sharded by the barcode's last 3 digits
 *
 * A quote is the chain-level price (most common across its branches) plus, per
 * chain, only the branches that DIFFER from it and which branches carry the
 * item — enough to reconstruct any branch's own price on the client.
 * Format version is in meta.json; the client checks it.
 */

export const STATIC_FORMAT = 2;
const UNITS = ["g", "kg", "ml", "l", "unit"] as const;
const CATEGORIES = ["dairy", "bakery", "breakfast", "drinks", "snacks", "pantry", "produce", "meat", "frozen", "cleaning", "personal-care", "baby", "other"] as const;

/** [3, 5, 9] → [3, 2, 4] — smaller numbers, smaller JSON. */
function deltas(sorted: number[]): number[] {
  return sorted.map((v, i) => (i === 0 ? v : v - sorted[i - 1]));
}

const minutes = (iso: string | null | undefined) => (iso ? Math.round(Date.parse(iso) / 60_000) : 0);

export interface ExportReport {
  products: number;
  pairs: number;
  shards: number;
  bytes: number;
  ms: number;
}

export function exportStatic(db: DB, outDir: string, log: (m: string) => void): ExportReport {
  const t0 = Date.now();
  const dataDir = path.join(outDir, "data");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir, "p"), { recursive: true });
  let bytes = 0;
  const write = (rel: string, value: unknown) => {
    const s = JSON.stringify(value);
    bytes += Buffer.byteLength(s);
    fs.writeFileSync(path.join(dataDir, rel), s);
  };

  // --- chains and their branch universes (stores that published prices) ---
  const chainIds = SOURCES.map((s) => s.chainId);
  const chainIdx = new Map(chainIds.map((c, i) => [c, i]));
  const storeRows = db
    .prepare(
      `SELECT s.chain_id, s.store_id, s.name, s.address, s.city, s.lat, s.lng, s.geo_precision
       FROM stores s WHERE EXISTS (SELECT 1 FROM prices p WHERE p.chain_id = s.chain_id AND p.store_id = s.store_id)
       ORDER BY s.chain_id, CAST(s.store_id AS INTEGER)`,
    )
    .all() as { chain_id: string; store_id: string; name: string; address: string | null; city: string | null; lat: number | null; lng: number | null; geo_precision: string | null }[];
  const storeIdx = new Map<string, Map<string, number>>(); // chain → store → index
  const branchesOut: unknown[][] = chainIds.map(() => []);
  for (const r of storeRows) {
    const ci = chainIdx.get(r.chain_id);
    if (ci == null) continue;
    const m = storeIdx.get(r.chain_id) ?? new Map<string, number>();
    m.set(r.store_id, m.size);
    storeIdx.set(r.chain_id, m);
    branchesOut[ci].push([r.store_id, r.name, r.address ?? "", r.city ?? "", r.lat == null ? 0 : Number(r.lat.toFixed(5)), r.lng == null ? 0 : Number(r.lng.toFixed(5)), r.geo_precision === "city" ? 1 : 0]);
  }
  write("branches.json", branchesOut);

  // --- products ---
  const products = new Map<string, { name: string; manufacturer: string | null; unit_qty: string | null; quantity: number | null; is_weighted: number; chain_count: number }>();
  for (const r of db.prepare("SELECT barcode, name, manufacturer, unit_qty, quantity, is_weighted, chain_count FROM products").iterate() as Iterable<Record<string, unknown>>) {
    products.set(String(r.barcode), r as never);
  }
  const images = new Map<string, string>();
  for (const r of db.prepare("SELECT barcode, url FROM product_images WHERE url IS NOT NULL").iterate() as Iterable<{ barcode: string; url: string }>) images.set(r.barcode, r.url);

  // --- promos per (barcode, chain), via index order ---
  const promoIter = (
    db
      .prepare(
        `SELECT i.barcode, i.chain_id, p.store_id, p.promo_id, p.description, p.scope, p.club_label, p.min_qty, p.unit_price, p.total_price, p.ends_at
         FROM promo_items i JOIN promos p USING (chain_id, store_id, promo_id)
         ORDER BY i.barcode, i.chain_id`,
      )
      .iterate() as Iterable<Record<string, unknown>>
  )[Symbol.iterator]();
  let nextPromo = promoIter.next();
  const promosFor = (barcode: string): Map<string, StorePromo[]> => {
    const out = new Map<string, StorePromo[]>();
    while (!nextPromo.done && String(nextPromo.value.barcode) < barcode) nextPromo = promoIter.next();
    while (!nextPromo.done && String(nextPromo.value.barcode) === barcode) {
      const r = nextPromo.value;
      const list = out.get(String(r.chain_id)) ?? [];
      list.push({
        storeId: String(r.store_id),
        promoId: String(r.promo_id),
        description: String(r.description ?? ""),
        scope: r.scope as "all" | "club",
        clubLabel: (r.club_label as string) ?? null,
        minQty: Number(r.min_qty),
        unitPrice: Number(r.unit_price),
        totalPrice: Number(r.total_price),
        endsAt: (r.ends_at as string) ?? null,
      });
      out.set(String(r.chain_id), list);
      nextPromo = promoIter.next();
    }
    return out;
  };

  // --- walk prices grouped by barcode ---
  const shards: Record<string, unknown[]>[] = Array.from({ length: 1000 }, () => ({}));
  const search: unknown[][] = [];
  let pairs = 0;
  let productCount = 0;

  const flush = (barcode: string, rows: { chain: string; store: string; price: number; at: string }[]) => {
    const meta = products.get(barcode);
    if (!meta) return;
    const byChain = new Map<string, StorePrice[]>();
    for (const r of rows) {
      const list = byChain.get(r.chain) ?? [];
      list.push({ storeId: r.store, price: r.price, filePublishedAt: r.at, priceChangedAt: null });
      byChain.set(r.chain, list);
    }
    const promos = promosFor(barcode);
    const quotes: unknown[] = [];
    for (const [chain, prices] of byChain) {
      const ci = chainIdx.get(chain);
      const src = SOURCES[ci ?? -1];
      if (ci == null || !src) continue;
      const q = chainQuote(`api:${barcode}`, prices, promos.get(chain) ?? [], { chainId: chain, chainName: CHAIN_NAMES[chain], portalUrl: src.portalUrl });
      if (!q || q.regular == null) continue;
      const universe = storeIdx.get(chain) ?? new Map<string, number>();
      const carriers = prices.map((p) => universe.get(p.storeId)).filter((i): i is number => i != null).sort((a, b) => a - b);
      const sharing = prices.filter((p) => p.price === q.regular).length;
      // Presence: 0 = all branches, [1, …] = only these, [2, …] = all except these
      // (whichever is shorter). Indices are delta-encoded.
      let presence: unknown = 0;
      if (carriers.length < universe.size) {
        const carrierSet = new Set(carriers);
        const absent = [...universe.values()].filter((i) => !carrierSet.has(i));
        presence = absent.length < carriers.length ? [2, ...deltas(absent)] : [1, ...deltas(carriers)];
      }
      // Branches whose price differs from the chain price, grouped by price:
      // [[price, …delta-encoded branch indices], …]
      const byPrice = new Map<number, number[]>();
      for (const p of prices) {
        const i = universe.get(p.storeId);
        if (i == null || p.price === q.regular) continue;
        byPrice.set(p.price, [...(byPrice.get(p.price) ?? []), i]);
      }
      const exceptions = [...byPrice.entries()].map(([price, idx]) => [price, ...deltas(idx.sort((a, b) => a - b))]);
      quotes.push([
        ci,
        q.regular,
        minutes(q.updatedAt),
        sharing,
        prices.length,
        q.promo ? [q.promo.unitPrice, q.promo.minQuantity ?? 1, Number(q.promo.label.match(/ב-([\d.]+)/)?.[1] ?? q.promo.unitPrice), minutes(q.promo.validUntil)] : 0,
        q.club ? [q.club.unitPrice, q.club.clubName] : 0,
        presence,
        exceptions.length ? exceptions : 0,
      ]);
      pairs++;
    }
    if (!quotes.length) return;
    const brand = cleanManufacturer(meta.manufacturer) ?? 0;
    const size = parseSize(meta.quantity, meta.unit_qty, meta.is_weighted === 1, meta.name);
    const cat = CATEGORIES.indexOf(guessCategory(meta.name).category);
    const productTuple = [meta.name, brand, cat, size ? size.amount : 0, size ? UNITS.indexOf(size.unit) : -1, images.get(barcode) ?? 0];
    shards[Number(barcode.slice(-3))][barcode] = [productTuple, quotes];
    search.push([barcode, meta.name, brand, quotes.length, cat, size ? size.amount : 0, size ? UNITS.indexOf(size.unit) : -1]);
    productCount++;
  };

  let current = "";
  let rows: { chain: string; store: string; price: number; at: string }[] = [];
  const priceIter = db.prepare("SELECT barcode, chain_id, store_id, price, file_published_at FROM prices ORDER BY barcode, chain_id").iterate() as Iterable<Record<string, unknown>>;
  let seen = 0;
  for (const r of priceIter) {
    const barcode = String(r.barcode);
    if (barcode !== current) {
      if (current) flush(current, rows);
      current = barcode;
      rows = [];
    }
    rows.push({ chain: String(r.chain_id), store: String(r.store_id), price: Number(r.price), at: String(r.file_published_at) });
    if (++seen % 2_000_000 === 0) log(`  ${(seen / 1e6).toFixed(0)}M מחירים…`);
  }
  if (current) flush(current, rows);

  shards.forEach((s, i) => write(`p/${String(i).padStart(3, "0")}.json`, s));
  // Search index in two parts: products sold by 2+ chains first (what comparison is about),
  // single-chain products in a second file the app loads only when needed.
  search.sort((a, b) => (b[3] as number) - (a[3] as number));
  write("search-0.json", search.filter((s) => (s[3] as number) >= 2));
  write("search-1.json", search.filter((s) => (s[3] as number) < 2));
  write("meta.json", {
    format: STATIC_FORMAT,
    generatedAt: new Date().toISOString(),
    chains: chainIds.map((id) => ({ id, name: CHAIN_NAMES[id], portalUrl: SOURCES[chainIdx.get(id)!].portalUrl })),
    units: UNITS,
    categories: CATEGORIES,
    counts: { products: productCount, pairs, branches: storeRows.length },
  });

  return { products: productCount, pairs, shards: 1000, bytes, ms: Date.now() - t0 };
}
