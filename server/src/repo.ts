import type { Branch, PricePoint, PriceQuote, Product } from "../../src/core/types.ts";
import { chainQuote, toProduct, type ProductRow, type StorePrice, type StorePromo } from "./aggregate.ts";
import { CHAIN_NAMES, SOURCES } from "./config.ts";
import type { DB } from "./db.ts";
import { cachedImages, imageFor, warmImages } from "./images.ts";

const PRODUCT_COLS = "barcode, name, manufacturer, unit_qty, quantity, is_weighted";

export async function productByBarcode(db: DB, barcode: string): Promise<Product | null> {
  const row = db.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE barcode = ?`).get(barcode) as ProductRow | undefined;
  if (!row) return null;
  const product = toProduct(row);
  const image = await imageFor(db, barcode);
  if (image) product.imageUrl = image;
  return product;
}

export function searchProducts(db: DB, q: string, limit = 20): Product[] {
  const tokens = q
    .replace(/[%_]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);
  if (!tokens.length) return [];
  const where = tokens.map(() => "(name LIKE ? OR manufacturer LIKE ?)").join(" AND ");
  const args = tokens.flatMap((t) => [`%${t}%`, `%${t}%`]);
  const rows = db
    .prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE ${where} ORDER BY chain_count DESC, (name LIKE ?) DESC, length(name) LIMIT ?`)
    .all(...args, `${tokens[0]}%`, Math.min(limit, 50)) as unknown as ProductRow[];
  const products = rows.map(toProduct);
  // Photos we already know about; look up the rest in the background for next time.
  const codes = products.map((p) => p.barcode!).filter(Boolean);
  const images = cachedImages(db, codes);
  for (const p of products) if (images.has(p.barcode!)) p.imageUrl = images.get(p.barcode!);
  warmImages(db, codes);
  return products;
}

export function barcodeFromId(id: string | null | undefined): string | null {
  if (!id) return null;
  const m = id.match(/^(?:api:|off:)?(\d{8,14})$/);
  return m ? m[1] : null;
}

export function quotesFor(db: DB, barcode: string, opts: { chains?: string[]; branchId?: string; productId: string }): PriceQuote[] {
  let branch: { chainId: string; storeId: string } | null = null;
  if (opts.branchId) {
    const [chainId, storeId] = opts.branchId.split(":");
    if (chainId && storeId) branch = { chainId, storeId };
  }
  const out: PriceQuote[] = [];
  for (const source of SOURCES) {
    if (opts.chains && !opts.chains.includes(source.chainId)) continue;
    if (branch && branch.chainId !== source.chainId) continue;

    const storeFilter = branch ? " AND store_id = ?" : "";
    const storeArgs = branch ? [branch.storeId] : [];
    const prices = (
      db
        .prepare(`SELECT store_id, price, file_published_at, price_changed_at FROM prices WHERE chain_id = ? AND barcode = ?${storeFilter}`)
        .all(source.chainId, barcode, ...storeArgs) as { store_id: string; price: number; file_published_at: string; price_changed_at: string | null }[]
    ).map<StorePrice>((r) => ({ storeId: r.store_id, price: r.price, filePublishedAt: r.file_published_at, priceChangedAt: r.price_changed_at }));
    if (!prices.length) continue;

    const promos = (
      db
        .prepare(
          `SELECT p.store_id, p.promo_id, p.description, p.scope, p.club_label, p.min_qty, p.unit_price, p.total_price, p.ends_at
           FROM promo_items i JOIN promos p USING (chain_id, store_id, promo_id)
           WHERE i.chain_id = ? AND i.barcode = ?${storeFilter.replace("store_id", "i.store_id")}`,
        )
        .all(source.chainId, barcode, ...storeArgs) as Record<string, unknown>[]
    ).map<StorePromo>((r) => ({
      storeId: String(r.store_id),
      promoId: String(r.promo_id),
      description: String(r.description ?? ""),
      scope: r.scope as "all" | "club",
      clubLabel: (r.club_label as string) ?? null,
      minQty: Number(r.min_qty),
      unitPrice: Number(r.unit_price),
      totalPrice: Number(r.total_price),
      endsAt: (r.ends_at as string) ?? null,
    }));

    const branchName = branch
      ? ((db.prepare("SELECT name FROM stores WHERE chain_id = ? AND store_id = ?").get(branch.chainId, branch.storeId) as { name: string } | undefined)?.name ?? branch.storeId)
      : undefined;
    const q = chainQuote(opts.productId, prices, promos, { chainId: source.chainId, chainName: CHAIN_NAMES[source.chainId], portalUrl: source.portalUrl, branchName });
    if (q) {
      if (branch) q.branchId = opts.branchId;
      out.push(q);
    }
  }
  return out;
}

export function history(db: DB, barcode: string, chainId: string, days: number): PricePoint[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return (db.prepare("SELECT day, price FROM price_history WHERE chain_id = ? AND barcode = ? AND day >= ? ORDER BY day").all(chainId, barcode, since) as { day: string; price: number }[]).map(
    (r) => ({ date: r.day, price: r.price }),
  );
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/** Shufersal's branch names already start with "שופרסל"; don't print it twice. */
function branchDisplayName(chainId: string, name: string): string {
  const chain = CHAIN_NAMES[chainId] ?? chainId;
  return name.includes(chain) ? name : `${chain} ${name}`;
}

export function branches(db: DB, q: { lat?: number; lng?: number; radiusKm?: number; chains?: string[]; limit?: number }): Branch[] {
  const rows = db
    .prepare(
      `SELECT s.*, EXISTS (SELECT 1 FROM prices p WHERE p.chain_id = s.chain_id AND p.store_id = s.store_id) AS has_prices
       FROM stores s WHERE lat IS NOT NULL AND lng IS NOT NULL`,
    )
    .all() as Record<string, unknown>[];
  let list = rows
    .filter((r) => !q.chains || q.chains.includes(String(r.chain_id)))
    .map((r) => ({ r, d: q.lat != null && q.lng != null ? haversineKm(q.lat, q.lng, Number(r.lat), Number(r.lng)) : 0 }));
  if (q.lat != null && q.radiusKm) list = list.filter((x) => x.d <= q.radiusKm!);
  list.sort((a, b) => a.d - b.d);
  return list.slice(0, Math.min(q.limit ?? 40, 200)).map(({ r }) => ({
    id: `${r.chain_id}:${r.store_id}`,
    chainId: String(r.chain_id),
    name: branchDisplayName(String(r.chain_id), String(r.name)),
    address: [r.address, r.city].filter(Boolean).join(", "),
    city: String(r.city ?? ""),
    lat: Number(r.lat),
    lng: Number(r.lng),
    approximateLocation: r.geo_precision === "city" || undefined,
    // Opening hours are not part of the transparency files.
    source: {
      kind: "transparency-feed",
      label: `קובץ הסניפים של הרשת${r.has_prices ? "" : " · אין עדיין מחירים לסניף"}`,
    },
  }));
}

export function status(db: DB) {
  const files = db
    .prepare(
      `SELECT chain_id, kind, COUNT(*) AS files, MAX(published_at) AS latest, SUM(rows) AS rows
       FROM ingested_files GROUP BY chain_id, kind ORDER BY chain_id, kind`,
    )
    .all();
  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM prices) AS prices,
              (SELECT COUNT(*) FROM stores) AS stores, (SELECT COUNT(*) FROM stores WHERE lat IS NOT NULL) AS geocodedStores,
              (SELECT COUNT(*) FROM promos) AS promos`,
    )
    .get();
  return { counts, files };
}
