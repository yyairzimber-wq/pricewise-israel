import { describe, expect, it } from "vitest";
import type { PricePreferences, PriceQuote, Product } from "../types";
import { planShoppingTrip, type TripStop } from "./trip";

const prefs = { includePromos: false, includeClub: false, maxAgeHours: 48 } as PricePreferences;
const now = Date.parse("2026-10-04T10:00:00Z");
const product = (id: string): Product => ({ id, name: id, category: "other", source: { kind: "transparency-feed", label: "x" } });
const q = (productId: string, branchId: string, regular: number): PriceQuote => ({
  productId,
  chainId: branchId.split(":")[0],
  branchId,
  regular,
  currency: "ILS",
  updatedAt: new Date(now - 3_600_000).toISOString(),
  source: { kind: "transparency-feed", label: "x" },
});
const home = { lat: 32.0, lng: 34.8 };
// ~1 km per 0.009° of latitude
const stop = (id: string, km: number): TripStop => ({ id, chainId: id.split(":")[0], name: id, distanceKm: km, lat: home.lat + km * 0.009, lng: home.lng });
const lines = [
  { product: product("milk"), quantity: 1 },
  { product: product("bread"), quantity: 1 },
];

describe("planShoppingTrip", () => {
  const stops = [stop("a:1", 1), stop("b:1", 1.2)];
  const quotes = (milkA: number, breadA: number, milkB: number, breadB: number) =>
    new Map([
      ["milk", [q("milk", "a:1", milkA), q("milk", "b:1", milkB)]],
      ["bread", [q("bread", "a:1", breadA), q("bread", "b:1", breadB)]],
    ]);
  const opts = { prefs, costPerKm: 1, now };

  it("splits when each store is much cheaper for one item", () => {
    const { best, bestSingle } = planShoppingTrip(lines, quotes(5, 20, 12, 8), stops, home, opts);
    expect(best!.stops).toHaveLength(2);
    expect(best!.itemsTotal).toBe(13); // milk 5 at a, bread 8 at b
    expect(best!.effectiveTotal).toBeLessThan(bestSingle!.effectiveTotal);
  });

  it("stays at one store when splitting would not pay for the extra stop", () => {
    const { best } = planShoppingTrip(lines, quotes(10, 10, 9.5, 10), stops, home, opts);
    expect(best!.stops).toHaveLength(1);
  });

  it("never plans around a missing price", () => {
    const m = new Map([
      ["milk", [q("milk", "a:1", 5)]],
      ["bread", [q("bread", "b:1", 8)]],
    ]);
    const { best } = planShoppingTrip(lines, m, stops, home, opts);
    expect(best!.stops).toHaveLength(2); // the only way to cover both items
    const none = planShoppingTrip(lines, new Map([["milk", [q("milk", "a:1", 5)]]]), stops, home, opts);
    expect(none.best).toBeNull(); // bread has no price anywhere
  });

  it("ignores stale prices", () => {
    const old = { ...q("milk", "a:1", 1), updatedAt: new Date(now - 10 * 86_400_000).toISOString() };
    const m = new Map([
      ["milk", [old, q("milk", "b:1", 7)]],
      ["bread", [q("bread", "a:1", 6), q("bread", "b:1", 6)]],
    ]);
    const { best } = planShoppingTrip(lines, m, stops, home, opts);
    expect(best!.itemsTotal).toBe(13);
  });
});
