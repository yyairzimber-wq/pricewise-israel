import { describe, expect, it } from "vitest";
import { decodeList, encodeList, shareUrl } from "./share";

describe("shared list links", () => {
  it("round-trips", () => {
    const lines = [
      { barcode: "7290000066318", quantity: 2 },
      { barcode: "7290112495228", quantity: 1 },
    ];
    expect(decodeList(encodeList(lines))).toEqual(lines);
  });

  it("drops anything that isn't barcode.quantity (links are untrusted input)", () => {
    expect(decodeList("7290000066318.2,<script>.1,123.1,7290112495228.0,7290112495228.3,7290112495228.5,abc")).toEqual([
      { barcode: "7290000066318", quantity: 2 },
      { barcode: "7290112495228", quantity: 3 },
    ]);
  });

  it("skips items without a real barcode and caps size", () => {
    expect(encodeList([{ barcode: "demo-1", quantity: 1 }])).toBe("");
    const many = Array.from({ length: 300 }, (_, i) => ({ barcode: String(7290000000000 + i), quantity: 1 }));
    expect(decodeList(encodeList(many))).toHaveLength(100);
  });

  it("builds a hash-route url", () => {
    expect(shareUrl([{ barcode: "7290000066318", quantity: 1 }], { origin: "https://x.app", pathname: "/" })).toBe("https://x.app/#/list/7290000066318.1");
  });
});
