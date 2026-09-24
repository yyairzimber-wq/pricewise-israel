import type { GeoPoint, OpeningHours } from "../types";

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} מ׳`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ק״מ`;
}

export function navigationLinks(p: GeoPoint, label?: string) {
  const q = encodeURIComponent(label ?? "");
  return {
    waze: `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
    apple: `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${q}`,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type OpenState = { open: boolean; label: string };

/** Uses Israel local time regardless of the device time zone. */
export function openState(hours: OpeningHours, now = new Date()): OpenState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const minutes = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const today = hours[wd];
  if (today && minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
    return { open: true, label: `פתוח עד ${today.close}` };
  }
  if (today && minutes < toMinutes(today.open)) return { open: false, label: `ייפתח היום ב-${today.open}` };
  for (let i = 1; i <= 7; i++) {
    const d = (wd + i) % 7;
    const h = hours[d];
    if (h) return { open: false, label: `ייפתח ${i === 1 ? "מחר" : `ביום ${WEEKDAYS[d]}`} ב-${h.open}` };
  }
  return { open: false, label: "סגור" };
}

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
