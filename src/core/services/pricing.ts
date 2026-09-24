import { getChain } from "../data/chains";
import type { Chain, ChainId, PricePreferences, PriceQuote, Product, ProductId } from "../types";

/**
 * Pure price logic — no I/O, fully unit-testable. The central rule: a quote
 * that is too old is still *shown*, but it never decides which chain is
 * "the cheapest", and a missing price is never filled in with a guess.
 */

export type Freshness = "fresh" | "aging" | "stale";
export type PriceKind = "regular" | "promo" | "club";

export interface EffectivePrice {
  price: number;
  kind: PriceKind;
  label?: string;
}

export function ageHours(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 3_600_000;
}

export function freshness(iso: string, maxAgeHours: number, now = Date.now()): Freshness {
  const h = ageHours(iso, now);
  if (h <= 24) return "fresh";
  if (h <= maxAgeHours) return "aging";
  return "stale";
}

/** Lowest price the shopper can actually get for `quantity` units given their preferences. */
export function bestPrice(quote: PriceQuote, prefs: PricePreferences, quantity = 1): EffectivePrice | null {
  const options: EffectivePrice[] = [];
  if (quote.regular != null) options.push({ price: quote.regular, kind: "regular" });
  if (prefs.includePromos && quote.promo && quantity >= (quote.promo.minQuantity ?? 1)) {
    if (!quote.promo.validUntil || new Date(quote.promo.validUntil).getTime() > Date.now()) {
      options.push({ price: quote.promo.unitPrice, kind: "promo", label: quote.promo.label });
    }
  }
  if (prefs.includeClub && quote.club) {
    options.push({ price: quote.club.unitPrice, kind: "club", label: quote.club.clubName });
  }
  if (!options.length) return null;
  return options.reduce((a, b) => (b.price < a.price ? b : a));
}

export interface ComparisonRow {
  chain: Chain;
  quote: PriceQuote;
  best: EffectivePrice | null;
  freshness: Freshness;
  /** Has a price and is recent enough to be ranked. */
  eligible: boolean;
  isCheapest: boolean;
  diffFromCheapest: number | null;
}

export interface ProductComparison {
  rows: ComparisonRow[];
  cheapest?: ComparisonRow;
  mostExpensive?: ComparisonRow;
  /** Price gap between the cheapest and the most expensive eligible chain. */
  spread: number;
  spreadPct: number;
  /** Chains the user follows that have no quote at all for this product. */
  missingChains: Chain[];
  reference?: { row: ComparisonRow; saving: number; savingPct: number };
}

export function compareProduct(
  quotes: PriceQuote[],
  opts: { prefs: PricePreferences; chainIds: ChainId[]; referenceChainId?: ChainId; now?: number },
): ProductComparison {
  const allowed = new Set(opts.chainIds);
  const rows: ComparisonRow[] = quotes
    .filter((q) => allowed.has(q.chainId))
    .map((quote) => {
      const best = bestPrice(quote, opts.prefs);
      const fr = freshness(quote.updatedAt, opts.prefs.maxAgeHours, opts.now);
      return {
        chain: getChain(quote.chainId),
        quote,
        best,
        freshness: fr,
        eligible: best != null && fr !== "stale",
        isCheapest: false,
        diffFromCheapest: null,
      };
    });

  const eligible = rows.filter((r) => r.eligible).sort((a, b) => a.best!.price - b.best!.price);
  const ineligible = rows.filter((r) => !r.eligible).sort((a, b) => (a.best?.price ?? Infinity) - (b.best?.price ?? Infinity));
  const cheapest = eligible[0];
  const mostExpensive = eligible[eligible.length - 1];

  if (cheapest) {
    const min = cheapest.best!.price;
    for (const r of eligible) {
      r.diffFromCheapest = round2(r.best!.price - min);
      r.isCheapest = r.best!.price === min;
    }
  }

  const spread = cheapest && mostExpensive ? round2(mostExpensive.best!.price - cheapest.best!.price) : 0;
  const spreadPct = cheapest && mostExpensive && mostExpensive.best!.price > 0 ? (spread / mostExpensive.best!.price) * 100 : 0;

  let reference: ProductComparison["reference"];
  const refRow = opts.referenceChainId ? eligible.find((r) => r.chain.id === opts.referenceChainId) : undefined;
  if (refRow && cheapest && refRow.best!.price > cheapest.best!.price) {
    const saving = round2(refRow.best!.price - cheapest.best!.price);
    reference = { row: refRow, saving, savingPct: (saving / refRow.best!.price) * 100 };
  }

  const quoted = new Set(quotes.map((q) => q.chainId));
  const missingChains = opts.chainIds.filter((id) => !quoted.has(id)).map(getChain);

  return {
    rows: [...eligible, ...ineligible],
    cheapest,
    mostExpensive: eligible.length > 1 ? mostExpensive : undefined,
    spread,
    spreadPct,
    missingChains,
    reference,
  };
}

// ---------------------------------------------------------------------------
// Basket
// ---------------------------------------------------------------------------

export interface BasketLine {
  product: Product;
  quantity: number;
}

export interface BasketChainLine {
  product: Product;
  quantity: number;
  unitPrice: number;
  kind: PriceKind;
  lineTotal: number;
}

export interface BasketChainResult {
  chain: Chain;
  total: number;
  lines: BasketChainLine[];
  /** Products with no verified (priced + fresh) quote at this chain. */
  missing: Product[];
  complete: boolean;
}

export interface BasketComparison {
  chains: BasketChainResult[];
  cheapest?: BasketChainResult;
  mostExpensive?: BasketChainResult;
  saving: number;
  /** Buying every item at whichever chain is cheapest for it. */
  split?: { total: number; picks: { product: Product; chain: Chain; lineTotal: number }[]; chainCount: number };
  itemCount: number;
}

export function compareBasket(
  lines: BasketLine[],
  quotesByProduct: Map<ProductId, PriceQuote[]>,
  opts: { prefs: PricePreferences; chainIds: ChainId[]; now?: number },
): BasketComparison {
  const results: BasketChainResult[] = opts.chainIds.map((chainId) => {
    const out: BasketChainResult = { chain: getChain(chainId), total: 0, lines: [], missing: [], complete: true };
    for (const line of lines) {
      const quote = quotesByProduct.get(line.product.id)?.find((q) => q.chainId === chainId);
      const best = quote ? bestPrice(quote, opts.prefs, line.quantity) : null;
      if (!quote || !best || freshness(quote.updatedAt, opts.prefs.maxAgeHours, opts.now) === "stale") {
        out.missing.push(line.product);
        out.complete = false;
        continue;
      }
      const lineTotal = round2(best.price * line.quantity);
      out.lines.push({ product: line.product, quantity: line.quantity, unitPrice: best.price, kind: best.kind, lineTotal });
      out.total = round2(out.total + lineTotal);
    }
    return out;
  });

  const withData = results.filter((r) => r.lines.length > 0);
  withData.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (!a.complete && a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return a.total - b.total;
  });

  const complete = withData.filter((r) => r.complete);
  const cheapest = complete[0];
  const mostExpensive = complete.length > 1 ? complete[complete.length - 1] : undefined;

  // Split basket: cheapest verified chain per item. Only meaningful if every item has a price somewhere.
  let split: BasketComparison["split"];
  const picks: { product: Product; chain: Chain; lineTotal: number }[] = [];
  for (const line of lines) {
    let bestPick: { chain: Chain; lineTotal: number } | undefined;
    for (const r of results) {
      const l = r.lines.find((x) => x.product.id === line.product.id);
      if (l && (!bestPick || l.lineTotal < bestPick.lineTotal)) bestPick = { chain: r.chain, lineTotal: l.lineTotal };
    }
    if (bestPick) picks.push({ product: line.product, ...bestPick });
  }
  if (lines.length > 0 && picks.length === lines.length) {
    split = {
      total: round2(picks.reduce((s, p) => s + p.lineTotal, 0)),
      picks,
      chainCount: new Set(picks.map((p) => p.chain.id)).size,
    };
  }

  return {
    chains: withData,
    cheapest,
    mostExpensive,
    saving: cheapest && mostExpensive ? round2(mostExpensive.total - cheapest.total) : 0,
    split,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Basket at specific nearby branches, including the cost of getting there
// ---------------------------------------------------------------------------

export interface BranchStop {
  id: string;
  chainId: ChainId;
  name: string;
  distanceKm: number;
  approximate?: boolean;
}

export interface NearbyBasketResult {
  branch: BranchStop;
  chain: Chain;
  basketTotal: number;
  travelCost: number;
  /** basketTotal + travelCost — what the trip really costs. */
  effectiveTotal: number;
  missing: Product[];
  complete: boolean;
}

/**
 * Price the basket at each given branch (branch-level quotes, `quote.branchId`)
 * and add a round-trip travel cost. Incomplete baskets are listed after complete
 * ones and never ranked as "cheapest".
 */
export function compareBasketNearby(
  lines: BasketLine[],
  branchQuotesByProduct: Map<ProductId, PriceQuote[]>,
  stops: BranchStop[],
  opts: { prefs: PricePreferences; costPerKm: number; now?: number },
): NearbyBasketResult[] {
  // Re-key quotes by branch so the chain-level basket logic can be reused as-is.
  const byBranch = new Map<ProductId, PriceQuote[]>();
  for (const [productId, quotes] of branchQuotesByProduct) {
    byBranch.set(productId, quotes.filter((q) => q.branchId).map((q) => ({ ...q, chainId: q.branchId! })));
  }
  const res = compareBasket(lines, byBranch, { prefs: opts.prefs, chainIds: stops.map((s) => s.id), now: opts.now });
  const results: NearbyBasketResult[] = stops.map((stop) => {
    const r = res.chains.find((c) => c.chain.id === stop.id);
    const travelCost = round2(stop.distanceKm * 2 * opts.costPerKm);
    const basketTotal = r?.total ?? 0;
    return {
      branch: stop,
      chain: getChain(stop.chainId),
      basketTotal,
      travelCost,
      effectiveTotal: round2(basketTotal + travelCost),
      missing: r ? r.missing : lines.map((l) => l.product),
      complete: !!r?.complete,
    };
  });
  return results
    .filter((r) => r.missing.length < lines.length) // branch has at least something
    .sort((a, b) => (a.complete !== b.complete ? (a.complete ? -1 : 1) : a.complete ? a.effectiveTotal - b.effectiveTotal : a.missing.length - b.missing.length));
}

// ---------------------------------------------------------------------------
// Price watch (favorites)
// ---------------------------------------------------------------------------

export interface PriceWatchBaseline {
  price: number;
  chainId: ChainId;
  at: string;
}

export interface PriceChange {
  current: number;
  chainId: ChainId;
  /** Positive = cheaper than when the user saved it. */
  drop: number;
  dropPct: number;
}

export function priceChange(baseline: PriceWatchBaseline | undefined, cheapest: ComparisonRow | undefined): PriceChange | null {
  if (!baseline || !cheapest?.best) return null;
  const drop = round2(baseline.price - cheapest.best.price);
  return { current: cheapest.best.price, chainId: cheapest.chain.id, drop, dropPct: baseline.price > 0 ? (drop / baseline.price) * 100 : 0 };
}
