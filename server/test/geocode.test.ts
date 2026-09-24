import { describe, expect, it } from "vitest";
import { normalizeAddress, normalizeCity, sameCity, sameStreet } from "../src/geocode.ts";

// Real addresses from the chains' Stores files.
describe("normalizeAddress", () => {
  it.each([
    ["7 דרך הערבה", { street: "דרך הערבה", houseNumber: "7" }],
    ["רח' יעקב כהן 8", { street: "יעקב כהן", houseNumber: "8" }],
    ["2 שד.הארזים", { street: "שדרות הארזים", houseNumber: "2" }],
    ["שד ירושלים 1", { street: "שדרות ירושלים", houseNumber: "1" }],
    ['צה"ל 71, מרכ', { street: "צהל", houseNumber: "71" }],
    ["האומן,15", { street: "האומן", houseNumber: undefined }],
    ["ההנפה", { street: "ההנפה", houseNumber: undefined }],
    ["שדה בוקר 4", { street: "שדה בוקר", houseNumber: "4" }],
  ])("%s", (raw, expected) => {
    expect(normalizeAddress(raw)).toEqual(expected);
  });

  it("rejects non-addresses", () => {
    expect(normalizeAddress("https://www.ybitan.co.il")).toBeNull();
    expect(normalizeAddress(null)).toBeNull();
    expect(normalizeAddress("15")).toBeNull();
  });

  it("normalises city spellings", () => {
    expect(normalizeCity("תל אביב - יפו")).toBe("תל אביב יפו");
  });
});

describe("verification of fuzzy geocoder hits", () => {
  it("accepts the same street despite typos and prefixes", () => {
    expect(sameStreet("רוטישילד", "רוטשילד")).toBe(true);
    expect(sameStreet("אורוגוואי", "אורוגואי")).toBe(true);
    expect(sameStreet("דרך הערבה", "הערבה")).toBe(true);
    expect(sameStreet("משה יתום", "משה יתום")).toBe(true);
  });

  it("rejects different streets that only look similar (real Photon mistakes)", () => {
    expect(sameStreet("יהודה מכבי", "בן יהודה")).toBe(false);
    expect(sameStreet("השומר", "בני ברק")).toBe(false);
    expect(sameStreet("יעקב כהן", "פרופ' וילהלמינה כהן")).toBe(false);
    expect(sameStreet("האחוזה", "האחוה")).toBe(false);
    expect(sameStreet("הרצל", "הרצליה")).toBe(false);
  });

  it("requires the right town", () => {
    expect(sameCity("תל אביב - יפו", ["תל אביב–יפו"])).toBe(true);
    expect(sameCity("מודיעין-מכבים-רעות", ["מודיעין-מכבים-רעות"])).toBe(true);
    expect(sameCity("פתח תקווה", ["נתניה"])).toBe(false);
    expect(sameCity("כפר סבא", ["ירושלים | القدس"])).toBe(false);
  });
});
