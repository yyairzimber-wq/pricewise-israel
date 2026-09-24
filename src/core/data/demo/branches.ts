import { CHAINS } from "../chains";
import type { Branch, DataSource, OpeningHours } from "../../types";
import { hash } from "./prices";

/**
 * DEMO branches. Locations are scattered around real city centres so that
 * distance sorting can be demonstrated, but they are NOT real store
 * addresses — the UI marks them as demo and warns before navigating.
 */
export const DEMO_BRANCH_SOURCE: DataSource = { kind: "demo", label: "סניפי הדגמה — מיקום לא אמיתי" };

const CITIES = [
  { city: "תל אביב-יפו", lat: 32.0853, lng: 34.7818 },
  { city: "ירושלים", lat: 31.7683, lng: 35.2137 },
  { city: "חיפה", lat: 32.794, lng: 34.9896 },
  { city: "ראשון לציון", lat: 31.973, lng: 34.7925 },
  { city: "פתח תקווה", lat: 32.0871, lng: 34.8875 },
  { city: "נתניה", lat: 32.3215, lng: 34.8532 },
  { city: "באר שבע", lat: 31.2518, lng: 34.7913 },
  { city: "מודיעין", lat: 31.8969, lng: 35.0104 },
  { city: "אשדוד", lat: 31.8014, lng: 34.6435 },
  { city: "חולון", lat: 32.0158, lng: 34.7874 },
  { city: "רמת גן", lat: 32.0823, lng: 34.8107 },
  { city: "כפר סבא", lat: 32.175, lng: 34.9069 },
];

const WEEKDAY = { open: "07:00", close: "23:00" };
const LATE = { open: "07:00", close: "24:00" };

function hoursFor(h: number): OpeningHours {
  const weekday = h % 3 === 0 ? LATE : WEEKDAY;
  const friday = { open: "07:00", close: h % 2 ? "15:00" : "16:00" };
  const saturday = h % 7 === 0 ? { open: "19:30", close: "23:00" } : null;
  return { 0: weekday, 1: weekday, 2: weekday, 3: weekday, 4: weekday, 5: friday, 6: saturday };
}

function build(): Branch[] {
  const branches: Branch[] = [];
  for (const chain of CHAINS) {
    CITIES.forEach((c, i) => {
      const h = hash(`${chain.id}|${c.city}`);
      // Big chains appear in most cities, local chains in a few.
      const keep = chain.kind === "local" ? h % 4 === 0 : h % 3 !== 0;
      if (!keep) return;
      const dLat = (((h >>> 3) % 400) - 200) / 10_000; // ~±2.2km
      const dLng = (((h >>> 11) % 400) - 200) / 10_000;
      branches.push({
        id: `demo-branch:${chain.id}:${i}`,
        chainId: chain.id,
        name: `${chain.name} ${c.city}`,
        address: `כתובת לדוגמה · ${c.city}`,
        city: c.city,
        lat: Number((c.lat + dLat).toFixed(5)),
        lng: Number((c.lng + dLng).toFixed(5)),
        hours: hoursFor(h),
        source: DEMO_BRANCH_SOURCE,
      });
    });
  }
  return branches;
}

export const DEMO_BRANCHES: Branch[] = build();

/** Fallback location when the user declines location access. */
export const DEFAULT_LOCATION = { lat: 32.0853, lng: 34.7818, label: "מרכז תל אביב" };
