import { describe, expect, it } from "vitest";
import { cleanManufacturer, cleanText } from "../src/aggregate.ts";

const BS = String.fromCharCode(92); // a literal backslash, as it appears in the chains' files

describe("cleanText — artefacts from the chains' price files", () => {
  it("turns an escaped quote into a quote", () => {
    expect(cleanText(`טמפו משקאות בע${BS}"מ`)).toBe('טמפו משקאות בע"מ');
  });

  it("turns literal backslash-n / backslash-t into spaces", () => {
    expect(cleanText(`יוניליוור ישראל${BS}nטיפוח`)).toBe("יוניליוור ישראל טיפוח");
    expect(cleanText(`א${BS}tב${BS}rג`)).toBe("א ב ג");
  });

  it("drops stray backslashes and collapses whitespace", () => {
    expect(cleanText(`  פ.פ.ה   טאביט ספ${BS}  `)).toBe("פ.פ.ה טאביט ספ");
    expect(cleanText(`יבואן${BS}1`)).toBe("יבואן 1");
  });

  it("leaves clean text alone and tolerates null", () => {
    expect(cleanText("חלב 3% 1 ליטר")).toBe("חלב 3% 1 ליטר");
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });

  it("cleanManufacturer cleans first, then drops placeholders", () => {
    expect(cleanManufacturer(`שטראוס בע${BS}"מ`)).toBe('שטראוס בע"מ');
    expect(cleanManufacturer(`${BS}n`)).toBeUndefined();
    expect(cleanManufacturer("---")).toBeUndefined();
  });
});
