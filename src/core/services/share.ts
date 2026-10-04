/**
 * Share a shopping list as a link — no account and no server: the list itself
 * (barcodes and quantities) is inside the link, so anyone who opens it can add
 * it to their own basket. It is a copy, not a live shared list.
 */

export interface SharedLine {
  barcode: string;
  quantity: number;
}

const MAX_LINES = 100;

/** [{barcode: "7290…", quantity: 2}] → "7290….2,7290….1" */
export function encodeList(lines: SharedLine[]): string {
  return lines
    .filter((l) => /^\d{8,14}$/.test(l.barcode) && l.quantity >= 1)
    .slice(0, MAX_LINES)
    .map((l) => `${l.barcode}.${Math.min(99, Math.round(l.quantity))}`)
    .join(",");
}

/** Strict parse of untrusted link data: anything that isn't barcode.quantity is dropped. */
export function decodeList(data: string): SharedLine[] {
  const out: SharedLine[] = [];
  const seen = new Set<string>();
  for (const part of data.split(",").slice(0, MAX_LINES)) {
    const m = /^(\d{8,14})\.(\d{1,2})$/.exec(part.trim());
    if (!m || seen.has(m[1])) continue;
    const quantity = Number(m[2]);
    if (quantity < 1) continue;
    seen.add(m[1]);
    out.push({ barcode: m[1], quantity });
  }
  return out;
}

export function shareUrl(lines: SharedLine[], loc: Pick<Location, "origin" | "pathname"> = window.location): string {
  return `${loc.origin}${loc.pathname}#/list/${encodeList(lines)}`;
}
