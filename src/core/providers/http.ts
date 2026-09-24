import type { Branch, PricePoint, PriceQuote, Product } from "../types";
import type { BranchProvider, BranchQuery, CatalogProvider, PriceProvider, PriceQuery } from "./types";

/**
 * Generic HTTP providers for a PriceWise backend. The backend is expected to
 * ingest the chains' price-transparency files (חוק שקיפות מחירים, 2014) and
 * expose them with the JSON contract documented in docs/API.md.
 *
 *   GET  {base}/products?barcode=…            → Product | 404
 *   GET  {base}/products?q=…&limit=…          → Product[]
 *   GET  {base}/products/{id}                 → Product | 404
 *   GET  {base}/prices?productId=…&barcode=…&chains=a,b&branchId=…  → PriceQuote[]
 *   GET  {base}/prices?productId=…&barcode=…&branchIds=chain:1,chain:2 → PriceQuote[] (per branch)
 *   GET  {base}/prices/history?productId=…&chainId=…&days=…         → PricePoint[]
 *   GET  {base}/branches?lat=…&lng=…&radiusKm=…&chains=a,b&limit=…  → Branch[]
 */

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  return sp.toString();
}

const trim = (base: string) => base.replace(/\/+$/, "");

export class HttpCatalogProvider implements CatalogProvider {
  readonly id = "api";
  constructor(private readonly base: string) {}

  handles(productId: string) {
    return productId.startsWith("api:");
  }
  getById(productId: string) {
    return getJson<Product>(`${trim(this.base)}/products/${encodeURIComponent(productId)}`);
  }
  getByBarcode(barcode: string) {
    return getJson<Product>(`${trim(this.base)}/products?${qs({ barcode })}`);
  }
  async search(query: string, limit = 20) {
    return (await getJson<Product[]>(`${trim(this.base)}/products?${qs({ q: query, limit })}`)) ?? [];
  }
}

export class HttpPriceProvider implements PriceProvider {
  readonly id = "api";
  readonly isDemo = false;
  constructor(private readonly base: string) {}

  async getQuotes(product: Product, query: PriceQuery = {}) {
    const url = `${trim(this.base)}/prices?${qs({
      productId: product.id,
      barcode: product.barcode,
      chains: query.chainIds?.join(","),
      branchId: query.branchId,
      branchIds: query.branchIds?.join(","),
    })}`;
    return (await getJson<PriceQuote[]>(url)) ?? [];
  }

  async getHistory(product: Product, chainId: string, days: number) {
    return (await getJson<PricePoint[]>(`${trim(this.base)}/prices/history?${qs({ productId: product.id, chainId, days })}`)) ?? [];
  }
}

export class HttpBranchProvider implements BranchProvider {
  readonly id = "api";
  readonly isDemo = false;
  constructor(private readonly base: string) {}

  async getBranches(q: BranchQuery) {
    const url = `${trim(this.base)}/branches?${qs({
      lat: q.near?.lat,
      lng: q.near?.lng,
      radiusKm: q.radiusKm,
      chains: q.chainIds?.join(","),
      limit: q.limit,
    })}`;
    return (await getJson<Branch[]>(url)) ?? [];
  }
}
