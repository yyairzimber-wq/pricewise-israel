import { describe, expect, it } from "vitest";
import { guessCategory } from "../src/aggregate.ts";

const cat = (name: string) => guessCategory(name).category;

describe("guessCategory — real product names, including the tricky ones", () => {
  it.each([
    // the thing itself vs. a product that merely contains the word
    ["חלב בקרטון 3% שומן 1 ל", "dairy"],
    ["שוקולד פרה חלב 100ג עלית", "snacks"],
    ["שוקולית בקופסא 500ג עלית", "snacks"],
    ["ביצים ארוזות L 12 יחידות", "dairy"],
    ["לחם ברמן אקטיב 750 גרם", "bakery"],
    ["עוגיות עם מילוי קרם בטעם חלב 450 גרם", "snacks"], // not skin cream
    ["סוכריות גלי דובדבן 113", "snacks"], // contains "כריות" (cereal pillows)
    // canned / preserved: pantry, even though the name has a fish or fruit word
    ["טונה בשמן ויליגר4*140גרם", "pantry"],
    ["שימורי פילה דג הרינג", "pantry"],
    ["רסק עגבניות BX 28% 400 גרם", "pantry"],
    ["פלפל שחור גרוס דק 90 גרם", "pantry"],
    ["חומץ תפוחים אורגני 5% 1 ליטר", "pantry"],
    ["נוטלה על בסיס צמחי 350 ג", "other"], // "טלה" inside a word is not lamb
    // fresh produce
    ["עגבניות שרי 500 גרם", "produce"],
    ["חסה ערבית", "produce"],
    ["פלפל צילי במארז", "produce"],
    ["פטל טרי 125 גרם", "produce"],
    // meat & fish
    ["חזה עוף קפוא", "frozen"],
    ["חזה עוף טרי מחפוד", "meat"],
    ["סלמון פרוס ללא עור", "meat"],
    ["קבב כבש טיבון", "meat"],
    // drinks
    ["קוקה קולה זירו בקבוק500מל", "drinks"],
    ["וויסקי גוני ווקר אדום", "drinks"],
    ["ליקריץ חתוך תות אדום לבן", "snacks"], // contains "ליקר" but is candy
    // household / personal / baby
    ["נייר טואלט סופט 18 גלילים", "cleaning"],
    ["שקיות לאשפה 50 ליטר", "cleaning"],
    ["מברשת כלים עגולה שופרסל", "cleaning"],
    ["קולגייט מברשת שיניים טוטאל", "personal-care"],
    ["שמפו נגד קשקשים 400 מל", "personal-care"],
    ["תחבושת אולווייז נורמל+28", "personal-care"],
    ["האגיס פרידום דריי מידה 4", "baby"],
    // cereal & pantry
    ["קורנפלקס דבש 448ג תלמה", "breakfast"],
    ["אורז פרסי קלאסי 1קג סוגת", "pantry"],
    ["קפה נמס טסטרס צויס200ג", "pantry"],
  ])("%s → %s", (name, expected) => {
    expect(cat(name)).toBe(expected);
  });

  it("unknown stays unknown rather than being guessed", () => {
    expect(cat("מוצר שלא מזהים 3 יחידות")).toBe("other");
  });
});
