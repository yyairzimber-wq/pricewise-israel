import type { Chain, ChainId } from "../types";

/**
 * Israeli retail chains the app knows about. This is reference data (names,
 * clubs), not prices — it is shared by demo and real providers alike.
 * `transparencyChainCode` values should be verified against the chains'
 * published price-transparency files before wiring a real feed.
 */
export const CHAINS: Chain[] = [
  { id: "shufersal", name: "שופרסל", nameEn: "Shufersal", color: "#e2231a", initials: "ש", clubName: "מועדון שופרסל", kind: "supermarket" },
  { id: "rami-levy", name: "רמי לוי", nameEn: "Rami Levy", color: "#0057b8", initials: "רל", clubName: "מועדון רמי לוי", kind: "supermarket" },
  { id: "yochananof", name: "יוחננוף", nameEn: "Yochananof", color: "#d6002a", initials: "יו", clubName: "מועדון יוחננוף", kind: "supermarket" },
  { id: "victory", name: "ויקטורי", nameEn: "Victory", color: "#f39200", initials: "וי", clubName: "מועדון ויקטורי", kind: "supermarket" },
  { id: "carrefour", name: "קרפור", nameEn: "Carrefour", color: "#1a4ea2", initials: "ק", clubName: "מועדון קרפור", kind: "supermarket" },
  { id: "tiv-taam", name: "טיב טעם", nameEn: "Tiv Taam", color: "#8b1d41", initials: "טט", clubName: "מועדון טיב טעם", kind: "supermarket" },
  { id: "mahsanei-hashuk", name: "מחסני השוק", nameEn: "Mahsanei Hashuk", color: "#00843d", initials: "מה", kind: "supermarket" },
  { id: "osher-ad", name: "אושר עד", nameEn: "Osher Ad", color: "#ffcc00", initials: "או", kind: "supermarket" },
  { id: "super-pharm", name: "סופר-פארם", nameEn: "Super-Pharm", color: "#003da5", initials: "סופ", clubName: "LifeStyle", kind: "pharm" },
  { id: "hazi-hinam", name: "חצי חינם", nameEn: "Hazi Hinam", color: "#e4032e", initials: "חח", clubName: "מועדון חצי חינם", kind: "supermarket" },
  { id: "freshmarket", name: "פרשמרקט", nameEn: "Freshmarket", color: "#6ab023", initials: "פמ", clubName: "מועדון פרשמרקט", kind: "supermarket" },
  { id: "keshet-teamim", name: "קשת טעמים", nameEn: "Keshet Teamim", color: "#c8102e", initials: "קט", kind: "supermarket" },
  { id: "king-store", name: "קינג סטור", nameEn: "King Store", color: "#1d3f8f", initials: "קס", kind: "supermarket" },
  { id: "zol-vebegadol", name: "זול ובגדול", nameEn: "Zol Vebegadol", color: "#e85d04", initials: "זב", kind: "supermarket" },
  { id: "stop-market", name: "סטופ מרקט", nameEn: "Stop Market", color: "#d62828", initials: "סמ", kind: "supermarket" },
  { id: "super-sapir", name: "סופר ספיר", nameEn: "Super Sapir", color: "#2a9d8f", initials: "סס", kind: "supermarket" },
  { id: "shuk-hayir", name: "שוק העיר", nameEn: "Shuk Hayir", color: "#588157", initials: "שה", kind: "supermarket" },
  { id: "shefa-birkat-hashem", name: "שפע ברכת השם", nameEn: "Shefa Birkat Hashem", color: "#7f5539", initials: "שב", kind: "supermarket" },
  { id: "bareket", name: "ברקת", nameEn: "Bareket", color: "#0077b6", initials: "בר", kind: "supermarket" },
  { id: "politzer", name: "פוליצר", nameEn: "Politzer", color: "#6d597a", initials: "פו", kind: "local" },
  { id: "good-pharm", name: "גוד פארם", nameEn: "Good Pharm", color: "#00a19a", initials: "גפ", kind: "pharm" },
  { id: "dor-alon", name: "דור אלון (אלונית)", nameEn: "Dor Alon", color: "#f2a900", initials: "דא", kind: "local" },
  { id: "super-yuda", name: "סופר יודה", nameEn: "Super Yuda", color: "#7a4cc2", initials: "סי", kind: "local" },
];

const byId = new Map(CHAINS.map((c) => [c.id, c]));

export function getChain(id: ChainId): Chain {
  return (
    byId.get(id) ?? {
      id,
      name: id,
      nameEn: id,
      color: "#8a8f98",
      initials: id.slice(0, 2),
      kind: "local",
    }
  );
}
