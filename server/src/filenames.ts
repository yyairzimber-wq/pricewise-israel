import { israelPartsToIso } from "./israelTime.ts";

export type FileKind = "stores" | "pricefull" | "price" | "promofull" | "promo";

export interface ParsedFileName {
  kind: FileKind;
  chainCode: string;
  /** Normalised (no leading zeros). null for chain-wide files such as Stores. */
  storeId: string | null;
  /** Publication time encoded in the name, as UTC ISO. */
  publishedAt: string | null;
}

/**
 * Handles every naming dialect seen on the portals, e.g.
 *   pricefull7290058140886-039-202609230521.gz          (Cerberus)
 *   PriceFull7290027600007-001-001-20260923-030000.gz   (Shufersal, Carrefour, Laib)
 *   Stores7290696200003-000-20260923060100-060100.gz    (Laib)
 */
export function parseFileName(name: string): ParsedFileName | null {
  // Hazi Hinam names its branch list "StoresFull…".
  const m = name.match(/^(pricefull|promofull|price|promo|storesfull|stores)(\d{13})-(.+)$/i);
  if (!m) return null;
  const kind = (m[1].toLowerCase() === "storesfull" ? "stores" : m[1].toLowerCase()) as FileKind;
  const tokens = m[3].replace(/\.(xml|gz|zip)+$/gi, "").replace(/\.(xml|gz|zip)$/i, "").split("-");
  const dateIdx = tokens.findIndex((t) => /^20\d{6}/.test(t));
  let publishedAt: string | null = null;
  let storeId: string | null = null;
  if (dateIdx >= 0) {
    const tok = tokens[dateIdx];
    const time = (tok.slice(8) || (/^\d{4,6}$/.test(tokens[dateIdx + 1] ?? "") ? tokens[dateIdx + 1] : "")).padEnd(6, "0");
    publishedAt = israelPartsToIso(+tok.slice(0, 4), +tok.slice(4, 6), +tok.slice(6, 8), +time.slice(0, 2), +time.slice(2, 4), +time.slice(4, 6));
    if (kind !== "stores" && dateIdx >= 1) storeId = normalizeStoreId(tokens[dateIdx - 1]);
  }
  return { kind, chainCode: m[2], storeId, publishedAt };
}

export function normalizeStoreId(raw: string | number | undefined | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return s || null;
  return String(parseInt(s, 10));
}
