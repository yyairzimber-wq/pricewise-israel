import { distanceKm } from "../services/geo";
import { matchScore } from "../services/text";
import type { Branch, CategoryId, DataSource, PriceQuote, Product, SizeUnit } from "../types";
import type { BranchProvider, BranchQuery, CatalogProvider, PriceProvider, PriceQuery } from "./types";

/**
 * Providers for the static price snapshot (server/src/export.ts), served from
 * a CDN such as Vercel with no server behind it. Same data and rules as the
 * live API — chain price = most common branch price, per-branch prices
 * reconstructed from the branch exceptions — just precomputed.
 */

const SUPPORTED_FORMAT = 2;

interface Meta {
  format: number;
  generatedAt: string;
  chains: { id: string; name: string; portalUrl: string }[];
  units: SizeUnit[];
  categories: CategoryId[];
}
// [name, brand|0, cat, sizeAmount, sizeUnitIdx, imageUrl|0]
type ProductTuple = [string, string | 0, number, number, number, string | 0];
// [chainIdx, regular, updatedMin, sharing, total, promo|0, club|0, presence|0, exceptions|0]
type QuoteTuple = [number, number, number, number, number, [number, number, number, number] | 0, [number, string] | 0, number[] | 0, number[][] | 0];
type Shard = Record<string, [ProductTuple, QuoteTuple[]]>;
// [storeId, name, address, city, lat, lng, approximate]
type BranchTuple = [string, string, string, string, number, number, 0 | 1];
// [barcode, name, brand|0, chainCount, cat, sizeAmount, sizeUnitIdx]
type SearchTuple = [string, string, string | 0, number, number, number, number];

const EMOJI: Record<string, string> = {
  baby: "👶", breakfast: "🥣", snacks: "🍫", dairy: "🥛", bakery: "🍞", drinks: "🥤", meat: "🍗",
  frozen: "🧊", cleaning: "🧺", "personal-care": "🧴", produce: "🥬", pantry: "🥫", other: "🛒",
};

const PRODUCT_SOURCE: DataSource = { kind: "transparency-feed", label: "קובצי שקיפות מחירים של הרשתות" };

const undelta = (list: number[]) => {
  let acc = 0;
  return list.map((d, i) => (acc = i === 0 ? d : acc + d));
};
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
const minutesToIso = (m: number) => new Date(m * 60_000).toISOString();

/** Lazily loads and caches snapshot files; shared by the three providers. */
export class StaticSnapshot {
  private readonly base: string;
  private meta?: Promise<Meta>;
  private branches?: Promise<BranchTuple[][]>;
  private shards = new Map<string, Promise<Shard>>();
  private search0?: Promise<SearchTuple[]>;
  private search1?: Promise<SearchTuple[]>;

  constructor(base: string) {
    this.base = base.replace(/\/+$/, "");
  }

  private async json<T>(rel: string): Promise<T> {
    const res = await fetch(`${this.base}/${rel}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`snapshot ${rel}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  getMeta(): Promise<Meta> {
    this.meta ??= this.json<Meta>("meta.json").then((m) => {
      if (m.format !== SUPPORTED_FORMAT) throw new Error(`unsupported snapshot format ${m.format}`);
      return m;
    });
    return this.meta;
  }
  getBranches() {
    this.branches ??= this.json<BranchTuple[][]>("branches.json");
    return this.branches;
  }
  getShard(barcode: string) {
    const key = barcode.slice(-3).padStart(3, "0");
    let p = this.shards.get(key);
    if (!p) {
      p = this.json<Shard>(`p/${key}.json`);
      this.shards.set(key, p);
    }
    return p;
  }
  getSearch(part: 0 | 1) {
    if (part === 0) return (this.search0 ??= this.json<SearchTuple[]>("search-0.json"));
    return (this.search1 ??= this.json<SearchTuple[]>("search-1.json"));
  }

  toProduct(barcode: string, name: string, brand: string | 0, cat: number, sizeAmount: number, sizeUnit: number, image: string | 0, meta: Meta): Product {
    const category = meta.categories[cat] ?? "other";
    return {
      id: `api:${barcode}`,
      barcode,
      name,
      brand: brand || undefined,
      size: sizeAmount > 0 && sizeUnit >= 0 ? { amount: sizeAmount, unit: meta.units[sizeUnit] } : undefined,
      category,
      emoji: EMOJI[category],
      imageUrl: image || undefined,
      source: PRODUCT_SOURCE,
    };
  }

  chainQuote(productId: string, t: QuoteTuple, meta: Meta): PriceQuote {
    const [ci, regular, updated, sharing, total, promo, club] = t;
    const chain = meta.chains[ci];
    const coverage = total === 1 ? "סניף אחד" : sharing === total ? `זהה ב-${total} הסניפים שנבדקו` : `המחיר ב-${sharing} מתוך ${total} סניפים שנבדקו`;
    const q: PriceQuote = {
      productId,
      chainId: chain.id,
      regular,
      currency: "ILS",
      updatedAt: minutesToIso(updated),
      source: { kind: "transparency-feed", label: `קובץ שקיפות מחירים · ${chain.name} · ${coverage}`, url: chain.portalUrl },
    };
    if (promo) {
      const [unit, minQty, totalPrice, ends] = promo;
      q.promo = {
        unitPrice: unit,
        minQuantity: minQty,
        label: minQty > 1 ? `${minQty} ב-${fmtNum(totalPrice)} ₪` : `${fmtNum(unit)} ₪ במבצע`,
        validUntil: ends ? minutesToIso(ends) : undefined,
      };
    }
    if (club) q.club = { unitPrice: club[0], clubName: club[1] };
    return q;
  }

  /** A branch's own price, or null if the branch doesn't carry the item. */
  branchPrice(t: QuoteTuple, branchIndex: number): number | null {
    const presence = t[7];
    if (presence) {
      const [mode, ...rest] = presence;
      const listed = new Set(undelta(rest));
      if (mode === 1 && !listed.has(branchIndex)) return null;
      if (mode === 2 && listed.has(branchIndex)) return null;
    }
    for (const group of t[8] || []) {
      const [price, ...idx] = group;
      if (undelta(idx).includes(branchIndex)) return price;
    }
    return t[1];
  }
}

// ---------------------------------------------------------------------------

export class StaticCatalogProvider implements CatalogProvider {
  readonly id = "static";
  private readonly snap: StaticSnapshot;
  constructor(snap: StaticSnapshot) {
    this.snap = snap;
  }

  handles(productId: string) {
    return productId.startsWith("api:");
  }
  getById(productId: string) {
    return this.getByBarcode(productId.slice(4));
  }
  async getByBarcode(barcode: string): Promise<Product | null> {
    if (!/^\d{8,14}$/.test(barcode)) return null;
    const [meta, shard] = await Promise.all([this.snap.getMeta(), this.snap.getShard(barcode)]);
    const entry = shard[barcode];
    if (!entry) return null;
    const [name, brand, cat, amount, unit, image] = entry[0];
    return this.snap.toProduct(barcode, name, brand, cat, amount, unit, image, meta);
  }
  async search(query: string, limit = 20): Promise<Product[]> {
    const meta = await this.snap.getMeta();
    const rank = (rows: SearchTuple[]) =>
      rows
        .map((r) => ({ r, s: matchScore(query, `${r[1]} ${r[2] || ""}`) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || b.r[3] - a.r[3]);
    // Products sold by several chains first; single-chain ones only if needed.
    let hits = rank(await this.snap.getSearch(0));
    if (hits.length < limit) hits = hits.concat(rank(await this.snap.getSearch(1)));
    return hits.slice(0, limit).map(({ r }) => this.snap.toProduct(r[0], r[1], r[2], r[4], r[5], r[6], 0, meta));
  }
}

export class StaticPriceProvider implements PriceProvider {
  readonly id = "static";
  readonly isDemo = false;
  private readonly snap: StaticSnapshot;
  constructor(snap: StaticSnapshot) {
    this.snap = snap;
  }

  async getQuotes(product: Product, query: PriceQuery = {}): Promise<PriceQuote[]> {
    const barcode = product.barcode ?? product.id.replace(/^(api|off):/, "");
    if (!/^\d{8,14}$/.test(barcode)) return []; // e.g. demo products: no real prices
    const [meta, shard] = await Promise.all([this.snap.getMeta(), this.snap.getShard(barcode)]);
    const entry = shard[barcode];
    if (!entry) return [];
    const tuples = entry[1];

    if (query.branchIds?.length || query.branchId) {
      const branches = await this.snap.getBranches();
      const out: PriceQuote[] = [];
      for (const branchId of query.branchIds ?? [query.branchId!]) {
        const [chainId, storeId] = branchId.split(":");
        const ci = meta.chains.findIndex((c) => c.id === chainId);
        const t = tuples.find((x) => x[0] === ci);
        const idx = branches[ci]?.findIndex((b) => b[0] === storeId) ?? -1;
        if (!t || idx < 0) continue;
        const price = this.snap.branchPrice(t, idx);
        if (price == null) continue;
        const chain = meta.chains[ci];
        out.push({
          productId: product.id,
          chainId,
          branchId,
          regular: price,
          currency: "ILS",
          updatedAt: minutesToIso(t[2]),
          source: { kind: "transparency-feed", label: `קובץ שקיפות מחירים · ${chain.name} · סניף ${branches[ci][idx][1]}`, url: chain.portalUrl },
        });
      }
      return out;
    }

    const quotes = tuples.map((t) => this.snap.chainQuote(product.id, t, meta));
    return query.chainIds ? quotes.filter((q) => query.chainIds!.includes(q.chainId)) : quotes;
  }
}

export class StaticBranchProvider implements BranchProvider {
  readonly id = "static";
  readonly isDemo = false;
  private readonly snap: StaticSnapshot;
  constructor(snap: StaticSnapshot) {
    this.snap = snap;
  }

  async getBranches(q: BranchQuery): Promise<Branch[]> {
    const [meta, branches] = await Promise.all([this.snap.getMeta(), this.snap.getBranches()]);
    let list: { b: Branch; d: number }[] = [];
    branches.forEach((rows, ci) => {
      const chain = meta.chains[ci];
      if (!chain || (q.chainIds && !q.chainIds.includes(chain.id))) return;
      for (const [storeId, name, address, city, lat, lng, approx] of rows) {
        if (!lat || !lng) continue; // not located — can't show on "nearby"
        const b: Branch = {
          id: `${chain.id}:${storeId}`,
          chainId: chain.id,
          name: name.includes(chain.name) ? name : `${chain.name} ${name}`,
          address: [address, city].filter(Boolean).join(", "),
          city,
          lat,
          lng,
          approximateLocation: approx === 1 || undefined,
          source: { kind: "transparency-feed", label: "קובץ הסניפים של הרשת" },
        };
        list.push({ b, d: q.near ? distanceKm(q.near, b) : 0 });
      }
    });
    if (q.near && q.radiusKm) list = list.filter((x) => x.d <= q.radiusKm!);
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, q.limit ?? 40).map((x) => x.b);
  }
}
