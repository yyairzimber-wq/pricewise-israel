import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS, demoBarcode, ean13CheckDigit } from "../data/demo/products";
import { demoQuotes } from "../data/demo/prices";
import type { PriceQuote, Product } from "../types";
import { bestPrice, compareBasket, compareBasketNearby, compareProduct, freshness, priceChange } from "./pricing";

const NOW = Date.parse("2026-09-23T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const src = { kind: "api" as const, label: "test" };
const prefs = { includePromos: true, includeClub: false, maxAgeHours: 72 };

function q(chainId: string, regular: number | null, extra: Partial<PriceQuote> = {}): PriceQuote {
  return { productId: "p", chainId, regular, currency: "ILS", updatedAt: hoursAgo(2), source: src, ...extra };
}

describe("freshness", () => {
  it("classifies by age", () => {
    expect(freshness(hoursAgo(3), 72, NOW)).toBe("fresh");
    expect(freshness(hoursAgo(30), 72, NOW)).toBe("aging");
    expect(freshness(hoursAgo(100), 72, NOW)).toBe("stale");
  });
});

describe("bestPrice", () => {
  it("ignores club prices unless enabled", () => {
    const quote = q("a", 10, { club: { unitPrice: 8, clubName: "x" } });
    expect(bestPrice(quote, prefs)?.price).toBe(10);
    expect(bestPrice(quote, { ...prefs, includeClub: true })).toMatchObject({ price: 8, kind: "club" });
  });

  it("applies multi-buy promos only when quantity qualifies", () => {
    const quote = q("a", 10, { promo: { unitPrice: 7.5, label: "2 ב-15", minQuantity: 2 } });
    expect(bestPrice(quote, prefs, 1)?.kind).toBe("regular");
    expect(bestPrice(quote, prefs, 2)).toMatchObject({ price: 7.5, kind: "promo" });
  });

  it("returns null when there is no price at all", () => {
    expect(bestPrice(q("a", null), prefs)).toBeNull();
  });
});

describe("compareProduct", () => {
  const quotes = [q("shufersal", 19.9), q("yochananof", 16.9), q("rami-levy", 17.5), q("victory", 18.9), q("old", 9.9, { updatedAt: hoursAgo(200) })];
  const chainIds = ["shufersal", "yochananof", "rami-levy", "victory", "old", "carrefour"];

  it("ranks cheapest and never lets a stale price win", () => {
    const c = compareProduct(quotes, { prefs, chainIds, now: NOW });
    expect(c.cheapest?.chain.id).toBe("yochananof");
    expect(c.rows.at(-1)?.quote.chainId).toBe("old");
    expect(c.rows.find((r) => r.quote.chainId === "old")?.eligible).toBe(false);
  });

  it("computes saving vs. the store the user is in (brief example: 3.00 ₪)", () => {
    const c = compareProduct(quotes, { prefs, chainIds, referenceChainId: "shufersal", now: NOW });
    expect(c.reference?.saving).toBe(3);
    expect(Math.round(c.reference!.savingPct)).toBe(15);
  });

  it("lists followed chains with no quote as missing, without inventing a price", () => {
    const c = compareProduct(quotes, { prefs, chainIds, now: NOW });
    expect(c.missingChains.map((x) => x.id)).toEqual(["carrefour"]);
  });
});

describe("compareBasket", () => {
  const a = { id: "a", name: "A", category: "other", source: src } as Product;
  const b = { id: "b", name: "B", category: "other", source: src } as Product;
  const map = new Map<string, PriceQuote[]>([
    ["a", [q("x", 10), q("y", 12)]],
    ["b", [q("x", 5), q("y", 3), q("z", 1)]],
  ]);

  it("totals per chain, flags incomplete baskets and finds the split optimum", () => {
    const r = compareBasket([{ product: a, quantity: 2 }, { product: b, quantity: 1 }], map, { prefs, chainIds: ["x", "y", "z"], now: NOW });
    expect(r.cheapest?.chain.id).toBe("x");
    expect(r.cheapest?.total).toBe(25);
    expect(r.mostExpensive?.total).toBe(27);
    expect(r.saving).toBe(2);
    expect(r.chains.find((c) => c.chain.id === "z")?.complete).toBe(false);
    expect(r.split?.total).toBe(21); // 2×10 at x + 1 at z
  });
});

describe("demo data", () => {
  it("uses valid EAN-13 barcodes in the GS1 internal-use range", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.barcode).toMatch(/^2\d{12}$/);
      expect(ean13CheckDigit(p.barcode!.slice(0, 12))).toBe(p.barcode!.slice(12));
    }
    expect(demoBarcode(1)).toHaveLength(13);
  });

  it("generates plausible, past-dated prices for every demo product", () => {
    for (const p of DEMO_PRODUCTS) {
      for (const quote of demoQuotes(p, NOW)) {
        expect(quote.regular!).toBeGreaterThan(p.demoBase * 0.75);
        expect(quote.regular!).toBeLessThan(p.demoBase * 1.3);
        expect(Date.parse(quote.updatedAt)).toBeLessThan(NOW);
      }
    }
  });

  it("marks every demo quote as demo and matches the brief's cornflakes example", () => {
    const talma = DEMO_PRODUCTS.find((p) => p.id === "demo:talma-cornflakes-750")!;
    const quotes = demoQuotes(talma, NOW);
    expect(quotes.every((x) => x.source.kind === "demo")).toBe(true);
    expect(quotes.find((x) => x.chainId === "yochananof")?.regular).toBe(16.9);
    expect(quotes.find((x) => x.chainId === "shufersal")?.regular).toBe(19.9);
  });
});

describe("compareBasketNearby", () => {
  const a = { id: "a", name: "A", category: "other", source: src } as Product;
  const b = { id: "b", name: "B", category: "other", source: src } as Product;
  const bq = (branchId: string, chainId: string, price: number) => q(chainId, price, { branchId });
  const map = new Map<string, PriceQuote[]>([
    ["a", [bq("x:1", "x", 10), bq("y:7", "y", 9)]],
    ["b", [bq("x:1", "x", 5), bq("y:7", "y", 5)]],
  ]);
  const stops = [
    { id: "x:1", chainId: "x", name: "X near", distanceKm: 0.5 },
    { id: "y:7", chainId: "y", name: "Y far", distanceKm: 6 },
    { id: "z:2", chainId: "z", name: "Z no data", distanceKm: 1 },
  ];

  it("adds round-trip travel cost, so a cheaper basket far away can lose", () => {
    const r = compareBasketNearby([{ product: a, quantity: 1 }, { product: b, quantity: 1 }], map, stops, { prefs, costPerKm: 1, now: NOW });
    expect(r.map((x) => x.branch.id)).toEqual(["x:1", "y:7"]); // z has no data at all → omitted
    expect(r[0]).toMatchObject({ basketTotal: 15, travelCost: 1, effectiveTotal: 16, complete: true });
    expect(r[1]).toMatchObject({ basketTotal: 14, travelCost: 12, effectiveTotal: 26 });
  });

  it("ranks purely by basket price when travel cost is zero", () => {
    const r = compareBasketNearby([{ product: a, quantity: 1 }, { product: b, quantity: 1 }], map, stops, { prefs, costPerKm: 0, now: NOW });
    expect(r[0].branch.id).toBe("y:7");
  });
});

describe("priceChange", () => {
  it("reports how much cheaper a favorite got since it was saved", () => {
    const c = compareProduct([q("x", 8.9), q("y", 9.9)], { prefs, chainIds: ["x", "y"], now: NOW });
    expect(priceChange({ price: 9.9, chainId: "y", at: hoursAgo(48) }, c.cheapest)).toMatchObject({ current: 8.9, chainId: "x", drop: 1 });
    expect(priceChange(undefined, c.cheapest)).toBeNull();
  });
});
