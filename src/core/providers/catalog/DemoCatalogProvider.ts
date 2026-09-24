import { DEMO_PRODUCTS } from "../../data/demo/products";
import { matchScore } from "../../services/text";
import type { Product } from "../../types";
import type { CatalogProvider } from "../types";

export class DemoCatalogProvider implements CatalogProvider {
  readonly id = "demo";

  handles(productId: string) {
    return productId.startsWith("demo:");
  }

  async getById(productId: string): Promise<Product | null> {
    return DEMO_PRODUCTS.find((p) => p.id === productId) ?? null;
  }

  async getByBarcode(barcode: string): Promise<Product | null> {
    return DEMO_PRODUCTS.find((p) => p.barcode === barcode) ?? null;
  }

  async search(query: string, limit = 20): Promise<Product[]> {
    return DEMO_PRODUCTS.map((p) => ({ p, s: matchScore(query, `${p.name} ${p.brand ?? ""} ${p.keywords.join(" ")}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => x.p);
  }
}
