import { DEMO_PRODUCTS } from "../../data/demo/products";
import { demoHistory, demoQuotes } from "../../data/demo/prices";
import type { Product } from "../../types";
import type { PriceProvider, PriceQuery } from "../types";

/**
 * Serves invented prices for the bundled demo catalog only. For any real
 * product (e.g. one found on Open Food Facts) it returns nothing, and the UI
 * shows "אין לנו כרגע מחיר מאומת" — it never makes up a price for a real item.
 */
export class DemoPriceProvider implements PriceProvider {
  readonly id = "demo";
  readonly isDemo = true;

  async getQuotes(product: Product, query: PriceQuery = {}) {
    const demo = DEMO_PRODUCTS.find((p) => p.id === product.id);
    if (!demo || query.branchIds) return []; // demo data has no per-branch prices
    await delay(250); // feel of a network call so loading states get exercised
    const quotes = demoQuotes(demo);
    return query.chainIds ? quotes.filter((q) => query.chainIds!.includes(q.chainId)) : quotes;
  }

  async getHistory(product: Product, chainId: string, days: number) {
    const demo = DEMO_PRODUCTS.find((p) => p.id === product.id);
    return demo ? demoHistory(demo, chainId, days) : [];
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
