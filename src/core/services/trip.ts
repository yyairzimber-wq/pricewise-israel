import type { GeoPoint, PricePreferences, PriceQuote, Product, ProductId } from "../types";
import { distanceKm } from "./geo";
import { bestPrice, freshness, round2, type BasketLine, type BranchStop, type PriceKind } from "./pricing";

/**
 * Shopping trip: which 1–3 stores to visit, and what to buy where.
 * Pure logic, no I/O.
 */

export interface TripStop extends BranchStop {
  lat: number;
  lng: number;
}

export interface TripItem {
  product: Product;
  quantity: number;
  lineTotal: number;
  kind: PriceKind;
}

export interface TripPlan {
  stops: { stop: TripStop; items: TripItem[]; subtotal: number }[];
  itemsTotal: number;
  /** Driving-loop estimate: home → stops → home, straight-line legs. */
  travelKm: number;
  travelCost: number;
  /** A small fee per extra stop for the time it takes. */
  stopCost: number;
  /** itemsTotal + travelCost + stopCost — what the whole trip really costs. */
  effectiveTotal: number;
}

/** What one additional stop is assumed to cost in time, in ₪ (shown to the user). */
export const EXTRA_STOP_COST = 5;

function* subsets<T>(list: T[], size: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === size) {
    yield acc;
    return;
  }
  for (let i = start; i < list.length; i++) yield* subsets(list, size, i + 1, [...acc, list[i]]);
}

function* permutations<T>(list: T[]): Generator<T[]> {
  if (list.length <= 1) {
    yield list;
    return;
  }
  for (let i = 0; i < list.length; i++) for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
}

function loopKm(home: GeoPoint, stops: TripStop[]): number {
  let best = Infinity;
  for (const order of permutations(stops)) {
    let km = 0;
    let at: GeoPoint = home;
    for (const s of order) {
      km += distanceKm(at, s);
      at = s;
    }
    best = Math.min(best, km + distanceKm(at, home));
  }
  return best;
}

/**
 * Cheapest way to buy the whole basket using at most `maxStops` of the given
 * branches: every item is bought at whichever chosen stop has it cheapest, and
 * the trip's driving and per-stop time are added to the bill. Only items with
 * a verified fresh price count, and a plan must cover every item — a missing
 * price is never guessed. Returns the best plan next to the best single-stop
 * plan so the UI can show what splitting actually saves.
 */
export function planShoppingTrip(
  lines: BasketLine[],
  branchQuotesByProduct: Map<ProductId, PriceQuote[]>,
  stops: TripStop[],
  home: GeoPoint,
  opts: { prefs: PricePreferences; costPerKm: number; maxStops?: number; extraStopCost?: number; now?: number },
): { best: TripPlan | null; bestSingle: TripPlan | null } {
  const maxStops = opts.maxStops ?? 3;
  const extra = opts.extraStopCost ?? EXTRA_STOP_COST;

  // price[stop][line] = verified line total at that stop, or null
  const price = stops.map((stop) =>
    lines.map((line) => {
      const quote = branchQuotesByProduct.get(line.product.id)?.find((q) => q.branchId === stop.id);
      const best = quote ? bestPrice(quote, opts.prefs, line.quantity) : null;
      if (!quote || !best || freshness(quote.updatedAt, opts.prefs.maxAgeHours, opts.now) === "stale") return null;
      return { total: round2(best.price * line.quantity), kind: best.kind };
    }),
  );
  const usable = stops.map((_, i) => i).filter((i) => price[i].some((p) => p));

  let best: TripPlan | null = null;
  let bestSingle: TripPlan | null = null;
  for (let k = 1; k <= Math.min(maxStops, usable.length); k++) {
    for (const subset of subsets(usable, k)) {
      const assigned = new Map<number, TripItem[]>();
      let itemsTotal = 0;
      let covered = true;
      for (let li = 0; li < lines.length; li++) {
        let pick = -1;
        for (const si of subset) {
          const p = price[si][li];
          if (p && (pick < 0 || p.total < price[pick][li]!.total)) pick = si;
        }
        if (pick < 0) {
          covered = false;
          break;
        }
        const p = price[pick][li]!;
        itemsTotal += p.total;
        assigned.set(pick, [...(assigned.get(pick) ?? []), { product: lines[li].product, quantity: lines[li].quantity, lineTotal: p.total, kind: p.kind }]);
      }
      if (!covered) continue;
      const used = subset.filter((si) => assigned.has(si));
      const travelKm = loopKm(home, used.map((si) => stops[si]));
      const travelCost = round2(travelKm * opts.costPerKm);
      const stopCost = round2((used.length - 1) * extra);
      const plan: TripPlan = {
        stops: used.map((si) => ({ stop: stops[si], items: assigned.get(si)!, subtotal: round2(assigned.get(si)!.reduce((n, it) => n + it.lineTotal, 0)) })),
        itemsTotal: round2(itemsTotal),
        travelKm: Math.round(travelKm * 10) / 10,
        travelCost,
        stopCost,
        effectiveTotal: round2(itemsTotal + travelCost + stopCost),
      };
      if (!best || plan.effectiveTotal < best.effectiveTotal) best = plan;
      if (used.length === 1 && (!bestSingle || plan.effectiveTotal < bestSingle.effectiveTotal)) bestSingle = plan;
    }
  }
  return { best, bestSingle };
}
