import type { CategoryId, ProductSize } from "../types";

const ils = new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatILS(value: number): string {
  return `${ils.format(value)} ₪`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

const UNIT_LABEL: Record<ProductSize["unit"], string> = {
  g: "גרם",
  kg: "ק״ג",
  ml: "מ״ל",
  l: "ליטר",
  unit: "יח׳",
};

export function formatSize(size?: ProductSize): string {
  if (!size) return "";
  const n = Number.isInteger(size.amount) ? size.amount : size.amount.toLocaleString("he-IL");
  return `${n} ${UNIT_LABEL[size.unit]}`;
}

/** Price per 100g / 100ml / 1 unit — useful for comparing different pack sizes. */
export function unitPrice(price: number, size?: ProductSize): string | null {
  if (!size || size.amount <= 0) return null;
  switch (size.unit) {
    case "g":
      return `${formatILS((price / size.amount) * 100)} ל-100 גרם`;
    case "kg":
      return `${formatILS((price / (size.amount * 1000)) * 100)} ל-100 גרם`;
    case "ml":
      return `${formatILS((price / size.amount) * 100)} ל-100 מ״ל`;
    case "l":
      return `${formatILS(price / size.amount)} לליטר`;
    case "unit":
      return size.amount > 1 ? `${formatILS(price / size.amount)} ליחידה` : null;
  }
}

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return "הרגע";
  // Intl's Hebrew output adds the digit to dual forms ("לפני שעתיים (2)"); use natural wording.
  const past = diffMin < 0;
  if (abs < 60) return rtf.format(diffMin, "minute");
  if (abs < 60 * 24) {
    const h = Math.round(abs / 60);
    if (past && h === 1) return "לפני שעה";
    if (past && h === 2) return "לפני שעתיים";
    return rtf.format(Math.round(diffMin / 60), "hour");
  }
  const d = Math.round(abs / 1440);
  if (past && d === 1) return "אתמול";
  if (past && d === 2) return "לפני יומיים";
  return rtf.format(Math.round(diffMin / 1440), "day");
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date(iso));
}

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  dairy: "חלב וביצים",
  bakery: "לחם ומאפים",
  breakfast: "דגני בוקר",
  drinks: "משקאות",
  snacks: "חטיפים ומתוקים",
  pantry: "מזווה",
  produce: "פירות וירקות",
  meat: "בשר ועוף",
  frozen: "קפואים",
  cleaning: "ניקיון ובית",
  "personal-care": "טיפוח",
  baby: "תינוקות",
  other: "כללי",
};

export const CATEGORY_TINT: Record<CategoryId, string> = {
  dairy: "#dbeafe",
  bakery: "#fde68a",
  breakfast: "#fed7aa",
  drinks: "#fecaca",
  snacks: "#e9d5ff",
  pantry: "#fde2c7",
  produce: "#bbf7d0",
  meat: "#fecdd3",
  frozen: "#cffafe",
  cleaning: "#c7d2fe",
  "personal-care": "#fbcfe8",
  baby: "#e0f2fe",
  other: "#e5e7eb",
};
