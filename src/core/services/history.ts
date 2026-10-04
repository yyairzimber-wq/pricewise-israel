import type { ChainId, PriceHistory } from "../types";

const DAY = 86_400_000;

export interface HistoryPoint {
  /** ms since epoch (start of the UTC day). */
  t: number;
  price: number;
}

const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * Shelf price over time. With `chainId` — that chain's price; without — the
 * cheapest regular price across the chains that had a price on each day.
 * Points are change points (step function) plus a closing point at `until`.
 */
export function priceOverTime(history: PriceHistory, chainId?: ChainId, allowed?: ChainId[]): HistoryPoint[] {
  const series = history.series.filter((s) => (chainId ? s.chainId === chainId : !allowed || allowed.includes(s.chainId)));
  if (!series.length) return [];
  const until = dayMs(history.until);
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => dayMs(p.date))))].sort((a, b) => a - b);
  const out: HistoryPoint[] = [];
  for (const t of times) {
    let best = Infinity;
    for (const s of series) {
      let v: number | undefined;
      for (const p of s.points) {
        if (dayMs(p.date) <= t) v = p.regular;
        else break;
      }
      if (v != null && v < best) best = v;
    }
    if (best < Infinity && out.at(-1)?.price !== best) out.push({ t, price: best });
  }
  const last = out.at(-1);
  if (last && last.t < until) out.push({ t: until, price: last.price });
  return out;
}

export type Verdict = "collecting" | "stable" | "lowest" | "highest" | "between";

export interface HistoryStats {
  /** Days covered by the recorded data (inclusive). */
  days: number;
  current: number;
  min: number;
  max: number;
  minAt: number;
  maxAt: number;
  verdict: Verdict;
  /** How far above the period's lowest price the current one is, in %. */
  aboveMinPct: number;
}

/** Needed before we say anything about "lowest/highest" — a few days of data prove nothing. */
export const MIN_DAYS_FOR_VERDICT = 7;

export function analyze(points: HistoryPoint[], sinceMs?: number): HistoryStats | null {
  const pts = sinceMs == null ? points : points.filter((p, i) => p.t >= sinceMs || points[i + 1]?.t > sinceMs);
  if (pts.length < 1) return null;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const current = pts.at(-1)!.price;
  const days = Math.round((pts.at(-1)!.t - pts[0].t) / DAY) + 1;
  let verdict: Verdict;
  if (days < MIN_DAYS_FOR_VERDICT) verdict = "collecting";
  else if (max <= min * 1.02) verdict = "stable";
  else if (current <= min * 1.005) verdict = "lowest";
  else if (current >= max * 0.995) verdict = "highest";
  else verdict = "between";
  return {
    days,
    current,
    min,
    max,
    minAt: pts.find((p) => p.price === min)!.t,
    maxAt: pts.find((p) => p.price === max)!.t,
    verdict,
    aboveMinPct: min > 0 ? ((current - min) / min) * 100 : 0,
  };
}
