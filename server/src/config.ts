/**
 * Chains we ingest, keyed by the app's chain ids (src/core/data/chains.ts).
 * Chain codes and portal logins come from each chain's published
 * price-transparency endpoint (cross-checked against the open-source
 * il-supermarket-scraper project). Cerberus logins are public usernames with
 * an empty password, published by the chains for exactly this purpose.
 */

export type PortalConfig =
  | { type: "cerberus"; username: string }
  | { type: "shufersal" }
  | { type: "publishprice"; baseUrl: string }
  | { type: "laib" }
  | { type: "bina"; host: string }
  | { type: "hazihinam" }
  | { type: "superpharm" };

export interface ChainSource {
  chainId: string;
  /** GS1 chain codes that appear in the files (some chains publish under two). */
  codes: string[];
  portal: PortalConfig;
  portalUrl: string;
}

export const SOURCES: ChainSource[] = [
  { chainId: "shufersal", codes: ["7290027600007"], portal: { type: "shufersal" }, portalUrl: "https://prices.shufersal.co.il/" },
  { chainId: "rami-levy", codes: ["7290058140886"], portal: { type: "cerberus", username: "RamiLevi" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "yochananof", codes: ["7290803800003"], portal: { type: "cerberus", username: "yohananof" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "osher-ad", codes: ["7290103152017"], portal: { type: "cerberus", username: "osherad" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "tiv-taam", codes: ["7290873255550"], portal: { type: "cerberus", username: "TivTaam" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "freshmarket", codes: ["7290876100000"], portal: { type: "cerberus", username: "freshmarket" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "carrefour", codes: ["7290055700007"], portal: { type: "publishprice", baseUrl: "https://prices.carrefour.co.il/" }, portalUrl: "https://prices.carrefour.co.il/" },
  { chainId: "victory", codes: ["7290696200003"], portal: { type: "laib" }, portalUrl: "https://laibcatalog.co.il/" },
  { chainId: "mahsanei-hashuk", codes: ["7290661400001", "7290633800006"], portal: { type: "laib" }, portalUrl: "https://laibcatalog.co.il/" },
  { chainId: "hazi-hinam", codes: ["7290700100008"], portal: { type: "hazihinam" }, portalUrl: "https://shop.hazi-hinam.co.il/Prices" },
  { chainId: "super-pharm", codes: ["7290172900007"], portal: { type: "superpharm" }, portalUrl: "https://prices.super-pharm.co.il/" },
  { chainId: "keshet-teamim", codes: ["7290785400000"], portal: { type: "cerberus", username: "Keshet" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "dor-alon", codes: ["7290492000005"], portal: { type: "cerberus", username: "doralon" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "stop-market", codes: ["7290639000004"], portal: { type: "cerberus", username: "Stop_Market" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "politzer", codes: ["7291059100008"], portal: { type: "cerberus", username: "politzer" }, portalUrl: "https://url.retail.publishedprices.co.il/" },
  { chainId: "king-store", codes: ["7290058108879"], portal: { type: "bina", host: "kingstore" }, portalUrl: "https://kingstore.binaprojects.com/" },
  { chainId: "zol-vebegadol", codes: ["7290058173198"], portal: { type: "bina", host: "zolvebegadol" }, portalUrl: "https://zolvebegadol.binaprojects.com/" },
  { chainId: "good-pharm", codes: ["7290058197699"], portal: { type: "bina", host: "goodpharm" }, portalUrl: "https://goodpharm.binaprojects.com/" },
  { chainId: "super-sapir", codes: ["7290058156016"], portal: { type: "bina", host: "supersapir" }, portalUrl: "https://supersapir.binaprojects.com/" },
  { chainId: "shuk-hayir", codes: ["7290058148776"], portal: { type: "bina", host: "shuk-hayir" }, portalUrl: "https://shuk-hayir.binaprojects.com/" },
  { chainId: "shefa-birkat-hashem", codes: ["7290058134977"], portal: { type: "bina", host: "shefabirkathashem" }, portalUrl: "https://shefabirkathashem.binaprojects.com/" },
  { chainId: "bareket", codes: ["7290875100001"], portal: { type: "bina", host: "superbareket" }, portalUrl: "https://superbareket.binaprojects.com/" },
];

export const CHAIN_NAMES: Record<string, string> = {
  shufersal: "שופרסל",
  "rami-levy": "רמי לוי",
  yochananof: "יוחננוף",
  "osher-ad": "אושר עד",
  "tiv-taam": "טיב טעם",
  freshmarket: "פרשמרקט",
  carrefour: "קרפור",
  victory: "ויקטורי",
  "mahsanei-hashuk": "מחסני השוק",
  "hazi-hinam": "חצי חינם",
  "super-pharm": "סופר-פארם",
  "keshet-teamim": "קשת טעמים",
  "dor-alon": "דור אלון",
  "stop-market": "סטופ מרקט",
  politzer: "פוליצר",
  "king-store": "קינג סטור",
  "zol-vebegadol": "זול ובגדול",
  "good-pharm": "גוד פארם",
  "super-sapir": "סופר ספיר",
  "shuk-hayir": "שוק העיר",
  "shefa-birkat-hashem": "שפע ברכת השם",
  bareket: "ברקת",
};

export const SERVER_CONFIG = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.PRICEWISE_DB ?? new URL("../data/pricewise.db", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  cacheDir: process.env.PRICEWISE_CACHE ?? new URL("../.cache/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  /** Identify ourselves to public services (Nominatim requires it). */
  userAgent: "PriceWise-Israel/0.1 (price-transparency ingest; development)",
};
