import { describe, expect, it } from "vitest";
import { isBarcode, matchScore, normalize } from "./text";

const rank = (query: string, names: string[]) => [...names].sort((a, b) => matchScore(query, b) - matchScore(query, a));

describe("search ranking", () => {
  it("a product that IS the searched thing beats one that merely contains the word", () => {
    expect(rank("חלב", ["שוקולד פרה חלב 100ג עלית", "פריכיות תחתית חלב 80גרם", "חלב בקרטון 3% שומן 1 ל"])[0]).toBe("חלב בקרטון 3% שומן 1 ל");
    expect(rank("לחם", ["פירורי לחם 200ג סוגת", "לחם ברמן אקטיב 750 גרם"])[0]).toBe("לחם ברמן אקטיב 750 גרם");
    expect(rank("עגבניות", ["רוטב עגבניות פריניר260גר", "עגבניות שרי 500 גרם"])[0]).toBe("עגבניות שרי 500 גרם");
    expect(rank("ביצים", ["נודלס ביצים 500 גרם", "ביצים ארוזות L 12 יחידות"])[0]).toBe("ביצים ארוזות L 12 יחידות");
  });

  it("all query words are still required", () => {
    expect(matchScore("חלב תנובה", "חלב בקרטון 3% שומן 1 ל")).toBe(0);
    expect(matchScore("חלב תנובה", "חלב תנובה 3% שומן 2 ליטר")).toBeGreaterThan(0);
    expect(matchScore("", "חלב")).toBe(0);
  });

  it("an exact word beats a prefix, which beats a fragment", () => {
    const exact = matchScore("קוטג", "קוטג 5% 250 גרם");
    const prefix = matchScore("קוטג", "קוטגים 250 גרם");
    const fragment = matchScore("קוטג", "גבינתקוטג 250");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(fragment);
    expect(fragment).toBeGreaterThan(0);
  });

  it("ignores punctuation and niqqud, so quotes in names don't hide products", () => {
    expect(matchScore("קוטג", "קוטג' 5%")).toBeGreaterThan(0);
    expect(normalize("קוֹטֶג'")).toBe("קוטג");
  });

  it("isBarcode", () => {
    expect(isBarcode(" 7290000066318 ")).toBe(true);
    expect(isBarcode("123")).toBe(false);
  });
});
