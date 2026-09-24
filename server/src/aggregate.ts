import type { CategoryId, PriceQuote, Product, ProductSize } from "../../src/core/types.ts";

/**
 * Pure functions that turn per-branch rows into the app's contract types.
 * Kept free of I/O so the rules are unit-tested.
 */

export interface StorePrice {
  storeId: string;
  price: number;
  filePublishedAt: string;
  priceChangedAt: string | null;
}

export interface StorePromo {
  storeId: string;
  promoId: string;
  description: string;
  scope: "all" | "club";
  clubLabel: string | null;
  minQty: number;
  unitPrice: number;
  totalPrice: number;
  endsAt: string | null;
}

export interface ChainMeta {
  chainId: string;
  chainName: string;
  portalUrl: string;
  /** Set when the caller asked for one branch. */
  branchName?: string;
}

/**
 * Chain-level quote: the price most branches charge (ties → the more recently
 * confirmed one), timestamped by when the chain last *published* it. The
 * label says how many branches share it, so a regional price isn't overstated.
 */
export function chainQuote(productId: string, prices: StorePrice[], promos: StorePromo[], meta: ChainMeta, now = Date.now()): PriceQuote | null {
  if (!prices.length) return null;

  const groups = new Map<number, StorePrice[]>();
  for (const p of prices) groups.set(p.price, [...(groups.get(p.price) ?? []), p]);
  const latest = (list: StorePrice[]) => list.reduce((m, p) => (p.filePublishedAt > m ? p.filePublishedAt : m), "");
  const [regular, sharing] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || latest(b[1]).localeCompare(latest(a[1])))[0];

  const branchCount = new Set(prices.map((p) => p.storeId)).size;
  const coverage = meta.branchName
    ? `סניף ${meta.branchName}`
    : branchCount === 1
      ? "סניף אחד"
      : sharing.length === branchCount
        ? `זהה ב-${branchCount} הסניפים שנבדקו`
        : `המחיר ב-${sharing.length} מתוך ${branchCount} סניפים שנבדקו`;

  const quote: PriceQuote = {
    productId,
    chainId: meta.chainId,
    regular,
    currency: "ILS",
    updatedAt: latest(sharing),
    source: { kind: "transparency-feed", label: `קובץ שקיפות מחירים · ${meta.chainName} · ${coverage}`, url: meta.portalUrl },
  };

  // A promo counts at chain level only if at least half the branches run it.
  const needed = Math.ceil(branchCount / 2);
  const active = promos.filter((p) => (!p.endsAt || Date.parse(p.endsAt) > now) && p.unitPrice < regular && p.unitPrice >= regular * 0.2);
  const bucket = new Map<string, { promo: StorePromo; stores: Set<string> }>();
  for (const p of active) {
    const k = `${p.scope}|${p.minQty}|${p.unitPrice}`;
    const b = bucket.get(k) ?? { promo: p, stores: new Set<string>() };
    b.stores.add(p.storeId);
    bucket.set(k, b);
  }
  const widespread = [...bucket.values()].filter((b) => b.stores.size >= needed).map((b) => b.promo);
  const bestOf = (scope: "all" | "club") => widespread.filter((p) => p.scope === scope).sort((a, b) => a.unitPrice - b.unitPrice)[0];

  const promo = bestOf("all");
  if (promo) {
    quote.promo = {
      unitPrice: promo.unitPrice,
      label: promo.minQty > 1 ? `${promo.minQty} ב-${formatNum(promo.totalPrice)} ₪` : `${formatNum(promo.unitPrice)} ₪ במבצע`,
      minQuantity: promo.minQty,
      validUntil: promo.endsAt ?? undefined,
    };
  }
  const club = bestOf("club");
  if (club && (!promo || club.unitPrice < promo.unitPrice)) {
    quote.club = {
      unitPrice: club.unitPrice,
      clubName: club.clubLabel || `מועדון ${meta.chainName}`,
      label: club.minQty > 1 ? `${club.minQty} ב-${formatNum(club.totalPrice)} ₪` : undefined,
    };
  }
  return quote;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductRow {
  barcode: string;
  name: string;
  manufacturer: string | null;
  unit_qty: string | null;
  quantity: number | null;
  is_weighted: number;
}

/**
 * Size written in the product name ("קורנפלקס תלמה 400 גר", "448ג", "1.5 ל").
 * Preferred over the UnitQty field, which chains sometimes fill wrongly
 * (seen: a 400 g cereal box published with UnitQty "ליטר").
 */
export function sizeFromName(name: string): ProductSize | undefined {
  // Optional "6*" / "4X" multipack prefix: "קוקה קולה 6*1.5 ליטר" = 9 litres.
  const m = name.replace(/[״"']/g, "").match(/(?:(\d+)\s*[*xX×]\s*)?(\d+(?:[.,]\d+)?)\s*(קג|קילו|גרם|גר|ג|מל|ליטר|ל)(?![א-ת])/);
  if (!m) return undefined;
  const amount = Math.round(Number(m[2].replace(",", ".")) * (m[1] ? Number(m[1]) : 1) * 1000) / 1000;
  if (!amount) return undefined;
  const u = m[3];
  if (u === "קג" || u === "קילו") return { amount, unit: "kg" };
  if (u === "מל") return { amount, unit: "ml" };
  if (u === "ליטר" || u === "ל") return { amount, unit: "l" };
  return { amount, unit: "g" };
}

export function parseSize(quantity: number | null, unitQty: string | null, weighted: boolean, name?: string): ProductSize | undefined {
  if (weighted) return { amount: 1, unit: "kg" };
  const fromName = name ? sizeFromName(name) : undefined;
  if (fromName) return fromName;
  if (!quantity || quantity <= 0 || !unitQty) return undefined;
  const u = unitQty.replace(/[״"']/g, "");
  // Order matters: "מיליליטר" contains "ליטר", "קילוגרם" contains "גרם".
  if (/מל|מיליליטר|ml/i.test(u)) return { amount: quantity, unit: "ml" };
  if (/קג|קילו|kg/i.test(u)) return { amount: quantity, unit: "kg" };
  if (/ליטר|^ל$|lit/i.test(u)) return { amount: quantity, unit: "l" };
  if (/גר|גרם|^g/i.test(u)) return { amount: quantity, unit: "g" };
  if (/יח|יחידה|unit/i.test(u)) return quantity > 1 ? { amount: quantity, unit: "unit" } : undefined;
  return undefined;
}

const CATEGORY_RULES: [RegExp, CategoryId, string][] = [
  [/חיתול|מטרנה|סימילאק|תמ"ל|מגבונים לתינוק/, "baby", "👶"],
  [/קורנפלקס|דגני בוקר|גרנולה|כריות/, "breakfast", "🥣"],
  [/שוקולד|במבה|ביסלי|חטיף|עוגי|ופל|סוכרי|צ'יפס|קרקר|דובונים/, "snacks", "🍫"],
  [/חלב|גבינ|יוגורט|קוטג|שמנת|חמאה|ביצים|מעדן|לבנה|שוקו/, "dairy", "🥛"],
  [/לחם|פית|לחמני|חלה|באגט|טורטי/, "bakery", "🍞"],
  [/קולה|מים |מים$|מיץ|משקה|בירה|יין|סודה|נקטר|ספרינג/, "drinks", "🥤"],
  [/עוף|בקר|בשר|נקניק|שניצל עוף|הודו|כבד/, "meat", "🍗"],
  [/קפוא|גלידה|מוקפא/, "frozen", "🧊"],
  [/כביסה|אקונומיקה|נוזל כלים|מרכך|ניקוי|נייר טואלט|מגבות נייר|שקיות אשפה/, "cleaning", "🧺"],
  [/שמפו|משחת שיניים|מברשת|דאודורנט|סבון|מרכך שיער|קרם/, "personal-care", "🧴"],
  [/עגבני|מלפפון|בננ|תפוח|תפוז|בצל|גזר|תפו"א|אבוקדו|פלפל/, "produce", "🥬"],
  [/קפה|תה |אורז|פסטה|ספגטי|קמח|סוכר|שמן|טונה|רוטב|קטשופ|טחינה|פתיתים|שימורי|קוסקוס|דבש|ריבה/, "pantry", "🥫"],
];

export function guessCategory(name: string): { category: CategoryId; emoji: string } {
  for (const [re, category, emoji] of CATEGORY_RULES) if (re.test(name)) return { category, emoji };
  return { category: "other", emoji: "🛒" };
}

/** Files use placeholders like "---", "לא ידוע" or "כללי" when the manufacturer is unknown. */
export function cleanManufacturer(m: string | null | undefined): string | undefined {
  const v = m?.trim();
  if (!v || /^[-–—_.\s0]*$/.test(v) || /^(לא ידוע|כללי|אין|unknown)$/i.test(v)) return undefined;
  return v;
}

export function toProduct(row: ProductRow): Product {
  const { category, emoji } = guessCategory(row.name);
  return {
    id: `api:${row.barcode}`,
    barcode: row.barcode,
    name: row.name,
    brand: cleanManufacturer(row.manufacturer),
    size: parseSize(row.quantity, row.unit_qty, row.is_weighted === 1, row.name),
    category,
    emoji,
    source: { kind: "transparency-feed", label: "קובצי שקיפות מחירים של הרשתות" },
  };
}
