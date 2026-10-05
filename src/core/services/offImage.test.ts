import { describe, expect, it } from "vitest";
import { compactImage, expandImage, offFolder, thumbOf } from "./offImage";

describe("Open Food Facts image urls", () => {
  const url = "https://images.openfoodfacts.org/images/products/729/000/006/6318/front_he.29.400.jpg";
  it("folder layout", () => {
    expect(offFolder("7290000066318")).toBe("729/000/006/6318");
    expect(offFolder("12345678")).toBe("12345678");
    expect(offFolder("0033984041318")).toBe("003/398/404/1318");
  });
  it("compacts and expands losslessly", () => {
    expect(compactImage("7290000066318", url)).toBe("he.29");
    expect(expandImage("7290000066318", "he.29")).toBe(url);
    expect(compactImage("7290000066318", url.replace(".400.", ".full."))).toBe("he.29");
  });
  it("keeps urls it can't round-trip", () => {
    const odd = "https://example.com/pic.jpg";
    expect(compactImage("7290000066318", odd)).toBe(odd);
    expect(expandImage("7290000066318", odd)).toBe(odd);
    // a url whose folder doesn't match the barcode must not be shortened
    expect(compactImage("7290000066319", url)).toBe(url);
  });
  it("thumbnail", () => {
    expect(thumbOf(url)).toBe(url.replace(".400.", ".200."));
    expect(thumbOf("https://example.com/x.jpg")).toBe("https://example.com/x.jpg");
  });
});
