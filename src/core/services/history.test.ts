import { describe, expect, it } from "vitest";
import type { PriceHistory } from "../types";
import { analyze, priceOverTime } from "./history";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const h: PriceHistory = {
  since: "2026-10-01",
  until: "2026-10-20",
  series: [
    { chainId: "a", points: [{ date: "2026-10-01", regular: 10 }, { date: "2026-10-10", regular: 8 }] },
    { chainId: "b", points: [{ date: "2026-10-01", regular: 9 }, { date: "2026-10-15", regular: 11 }] },
  ],
};

describe("price history analysis", () => {
  it("cheapest across chains follows whichever chain is lowest each day", () => {
    const pts = priceOverTime(h);
    expect(pts.map((p) => [new Date(p.t).toISOString().slice(0, 10), p.price])).toEqual([
      ["2026-10-01", 9],
      ["2026-10-10", 8],
      ["2026-10-20", 8], // closing point at `until`
    ]);
  });

  it("a single chain's own series", () => {
    expect(priceOverTime(h, "b").map((p) => p.price)).toEqual([9, 11, 11]);
  });

  it("respects the followed-chains filter", () => {
    expect(priceOverTime(h, undefined, ["b"]).map((p) => p.price)).toEqual([9, 11, 11]);
  });

  it("says nothing about lowest/highest with under a week of data", () => {
    const s = analyze([{ t: day("2026-10-01"), price: 9 }, { t: day("2026-10-04"), price: 8 }]);
    expect(s?.verdict).toBe("collecting");
  });

  it("detects lowest, highest, stable and in-between", () => {
    const base = day("2026-10-01");
    const mk = (prices: number[]) => prices.map((price, i) => ({ t: base + i * 3 * 86_400_000, price }));
    expect(analyze(mk([10, 9, 8]))?.verdict).toBe("lowest");
    expect(analyze(mk([8, 9, 10]))?.verdict).toBe("highest");
    expect(analyze(mk([8, 10, 9]))?.verdict).toBe("between");
    expect(analyze(mk([8, 8.1, 8]))?.verdict).toBe("stable");
  });

  it("no points → no stats", () => {
    expect(analyze([])).toBeNull();
  });
});
