import fs from "node:fs";
import { SERVER_CONFIG } from "./config.ts";
import type { DB } from "./db.ts";

/**
 * Stores files have addresses but no coordinates. Addresses are messy
 * ("7 דרך הערבה", "שד.הארזים", typos, even URLs), so we normalise them and
 * try several free OpenStreetMap-based services in order of reliability:
 *
 *   1. Nominatim structured search (street + city)      → exact or nothing
 *   2. Photon (fuzzy)  — only if city AND street verify → catches typos/abbrevs
 *   3. Nominatim town lookup                            → marked approximate
 *
 * Photon's fuzzy matching sometimes returns a similarly-named street in
 * another town ("השומר 10, בני ברק" → "בני ברק 10, תל אביב"); a wrong pin is
 * worse than an approximate one, so unverified Photon hits are discarded.
 *
 * Nominatim: max 1 req/s with an identifying User-Agent. Photon's public
 * instance is fair-use. For production, self-host both or use a commercial
 * geocoder.
 */

const ISRAEL = { minLat: 29.4, maxLat: 33.4, minLng: 34.2, maxLng: 35.9 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inIsrael = (lat: number, lng: number) => lat > ISRAEL.minLat && lat < ISRAEL.maxLat && lng > ISRAEL.minLng && lng < ISRAEL.maxLng;

export type GeoPrecision = "address" | "street" | "city";
interface Hit {
  lat: number;
  lng: number;
  precision: GeoPrecision;
  via: string;
}

// ---------------------------------------------------------------------------
// Normalisation (pure, tested)
// ---------------------------------------------------------------------------

export interface NormalAddress {
  street: string;
  houseNumber?: string;
}

/** "רח' יעקב כהן 8" → {street:"יעקב כהן", houseNumber:"8"}; "7 דרך הערבה" → {street:"דרך הערבה", houseNumber:"7"}. */
export function normalizeAddress(raw: string | null | undefined): NormalAddress | null {
  if (!raw || /https?:|www\.|@/i.test(raw)) return null;
  let s = raw.replace(/["״]/g, "").replace(/\s+/g, " ").trim();
  s = s
    .replace(/^(רח'|רחוב|רח)\s+/, "")
    // "שד." / "שד'" / "שד " = שדרות — but not the word "שדה".
    .replace(/(^|[\s.])שד(?:'\.?|\.|(?=\s))\s*/g, "$1שדרות ")
    .replace(/(^|\s)דר'\s*/g, "$1דרך ")
    .replace(/(^|\s)קנ'?\.\s*/g, "$1קניון ")
    .replace(/(^|\s)א\.ת\.?\s*/g, "$1אזור תעשייה ")
    .replace(/\s*,.*$/, "") // drop trailing ", mall name / neighbourhood"
    .replace(/\s+/g, " ")
    .trim();
  let houseNumber: string | undefined;
  const lead = s.match(/^(\d+[א-ת]?)\s+(.+)$/);
  const trail = s.match(/^(.+?)\s+(\d+[א-ת]?)(\s.*)?$/);
  if (lead) {
    houseNumber = lead[1];
    s = lead[2];
  } else if (trail) {
    houseNumber = trail[2];
    s = trail[1];
  }
  s = s.replace(/^\.+|\.+$/g, "").trim();
  if (s.length < 2 || /^\d+$/.test(s)) return null;
  return { street: s, houseNumber };
}

export function normalizeCity(city: string | null | undefined): string {
  return (city ?? "").replace(/\s*[-–]\s*/g, " ").replace(/\s+/g, " ").trim();
}

/** Compare Hebrew names loosely: no spaces, quotes, dashes, geresh; ו/י vowel letters optional. */
function squash(s: string): string {
  return s.replace(/[\s\-–'"״׳.]/g, "").replace(/[וי]/g, "");
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const STREET_PREFIXES = /^(שדרות|דרך|רחוב|כיכר|סמטת|שביל|קניון|אזור תעשייה)\s+/;

/** Does the geocoder's street name refer to the same street we asked for? */
export function sameStreet(asked: string, got: string | undefined): boolean {
  if (!got) return false;
  const a = squash(asked.replace(STREET_PREFIXES, ""));
  const g = squash(got.replace(STREET_PREFIXES, "").replace(/^(פרופ|ד"ר|דר)\S*\s+/, ""));
  if (a.length < 2 || g.length < 2) return false;
  if (a === g) return true;
  // One typo allowed for longer names ("רוטישילד"/"רוטשילד", "אורוגוואי"/"אורוגואי"),
  // but not short ones, where one letter changes the street ("הרצל" ≠ "הרצליה").
  return Math.min(a.length, g.length) >= 5 && editDistance(a, g) <= 1;
}

export function sameCity(asked: string, candidates: (string | undefined)[]): boolean {
  const a = squash(normalizeCity(asked));
  return candidates.some((c) => {
    if (!c) return false;
    const g = squash(normalizeCity(c.split("|")[0]));
    if (g.length < 3) return false;
    const prefix = Math.min(a.length, g.length) >= 4 && (a.startsWith(g) || g.startsWith(a)); // "מודיעין" vs "מודיעין מכבים רעות"
    return a === g || prefix || (Math.min(a.length, g.length) >= 5 && editDistance(a, g) <= 1);
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const headers = () => ({ "User-Agent": SERVER_CONFIG.userAgent });

async function nominatimStructured(addr: NormalAddress, city: string): Promise<Hit | null> {
  const street = addr.houseNumber ? `${addr.street} ${addr.houseNumber}` : addr.street;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il&limit=1&accept-language=he&addressdetails=1&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; address?: { road?: string; house_number?: string } }[];
  if (!hit || !inIsrael(+hit.lat, +hit.lon)) return null;
  const exact = !!addr.houseNumber && hit.address?.house_number === addr.houseNumber;
  return { lat: +hit.lat, lng: +hit.lon, precision: exact ? "address" : "street", via: "nominatim" };
}

async function photonVerified(addr: NormalAddress, city: string): Promise<Hit | null> {
  const q = [addr.street, addr.houseNumber, city].filter(Boolean).join(" ");
  const url = `https://photon.komoot.io/api/?limit=3&q=${encodeURIComponent(q)}&bbox=${ISRAEL.minLng},${ISRAEL.minLat},${ISRAEL.maxLng},${ISRAEL.maxLat}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const json = (await res.json()) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[];
  };
  for (const f of json.features ?? []) {
    const p = f.properties;
    if (p.type !== "house" && p.type !== "street") continue;
    const streetName = p.type === "street" ? p.name : p.street;
    if (!sameStreet(addr.street, streetName)) continue;
    if (!sameCity(city, [p.city, p.locality, p.district, p.county])) continue;
    const [lng, lat] = f.geometry.coordinates;
    if (!inIsrael(lat, lng)) continue;
    const exact = !!addr.houseNumber && p.housenumber === addr.houseNumber;
    return { lat, lng, precision: exact ? "address" : "street", via: "photon" };
  }
  return null;
}

async function nominatimTown(city: string): Promise<Hit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il&limit=1&accept-language=he&city=${encodeURIComponent(city)}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit && inIsrael(+hit.lat, +hit.lon) ? { lat: +hit.lat, lng: +hit.lon, precision: "city", via: "nominatim" } : null;
}

async function locate(address: string | null, cityRaw: string | null): Promise<Hit | null> {
  const city = normalizeCity(cityRaw);
  const addr = normalizeAddress(address);
  if (addr && city) {
    const n = await nominatimStructured(addr, city);
    await sleep(1100);
    if (n) return n;
    const p = await photonVerified(addr, city);
    await sleep(400);
    if (p) return p;
  }
  if (city) {
    const t = await nominatimTown(city);
    await sleep(1100);
    return t;
  }
  return null;
}

// ---------------------------------------------------------------------------

export async function geocodeStores(
  db: DB,
  opts: { onlyWithPrices: boolean; limit: number; retryApproximate?: boolean; log: (m: string) => void },
) {
  const conditions = [opts.retryApproximate ? "(geo_precision = 'city' OR lat IS NULL)" : "lat IS NULL AND geocoded_at IS NULL"];
  if (opts.onlyWithPrices) conditions.push("EXISTS (SELECT 1 FROM prices p WHERE p.chain_id = s.chain_id AND p.store_id = s.store_id)");
  const rows = db
    .prepare(`SELECT chain_id, store_id, name, address, city, geo_precision FROM stores s WHERE ${conditions.join(" AND ")} LIMIT ?`)
    .all(opts.limit) as { chain_id: string; store_id: string; name: string; address: string | null; city: string | null; geo_precision: string | null }[];

  const save = db.prepare("UPDATE stores SET lat = ?, lng = ?, geo_precision = ?, geocoded_at = ? WHERE chain_id = ? AND store_id = ?");
  const tally: Record<GeoPrecision | "none", number> = { address: 0, street: 0, city: 0, none: 0 };
  for (const [i, r] of rows.entries()) {
    let hit: Hit | null = null;
    try {
      hit = await locate(r.address, r.city);
    } catch (e) {
      opts.log(`  ✗ ${r.chain_id}/${r.store_id}: ${(e as Error).message}`);
      await sleep(5000);
      continue;
    }
    // Never downgrade: a retry that only finds the town keeps the old result.
    if (!hit && r.geo_precision) continue;
    save.run(hit?.lat ?? null, hit?.lng ?? null, hit?.precision ?? null, new Date().toISOString(), r.chain_id, r.store_id);
    tally[hit?.precision ?? "none"]++;
    const mark = !hit ? "–" : hit.precision === "city" ? "~" : "✓";
    opts.log(`  ${mark} [${i + 1}/${rows.length}] ${r.name} (${[r.address, r.city].filter(Boolean).join(", ")})${hit ? ` → ${hit.precision} via ${hit.via}` : ""}`);
  }
  return { attempted: rows.length, ...tally };
}

/** Restore saved branch coordinates (server/geocache.json) for branches not located yet. */
export function importGeocache(db: DB, file: string): number {
  if (!fs.existsSync(file)) return 0;
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as { chain_id: string; store_id: string; address: string | null; lat: number | null; lng: number | null; geo_precision: string | null }[];
  // Only fill branches we haven't located yet, and only if the address is unchanged.
  const put = db.prepare("UPDATE stores SET lat = ?, lng = ?, geo_precision = ?, geocoded_at = ? WHERE chain_id = ? AND store_id = ? AND geocoded_at IS NULL AND address IS ?");
  let n = 0;
  for (const r of rows) n += Number(put.run(r.lat, r.lng, r.geo_precision, new Date().toISOString(), r.chain_id, r.store_id, r.address).changes);
  return n;
}
