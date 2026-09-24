import type { CategoryId, DataSource, Product, ProductSize } from "../../types";
import type { CatalogProvider } from "../types";

/**
 * Real product metadata (name, brand, size, photo) from Open Food Facts —
 * a free, open database that includes many Israeli products (barcode prefix 729).
 * It has NO prices; it only tells us *what* was scanned.
 * https://world.openfoodfacts.org/data
 */
const BASE = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "code,product_name,product_name_he,brands,quantity,image_front_url,image_url,categories_tags,ingredients_text_he,ingredients_text";

interface OffProduct {
  code: string;
  product_name?: string;
  product_name_he?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
  categories_tags?: string[];
  ingredients_text_he?: string;
  ingredients_text?: string;
}

export class OpenFoodFactsCatalogProvider implements CatalogProvider {
  readonly id = "off";
  private cache = new Map<string, Product | null>();

  handles(productId: string) {
    return productId.startsWith("off:");
  }

  getById(productId: string) {
    return this.getByBarcode(productId.slice(4));
  }

  async getByBarcode(barcode: string): Promise<Product | null> {
    if (this.cache.has(barcode)) return this.cache.get(barcode)!;
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { status: number; product?: OffProduct };
      const product = json.status === 1 && json.product ? toProduct(json.product) : null;
      this.cache.set(barcode, product);
      return product;
    } catch {
      return null; // offline / blocked — caller falls back to other providers
    }
  }

  /** OFF full-text search is slow and English-centric; we rely on barcode lookups only. */
  async search(): Promise<Product[]> {
    return [];
  }
}

function toProduct(p: OffProduct): Product | null {
  const name = p.product_name_he || p.product_name;
  if (!name) return null;
  const source: DataSource = {
    kind: "open-food-facts",
    label: "Open Food Facts",
    url: `https://world.openfoodfacts.org/product/${p.code}`,
  };
  return {
    id: `off:${p.code}`,
    barcode: p.code,
    name,
    brand: p.brands?.split(",")[0]?.trim() || undefined,
    size: parseQuantity(p.quantity),
    category: guessCategory(p.categories_tags ?? []),
    imageUrl: p.image_front_url || p.image_url,
    ingredients: p.ingredients_text_he || p.ingredients_text,
    source,
  };
}

export function parseQuantity(q?: string): ProductSize | undefined {
  if (!q) return undefined;
  const m = q.replace(",", ".").match(/([\d.]+)\s*(kg|ml|cl|gr|g|l|ק["״]?ג|גרם|גר|ג|מ["״]?ל|ליטר|ל)/i);
  if (!m) return undefined;
  const amount = Number(m[1]);
  const u = m[2].toLowerCase().replace(/["״]/g, "");
  if (Number.isNaN(amount)) return undefined;
  if (u === "kg" || u === "קג") return { amount, unit: "kg" };
  if (u === "g" || u === "gr" || u === "גרם" || u === "גר" || u === "ג") return { amount, unit: "g" };
  if (u === "ml" || u === "מל") return { amount, unit: "ml" };
  if (u === "cl") return { amount: amount * 10, unit: "ml" };
  return { amount, unit: "l" };
}

const CATEGORY_HINTS: [string, CategoryId][] = [
  ["dair", "dairy"], ["milk", "dairy"], ["chees", "dairy"], ["yogurt", "dairy"],
  ["bread", "bakery"], ["breakfast-cereal", "breakfast"], ["cereal", "breakfast"],
  ["beverage", "drinks"], ["drink", "drinks"], ["water", "drinks"],
  ["snack", "snacks"], ["chocolate", "snacks"], ["sweet", "snacks"],
  ["frozen", "frozen"], ["meat", "meat"], ["poultr", "meat"],
  ["fruit", "produce"], ["vegetable", "produce"], ["baby", "baby"],
];

function guessCategory(tags: string[]): CategoryId {
  for (const [hint, cat] of CATEGORY_HINTS) if (tags.some((t) => t.includes(hint))) return cat;
  return tags.length ? "pantry" : "other";
}
