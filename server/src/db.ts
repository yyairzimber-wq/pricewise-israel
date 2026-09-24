import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * SQLite via Node's built-in driver: zero native deps, fine for a single
 * server. The schema maps 1:1 to Postgres if/when you outgrow it.
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 30000;

CREATE TABLE IF NOT EXISTS stores (
  chain_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  sub_chain_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city_code TEXT,
  city TEXT,
  zip TEXT,
  lat REAL,
  lng REAL,
  geo_precision TEXT,          -- 'address' | 'city' | NULL (not geocoded)
  geocoded_at TEXT,
  file_published_at TEXT,
  PRIMARY KEY (chain_id, store_id)
);

CREATE TABLE IF NOT EXISTS products (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  unit_qty TEXT,
  quantity REAL,
  unit_of_measure TEXT,
  is_weighted INTEGER NOT NULL DEFAULT 0,
  chain_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- One row per (chain, store, barcode): the latest shelf price we have.
CREATE TABLE IF NOT EXISTS prices (
  chain_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  price REAL NOT NULL,
  price_changed_at TEXT,       -- when the chain last CHANGED the price
  file_published_at TEXT NOT NULL, -- when the chain last CONFIRMED it (file time)
  source_file TEXT NOT NULL,
  PRIMARY KEY (chain_id, store_id, barcode)
);
DROP INDEX IF EXISTS prices_barcode;
CREATE INDEX IF NOT EXISTS prices_barcode_chain ON prices (barcode, chain_id);

CREATE TABLE IF NOT EXISTS promos (
  chain_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  promo_id TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL,         -- 'all' | 'club'
  club_label TEXT,
  min_qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  file_published_at TEXT NOT NULL,
  PRIMARY KEY (chain_id, store_id, promo_id)
);

CREATE TABLE IF NOT EXISTS promo_items (
  chain_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  promo_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  PRIMARY KEY (chain_id, store_id, promo_id, barcode)
);
DROP INDEX IF EXISTS promo_items_barcode;
-- (barcode, chain_id): lookups are always "this product at this chain".
CREATE INDEX IF NOT EXISTS promo_items_barcode_chain ON promo_items (barcode, chain_id);

-- Daily snapshot of each chain's typical price, for the trend chart.
CREATE TABLE IF NOT EXISTS price_history (
  chain_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  day TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (chain_id, barcode, day)
);

CREATE TABLE IF NOT EXISTS ingested_files (
  name TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  store_id TEXT,
  published_at TEXT,
  ingested_at TEXT NOT NULL,
  rows INTEGER NOT NULL
);

-- Product photos from Open Food Facts (url NULL = checked, none available).
CREATE TABLE IF NOT EXISTS product_images (
  barcode TEXT PRIMARY KEY,
  url TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
`;

export type DB = DatabaseSync;

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
