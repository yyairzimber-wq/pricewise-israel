import type { CategoryId, DataSource, Product, SizeUnit } from "../../types";

export const DEMO_SOURCE: DataSource = { kind: "demo", label: "נתוני הדגמה" };

/**
 * Demo barcodes use the GS1 "restricted circulation" prefix 200–299, which is
 * reserved for in-store use and is never assigned to real retail products —
 * so a demo item can never be confused with a real one you scan in a shop.
 */
export function demoBarcode(n: number): string {
  const body = `200${String(n).padStart(9, "0")}`;
  return body + ean13CheckDigit(body);
}

export function ean13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

interface DemoSeed {
  slug: string;
  name: string;
  brand?: string;
  amount: number;
  unit: SizeUnit;
  category: CategoryId;
  emoji: string;
  /** Rough base price used to generate demo quotes. */
  base: number;
  keywords?: string[];
}

const SEEDS: DemoSeed[] = [
  { slug: "talma-cornflakes-750", name: "קורנפלקס תלמה", brand: "תלמה", amount: 750, unit: "g", category: "breakfast", emoji: "🥣", base: 18.5, keywords: ["דגני בוקר", "cornflakes"] },
  { slug: "tnuva-milk-3-1l", name: "חלב טרי 3% בקרטון", brand: "תנובה", amount: 1, unit: "l", category: "dairy", emoji: "🥛", base: 7.1, keywords: ["חלב", "milk"] },
  { slug: "coca-cola-1-5l", name: "קוקה-קולה", brand: "קוקה-קולה", amount: 1.5, unit: "l", category: "drinks", emoji: "🥤", base: 7.9, keywords: ["קולה", "coke", "cola"] },
  { slug: "angel-bread-750", name: "לחם אחיד פרוס", brand: "אנג'ל", amount: 750, unit: "g", category: "bakery", emoji: "🍞", base: 8.6, keywords: ["לחם", "bread"] },
  { slug: "tnuva-white-cheese-5-250", name: "גבינה לבנה 5%", brand: "תנובה", amount: 250, unit: "g", category: "dairy", emoji: "🧀", base: 5.9, keywords: ["גבינה", "cheese"] },
  { slug: "tnuva-cottage-5-250", name: "קוטג' 5%", brand: "תנובה", amount: 250, unit: "g", category: "dairy", emoji: "🥣", base: 6.4, keywords: ["קוטג", "גבינה", "cottage"] },
  { slug: "elite-milk-chocolate-100", name: "שוקולד חלב", brand: "עלית", amount: 100, unit: "g", category: "snacks", emoji: "🍫", base: 6.5, keywords: ["שוקולד", "chocolate"] },
  { slug: "osem-bamba-80", name: "במבה", brand: "אסם", amount: 80, unit: "g", category: "snacks", emoji: "🥜", base: 4.8, keywords: ["חטיף", "bamba"] },
  { slug: "osem-bissli-grill-70", name: "ביסלי גריל", brand: "אסם", amount: 70, unit: "g", category: "snacks", emoji: "🥨", base: 4.8, keywords: ["חטיף", "bissli"] },
  { slug: "elite-instant-coffee-200", name: "קפה נמס", brand: "עלית", amount: 200, unit: "g", category: "pantry", emoji: "☕", base: 27.5, keywords: ["קפה", "coffee"] },
  { slug: "osem-spaghetti-500", name: "ספגטי", brand: "אסם", amount: 500, unit: "g", category: "pantry", emoji: "🍝", base: 5.9, keywords: ["פסטה", "pasta"] },
  { slug: "sugat-persian-rice-1kg", name: "אורז פרסי", brand: "סוגת", amount: 1, unit: "kg", category: "pantry", emoji: "🍚", base: 11.9, keywords: ["אורז", "rice"] },
  { slug: "osem-ptitim-500", name: "פתיתים אפויים", brand: "אסם", amount: 500, unit: "g", category: "pantry", emoji: "🍲", base: 5.6, keywords: ["פתיתים"] },
  { slug: "osem-ketchup-750", name: "קטשופ", brand: "אסם", amount: 750, unit: "g", category: "pantry", emoji: "🍅", base: 11.9, keywords: ["קטשופ", "ketchup"] },
  { slug: "tnuva-butter-200", name: "חמאה", brand: "תנובה", amount: 200, unit: "g", category: "dairy", emoji: "🧈", base: 8.9, keywords: ["חמאה", "butter"] },
  { slug: "eggs-l-12", name: "ביצים L", amount: 12, unit: "unit", category: "dairy", emoji: "🥚", base: 13.9, keywords: ["ביצים", "eggs"] },
  { slug: "yotvata-choco-1l", name: "שוקו", brand: "יטבתה", amount: 1, unit: "l", category: "dairy", emoji: "🍫", base: 9.2, keywords: ["שוקו", "חלב"] },
  { slug: "strauss-milky-4", name: "מילקי מארז", brand: "שטראוס", amount: 4, unit: "unit", category: "dairy", emoji: "🍮", base: 12.9, keywords: ["מעדן", "milky"] },
  { slug: "neviot-water-6x1-5", name: "מים מינרליים שישייה", brand: "נביעות", amount: 9, unit: "l", category: "drinks", emoji: "💧", base: 14.9, keywords: ["מים", "water"] },
  { slug: "prigat-orange-1l", name: "מיץ תפוזים", brand: "פריגת", amount: 1, unit: "l", category: "drinks", emoji: "🍊", base: 10.4, keywords: ["מיץ", "juice"] },
  { slug: "starkist-tuna-4x160", name: "טונה בשמן רביעייה", brand: "סטארקיסט", amount: 640, unit: "g", category: "pantry", emoji: "🐟", base: 25.9, keywords: ["טונה", "tuna"] },
  { slug: "tivall-corn-schnitzel-400", name: "שניצל תירס", brand: "טבעול", amount: 400, unit: "g", category: "frozen", emoji: "🥟", base: 22.9, keywords: ["שניצל", "קפוא"] },
  { slug: "tomatoes-1kg", name: "עגבניות", amount: 1, unit: "kg", category: "produce", emoji: "🍅", base: 6.9, keywords: ["ירקות", "עגבניה"] },
  { slug: "bananas-1kg", name: "בננות", amount: 1, unit: "kg", category: "produce", emoji: "🍌", base: 7.9, keywords: ["פירות", "בננה"] },
  { slug: "chicken-breast-1kg", name: "חזה עוף טרי", brand: "עוף טוב", amount: 1, unit: "kg", category: "meat", emoji: "🍗", base: 39.9, keywords: ["עוף", "chicken"] },
  { slug: "persil-gel-2l", name: "ג'ל כביסה", brand: "פרסיל", amount: 2, unit: "l", category: "cleaning", emoji: "🧺", base: 36.9, keywords: ["כביסה", "persil"] },
  { slug: "toilet-paper-32", name: "נייר טואלט", brand: "לילי", amount: 32, unit: "unit", category: "cleaning", emoji: "🧻", base: 42.9, keywords: ["נייר", "טואלט"] },
  { slug: "pampers-size4", name: "חיתולים מידה 4", brand: "פמפרס", amount: 44, unit: "unit", category: "baby", emoji: "👶", base: 62.9, keywords: ["חיתולים", "pampers"] },
  { slug: "colgate-toothpaste-100", name: "משחת שיניים", brand: "קולגייט", amount: 100, unit: "ml", category: "personal-care", emoji: "🪥", base: 12.9, keywords: ["שיניים", "colgate"] },
  { slug: "hs-shampoo-400", name: "שמפו נגד קשקשים", brand: "הד אנד שולדרס", amount: 400, unit: "ml", category: "personal-care", emoji: "🧴", base: 25.9, keywords: ["שמפו", "shampoo"] },
  { slug: "sano-dish-soap-1l", name: "נוזל כלים", brand: "סנו", amount: 1, unit: "l", category: "cleaning", emoji: "🫧", base: 11.9, keywords: ["כלים", "ניקוי"] },
  { slug: "berman-pita-10", name: "פיתות", brand: "ברמן", amount: 10, unit: "unit", category: "bakery", emoji: "🫓", base: 8.9, keywords: ["פיתה", "לחם"] },
];

export interface DemoProduct extends Product {
  demoBase: number;
  keywords: string[];
}

export const DEMO_PRODUCTS: DemoProduct[] = SEEDS.map((s, i) => ({
  id: `demo:${s.slug}`,
  barcode: demoBarcode(i + 1),
  name: s.name,
  brand: s.brand,
  size: { amount: s.amount, unit: s.unit },
  category: s.category,
  emoji: s.emoji,
  source: DEMO_SOURCE,
  demoBase: s.base,
  keywords: s.keywords ?? [],
}));
