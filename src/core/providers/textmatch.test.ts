import { describe, expect, it } from "vitest";
import { StaticSnapshot, TextMatcher } from "./static";

const meta = { format: 2, units: ["גרם", "ליטר"], categories: ["dairy", "breakfast", "snacks"], chains: [] };
const rows = [
  ["1", "קורנפלקס דבש 448ג תלמה", "יוניליוור", 12, 1, 448, 0],
  ["2", "קורנפלקס מלא תלמה", "יוניליוור", 10, 1, 500, 0],
  ["3", "קוטג תנובה 3% 250ג", "תנובה", 14, 0, 250, 0],
  ["4", "קוטג תנובה 9% 250ג", "תנובה", 14, 0, 250, 0],
  ["5", "במבה 80 גרם אסם", "אסם", 14, 2, 80, 0],
  ...Array.from({ length: 600 }, (_, i) => [`x${i}`, `מוצר אחר ${i}`, 0, 1, 2, 0, -1]),
];
const snap = Object.assign(Object.create(StaticSnapshot.prototype), {
  getMeta: async () => meta,
  getSearch: async () => rows,
}) as StaticSnapshot;

describe("TextMatcher (text read off a package → products)", () => {
  const m = new TextMatcher(snap);

  it("tolerates one wrong letter from OCR", async () => {
    const [top] = await m.match("אאא פוכר וורנפלקס דבש");
    expect(top.product.barcode).toBe("1");
  });

  it("uses numbers on the pack to separate variants", async () => {
    const [top, second] = await m.match("גתנובה קוטג 3% 250");
    expect(top.product.barcode).toBe("3");
    expect(top.score).toBeGreaterThan(second.score);
  });

  it("ignores stray letters glued to the start of a word", async () => {
    const [top] = await m.match("קו גיתנובה 3%");
    expect(top.product.barcode).toBe("3");
  });

  it("returns nothing for unrelated text", async () => {
    expect(await m.match("שלום עולם ABC")).toEqual([]);
  });
});
