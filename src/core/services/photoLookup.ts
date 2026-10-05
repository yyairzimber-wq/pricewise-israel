/**
 * Live fallback for products whose photo isn't in the snapshot yet: ask Open Food
 * Facts for just that one barcode (called only on a product's own page, never for
 * lists). Found and not-found answers are remembered on the device.
 */

const FOUND_MS = 30 * 86_400_000;
const MISSING_MS = 7 * 86_400_000;
const memory = new Map<string, string | null>();

type Entry = { url: string | null; at: number };

function read(key: string): Entry | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
}

function write(key: string, entry: Entry) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* storage full or blocked — fine */
  }
}

export async function lookupPhoto(barcode: string): Promise<string | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  if (memory.has(barcode)) return memory.get(barcode)!;
  const key = `pw-photo:${barcode}`;
  const cached = read(key);
  if (cached && Date.now() - cached.at < (cached.url ? FOUND_MS : MISSING_MS)) {
    memory.set(barcode, cached.url);
    return cached.url;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=image_front_url,image_url`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok && res.status !== 404) return null; // temporary trouble: don't remember a miss
    const json = (await res.json().catch(() => ({}))) as { product?: { image_front_url?: string; image_url?: string } };
    const url = json.product?.image_front_url || json.product?.image_url || null;
    const safe = url && /^https:\/\/images\.openfoodfacts\.org\//.test(url) ? url : null;
    memory.set(barcode, safe);
    write(key, { url: safe, at: Date.now() });
    return safe;
  } catch {
    return null;
  }
}
