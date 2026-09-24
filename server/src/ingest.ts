import fs from "node:fs";
import path from "node:path";
import { SERVER_CONFIG, SOURCES, type ChainSource } from "./config.ts";
import { tx, type DB } from "./db.ts";
import { toXmlText } from "./decode.ts";
import { isComparableBarcode, parsePriceXml, parsePromoXml, parseStoresXml, promoUnitPrice } from "./parse.ts";
import { portalFor, type Portal, type RemoteFile } from "./portals.ts";
import { ensureSettlements, settlementName } from "./settlements.ts";
import { cleanManufacturer } from "./aggregate.ts";

export interface IngestOptions {
  chains?: string[];
  /** How many branches per chain to ingest. "all" for a full national run. */
  storesPerChain: number | "all";
  /** Re-parse files even if already ingested (downloads still come from the cache). */
  reparse?: boolean;
  log: (msg: string) => void;
}

export interface ChainReport {
  chainId: string;
  stores: number;
  priceFiles: number;
  promoFiles: number;
  prices: number;
  promos: number;
  skipped: number;
  errors: string[];
}

export async function ingest(db: DB, opts: IngestOptions): Promise<ChainReport[]> {
  await ensureSettlements(db, opts.log);
  reparse = !!opts.reparse;
  // PRICEWISE_SKIP_CHAINS=a,b skips chains whose portals block the host (e.g. foreign cloud IPs).
  const skip = new Set((process.env.PRICEWISE_SKIP_CHAINS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const sources = SOURCES.filter((s) => (!opts.chains || opts.chains.includes(s.chainId)) && !skip.has(s.chainId));
  if (skip.size) opts.log(`skipping: ${[...skip].join(", ")}`);
  const reports: ChainReport[] = [];
  for (const source of sources) {
    const portal = portalFor(source);
    const report: ChainReport = { chainId: source.chainId, stores: 0, priceFiles: 0, promoFiles: 0, prices: 0, promos: 0, skipped: 0, errors: [] };
    try {
      await ingestChain(db, source, portal, opts, report);
    } catch (e) {
      report.errors.push((e as Error).message);
      opts.log(`✗ ${source.chainId}: ${(e as Error).message}`);
    } finally {
      await portal.close().catch(() => undefined);
    }
    reports.push(report);
  }
  refreshDerived(db);
  // Keep the query planner's statistics current as tables grow.
  db.exec("ANALYZE");
  return reports;
}

async function fetchCached(portal: Portal, file: RemoteFile): Promise<Uint8Array> {
  const p = path.join(SERVER_CONFIG.cacheDir, file.name);
  if (fs.existsSync(p)) return new Uint8Array(fs.readFileSync(p));
  const bytes = await portal.download(file);
  fs.mkdirSync(SERVER_CONFIG.cacheDir, { recursive: true });
  fs.writeFileSync(p, bytes);
  return bytes;
}

let reparse = false;

function alreadyIngested(db: DB, name: string): boolean {
  if (reparse) return false;
  return !!db.prepare("SELECT 1 FROM ingested_files WHERE name = ?").get(name);
}

function markIngested(db: DB, chainId: string, f: RemoteFile, rows: number) {
  db.prepare("INSERT OR REPLACE INTO ingested_files (name, chain_id, kind, store_id, published_at, ingested_at, rows) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    f.name, chainId, f.kind, f.storeId, f.publishedAt, new Date().toISOString(), rows,
  );
}

/** Evenly spread picks so a sample covers different regions, not just stores 1..N. */
function spread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

async function ingestChain(db: DB, source: ChainSource, portal: Portal, opts: IngestOptions, report: ChainReport) {
  const { chainId } = source;
  opts.log(`→ ${chainId}`);
  portal.onProgress = opts.log;

  // 1. Branch list
  const storesFile = await portal.latestStores();
  if (storesFile && !alreadyIngested(db, storesFile.name)) {
    const parsed = parseStoresXml(toXmlText(await fetchCached(portal, storesFile)));
    const upsert = db.prepare(`
      INSERT INTO stores (chain_id, store_id, sub_chain_id, name, address, city_code, city, zip, file_published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (chain_id, store_id) DO UPDATE SET
        sub_chain_id = excluded.sub_chain_id, name = excluded.name, zip = excluded.zip,
        city_code = excluded.city_code, city = excluded.city, file_published_at = excluded.file_published_at,
        -- re-geocode only if the address changed
        lat = CASE WHEN stores.address IS excluded.address THEN stores.lat END,
        lng = CASE WHEN stores.address IS excluded.address THEN stores.lng END,
        geo_precision = CASE WHEN stores.address IS excluded.address THEN stores.geo_precision END,
        address = excluded.address`);
    tx(db, () => {
      for (const s of parsed.stores) {
        const isCode = s.city && /^\d+$/.test(s.city);
        upsert.run(chainId, s.storeId, s.subChainId ?? null, s.name, s.address ?? null, isCode ? s.city! : null, isCode ? settlementName(db, s.city!) : s.city ?? null, s.zip ?? null, storesFile.publishedAt);
      }
      markIngested(db, chainId, storesFile, parsed.stores.length);
    });
    report.stores = parsed.stores.length;
    opts.log(`  stores: ${parsed.stores.length}`);
  }

  // 2. Which branches
  let priceFiles: RemoteFile[];
  if (source.portal.type === "shufersal") {
    // Shufersal lists per branch; choose branches from the stores table.
    const ids = (db.prepare("SELECT store_id FROM stores WHERE chain_id = ? ORDER BY CAST(store_id AS INTEGER)").all(chainId) as { store_id: string }[]).map((r) => r.store_id);
    const pick = opts.storesPerChain === "all" ? ids : spread(ids, opts.storesPerChain);
    opts.log(`  מאתר קבצים ל-${pick.length} סניפים (אתר שופרסל עונה לאט, כ-15 שניות לבקשה)…`);
    if (pick.length > 20) {
      // Many branches: one walk over the chain-wide listing (see ShufersalPortal).
      priceFiles = await portal.latestPerStore("pricefull", pick);
    } else {
      priceFiles = [];
      for (const [i, id] of pick.entries()) {
        priceFiles.push(...(await portal.latestPerStore("pricefull", [id])));
        opts.log(`  ${i + 1}/${pick.length} · סניף ${id}`);
      }
    }
  } else {
    const all = (await portal.latestPerStore("pricefull")).sort((a, b) => Number(a.storeId) - Number(b.storeId));
    priceFiles = opts.storesPerChain === "all" ? all : spread(all, opts.storesPerChain);
  }
  const storeIds = priceFiles.map((f) => f.storeId!).filter(Boolean);
  opts.log(`  price files: ${priceFiles.length}`);

  // 3. Prices
  const upsertProduct = db.prepare(`
    INSERT INTO products (barcode, name, manufacturer, unit_qty, quantity, unit_of_measure, is_weighted, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (barcode) DO UPDATE SET
      manufacturer = COALESCE(products.manufacturer, excluded.manufacturer),
      unit_qty = COALESCE(products.unit_qty, excluded.unit_qty),
      quantity = COALESCE(products.quantity, excluded.quantity),
      unit_of_measure = COALESCE(products.unit_of_measure, excluded.unit_of_measure),
      updated_at = excluded.updated_at`);
  const upsertPrice = db.prepare(`
    INSERT INTO prices (chain_id, store_id, barcode, price, price_changed_at, file_published_at, source_file)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (chain_id, store_id, barcode) DO UPDATE SET
      price = excluded.price, price_changed_at = excluded.price_changed_at,
      file_published_at = excluded.file_published_at, source_file = excluded.source_file
    WHERE excluded.file_published_at >= prices.file_published_at`);
  const dropStale = db.prepare("DELETE FROM prices WHERE chain_id = ? AND store_id = ? AND file_published_at < ?");

  for (const f of priceFiles) {
    if (alreadyIngested(db, f.name)) {
      report.skipped++;
      continue;
    }
    try {
      const parsed = parsePriceXml(toXmlText(await fetchCached(portal, f)));
      const storeId = f.storeId ?? parsed.storeId!;
      const publishedAt = f.publishedAt ?? new Date().toISOString();
      let rows = 0;
      tx(db, () => {
        for (const it of parsed.items) {
          if (!isComparableBarcode(it.itemCode, it.itemType) || it.price <= 0) continue;
          const manufacturer = cleanManufacturer(it.manufacturer) ?? null;
          upsertProduct.run(it.itemCode, it.name, manufacturer, it.unitQty ?? null, it.quantity ?? null, it.unitOfMeasure ?? null, it.isWeighted ? 1 : 0, publishedAt);
          upsertPrice.run(chainId, storeId, it.itemCode, it.price, it.priceChangedAt, publishedAt, f.name);
          rows++;
        }
        // A PriceFull file is the complete list: anything older for this branch was delisted.
        dropStale.run(chainId, storeId, publishedAt);
        markIngested(db, chainId, f, rows);
      });
      report.priceFiles++;
      report.prices += rows;
      opts.log(`  ✓ ${f.name} (${rows} מוצרים)`);
    } catch (e) {
      report.errors.push(`${f.name}: ${(e as Error).message}`);
      opts.log(`  ✗ ${f.name}: ${(e as Error).message}`);
    }
  }

  // 4. Promotions for the same branches
  const promoFiles = await portal.latestPerStore("promofull", storeIds);
  const insertPromo = db.prepare(`
    INSERT OR REPLACE INTO promos (chain_id, store_id, promo_id, description, scope, club_label, min_qty, unit_price, total_price, starts_at, ends_at, file_published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertPromoItem = db.prepare("INSERT OR IGNORE INTO promo_items (chain_id, store_id, promo_id, barcode) VALUES (?, ?, ?, ?)");
  for (const f of promoFiles) {
    if (alreadyIngested(db, f.name)) {
      report.skipped++;
      continue;
    }
    try {
      const parsed = parsePromoXml(toXmlText(await fetchCached(portal, f)));
      const storeId = f.storeId ?? parsed.storeId!;
      const publishedAt = f.publishedAt ?? new Date().toISOString();
      let rows = 0;
      tx(db, () => {
        // PromoFull replaces the branch's promotions wholesale.
        db.prepare("DELETE FROM promo_items WHERE chain_id = ? AND store_id = ?").run(chainId, storeId);
        db.prepare("DELETE FROM promos WHERE chain_id = ? AND store_id = ?").run(chainId, storeId);
        for (const p of parsed.promos) {
          // Keep only deals whose per-unit price we can state with certainty (see promoUnitPrice).
          const priced = promoUnitPrice(p);
          if (!priced) continue;
          insertPromo.run(chainId, storeId, p.promoId, p.description, priced.scope, p.club.label ?? null, p.minQty!, priced.unitPrice, p.totalPrice!, p.startsAt, p.endsAt, publishedAt);
          for (const code of p.itemCodes) insertPromoItem.run(chainId, storeId, p.promoId, code);
          rows++;
        }
        markIngested(db, chainId, f, rows);
      });
      report.promoFiles++;
      report.promos += rows;
      opts.log(`  ✓ ${f.name} (${rows} מבצעים)`);
    } catch (e) {
      report.errors.push(`${f.name}: ${(e as Error).message}`);
      opts.log(`  ✗ ${f.name}: ${(e as Error).message}`);
    }
  }
}

/** Popularity counts for search ranking + today's point in the price history. */
export function refreshDerived(db: DB) {
  tx(db, () => {
    db.exec(`UPDATE products SET chain_count = (SELECT COUNT(DISTINCT chain_id) FROM prices WHERE prices.barcode = products.barcode)`);
    db.exec(`DELETE FROM products WHERE chain_count = 0`);
    const day = new Date().toISOString().slice(0, 10);
    const rows = db.prepare("SELECT chain_id, barcode, price, COUNT(*) AS n FROM prices GROUP BY chain_id, barcode, price").all() as { chain_id: string; barcode: string; price: number; n: number }[];
    const best = new Map<string, { price: number; n: number }>();
    for (const r of rows) {
      const k = `${r.chain_id}|${r.barcode}`;
      const cur = best.get(k);
      if (!cur || r.n > cur.n || (r.n === cur.n && r.price < cur.price)) best.set(k, { price: r.price, n: r.n });
    }
    const put = db.prepare("INSERT OR REPLACE INTO price_history (chain_id, barcode, day, price) VALUES (?, ?, ?, ?)");
    for (const [k, v] of best) {
      const [chainId, barcode] = k.split("|");
      put.run(chainId, barcode, day, v.price);
    }
  });
}
