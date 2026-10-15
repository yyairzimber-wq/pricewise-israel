import { describe, expect, it } from "vitest";
import { CHAINS } from "../../core/data/chains";
import { readableOn } from "./primitives";

const lum = (hex: string) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("chain avatar text colour", () => {
  it("is readable (WCAG AA, 4.5:1) on every chain's brand colour", () => {
    for (const chain of CHAINS) {
      expect(contrast(readableOn(chain.color), chain.color), `${chain.name} ${chain.color}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
