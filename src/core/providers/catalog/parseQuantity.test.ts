import { describe, expect, it } from "vitest";
import { parseQuantity } from "./OpenFoodFactsCatalogProvider";

describe("parseQuantity (Open Food Facts quantity strings)", () => {
  it.each([
    ["80 ג", { amount: 80, unit: "g" }],
    ["750 גרם", { amount: 750, unit: "g" }],
    ["1 ק\"ג", { amount: 1, unit: "kg" }],
    ["1.5 ליטר", { amount: 1.5, unit: "l" }],
    ["500 מ״ל", { amount: 500, unit: "ml" }],
    ["330 ml", { amount: 330, unit: "ml" }],
    ["33 cl", { amount: 330, unit: "ml" }],
    ["1,5 L", { amount: 1.5, unit: "l" }],
  ])("%s", (input, expected) => {
    expect(parseQuantity(input)).toEqual(expected);
  });

  it("returns undefined for unparseable input", () => {
    expect(parseQuantity("מארז משפחתי")).toBeUndefined();
    expect(parseQuantity(undefined)).toBeUndefined();
  });
});
