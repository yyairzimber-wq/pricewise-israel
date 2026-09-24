import { CHAINS } from "../chains";
import type { CategoryId, ChainId, PricePoint, PriceQuote } from "../../types";
import { DEMO_SOURCE, type DemoProduct } from "./products";

/**
 * Deterministic generator for DEMO prices. The numbers are invented for UI
 * demonstration only; every quote it returns carries `source.kind = "demo"`
 * and the UI labels it as such.
 */

/** FNV-1a — stable across sessions so demo prices don't jump around. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const CHAIN_LEVEL: Record<ChainId, number> = {
  "osher-ad": 0.88,
  "rami-levy": 0.9,
  "hazi-hinam": 0.91,
  yochananof: 0.92,
  "mahsanei-hashuk": 0.93,
  victory: 0.95,
  carrefour: 0.97,
  "super-yuda": 1.0,
  shufersal: 1.03,
  freshmarket: 1.06,
  "tiv-taam": 1.12,
  "super-pharm": 1.15,
};

const PHARM_CATEGORIES: CategoryId[] = ["personal-care", "baby", "cleaning", "snacks", "drinks"];

/** Exact figures for the example in the product brief, so the demo tells a coherent story. */
const OVERRIDES: Record<string, Partial<Record<ChainId, number>>> = {
  "demo:talma-cornflakes-750": {
    shufersal: 19.9, yochananof: 16.9, "rami-levy": 17.5, victory: 18.9, "osher-ad": 17.9, "hazi-hinam": 17.9,
    carrefour: 18.5, "mahsanei-hashuk": 18.2, "tiv-taam": 21.9, freshmarket: 20.5,
  },
};

function shelfPrice(raw: number, h: number): number {
  const whole = Math.floor(raw);
  const endings = [0.9, 0.9, 0.5, 0.9, 0.0];
  return Number((whole + endings[h % endings.length]).toFixed(2)) || 0.9;
}

export function demoQuotes(product: DemoProduct, now = Date.now()): PriceQuote[] {
  const quotes: PriceQuote[] = [];
  for (const chain of CHAINS) {
    const h = hash(`${product.id}|${chain.id}`);
    if (chain.kind === "pharm" && !PHARM_CATEGORIES.includes(product.category)) continue;
    // Not every chain carries every product.
    if (h % 9 === 0 && !OVERRIDES[product.id]?.[chain.id]) continue;

    const jitter = 1 + (((h >>> 4) % 81) - 40) / 1000; // ±4%
    const override = OVERRIDES[product.id]?.[chain.id];
    const regular = override ?? shelfPrice(product.demoBase * (CHAIN_LEVEL[chain.id] ?? 1) * jitter, h >>> 8);

    // Freshness: most quotes are recent, a few are deliberately stale.
    const ageHours = !override && h % 17 === 0 ? 96 + (h % 48) : 1 + ((h >>> 3) % 40);

    const quote: PriceQuote = {
      productId: product.id,
      chainId: chain.id,
      regular,
      currency: "ILS",
      updatedAt: new Date(now - ageHours * 3_600_000).toISOString(),
      source: DEMO_SOURCE,
    };

    if (!override && (h >>> 5) % 6 === 0) {
      const qty = 2;
      const total = Math.floor(regular * qty * 0.82);
      quote.promo = {
        unitPrice: Number((total / qty).toFixed(2)),
        label: `${qty} ב-${total} ₪`,
        minQuantity: qty,
        validUntil: new Date(now + (3 + (h % 10)) * 86_400_000).toISOString(),
      };
    }
    if (chain.clubName && (h >>> 7) % 5 === 0) {
      quote.club = {
        unitPrice: Number((Math.round(regular * 9) / 10 - 0.1).toFixed(2)),
        clubName: chain.clubName,
        label: "10% הנחה לחברי מועדון",
      };
    }
    quotes.push(quote);
  }
  return quotes;
}

export function demoHistory(product: DemoProduct, chainId: ChainId, days: number, now = Date.now()): PricePoint[] {
  const current = demoQuotes(product, now).find((q) => q.chainId === chainId)?.regular;
  if (current == null) return [];
  const points: PricePoint[] = [];
  let price = current;
  for (let d = 0; d < days; d++) {
    const h = hash(`${product.id}|${chainId}|${d}`);
    if (d > 0 && h % 6 === 0) price = shelfPrice(current * (0.94 + (h % 13) / 100), h >>> 3);
    points.unshift({ date: new Date(now - d * 86_400_000).toISOString().slice(0, 10), price });
  }
  return points;
}
