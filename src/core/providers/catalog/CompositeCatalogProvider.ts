import type { Product } from "../../types";
import type { CatalogProvider } from "../types";

/**
 * Tries providers in order. Barcode lookups stop at the first hit; searches
 * merge and de-duplicate by barcode.
 */
export class CompositeCatalogProvider implements CatalogProvider {
  readonly id = "composite";
  private seen = new Map<string, Product>();

  constructor(private readonly providers: CatalogProvider[]) {}

  handles(productId: string) {
    return this.providers.some((p) => p.handles(productId));
  }

  /** Remember products we've shown so they can be re-opened by id (history, favorites). */
  remember(product: Product) {
    this.seen.set(product.id, product);
  }

  async getById(productId: string): Promise<Product | null> {
    const cached = this.seen.get(productId);
    if (cached) return cached;
    const provider = this.providers.find((p) => p.handles(productId));
    const product = provider ? await provider.getById(productId) : null;
    if (product) this.seen.set(product.id, product);
    return product;
  }

  async getByBarcode(barcode: string): Promise<Product | null> {
    for (const provider of this.providers) {
      const product = await provider.getByBarcode(barcode);
      if (product) {
        this.seen.set(product.id, product);
        return product;
      }
    }
    return null;
  }

  async search(query: string, limit = 20): Promise<Product[]> {
    const settled = await Promise.allSettled(this.providers.map((p) => p.search(query, limit)));
    const out: Product[] = [];
    const keys = new Set<string>();
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const product of r.value) {
        const key = product.barcode ?? product.id;
        if (keys.has(key)) continue;
        keys.add(key);
        this.seen.set(product.id, product);
        out.push(product);
      }
    }
    return out.slice(0, limit);
  }
}
