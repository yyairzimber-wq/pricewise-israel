/**
 * Price history for the static snapshot.
 *
 * The snapshot is rebuilt from scratch twice a day on a fresh machine, so history
 * can't live in a database. Instead every build downloads the previous history
 * from the published site, appends today's prices, and publishes the result:
 *
 *   data/h/<000-999>.json   { barcode: { chainIndex: [day, regular, promo, day, regular, promo, …] } }
 *
 * Only CHANGES are stored (a new triple when the chain's regular or promo price
 * differs from the last one), so the files stay small. `day` is days since
 * 1970-01-01 (UTC); `promo` is the per-unit promo price or 0.
 *
 * History only goes forward from the first build that wrote it — there is no
 * source of real past prices, and nothing is ever back-filled or invented.
 */

export type HistoryShard = Record<string, Record<string, number[]>>;

export interface PreviousHistory {
  /** ISO date (YYYY-MM-DD) of the first build that recorded history. */
  since: string;
  shards: HistoryShard[];
}

const STRIDE = 3;

export const dayNumber = (ms: number) => Math.floor(ms / 86_400_000);
export const dayToIso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

export function emptyHistory(day: number): PreviousHistory {
  return { since: dayToIso(day), shards: Array.from({ length: 1000 }, () => ({})) };
}

/** Where the previous snapshot lives: explicit env var, or this repo's GitHub Pages when running in Actions. */
export function previousSnapshotBase(env = process.env): string | null {
  if (env.PRICEWISE_HISTORY_BASE) return env.PRICEWISE_HISTORY_BASE.replace(/\/+$/, "");
  const repo = env.GITHUB_REPOSITORY; // "owner/name"
  if (env.GITHUB_ACTIONS && repo) {
    const [owner, name] = repo.split("/");
    return `https://${owner}.github.io/${name}/data`;
  }
  return null;
}

async function getJson<T>(url: string): Promise<T | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "Cache-Control": "no-cache" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`could not download ${url}: ${(lastError as Error)?.message}`);
}

/**
 * Download the history published by the previous build. A missing first file
 * means "no history yet" (first run). Any other failure THROWS: publishing
 * a snapshot without the old history would erase it.
 */
export async function loadPreviousHistory(base: string, day: number, log: (m: string) => void): Promise<PreviousHistory> {
  const meta = await getJson<{ history?: { since: string } }>(`${base}/meta.json`);
  if (!meta?.history) {
    log("  היסטוריית מחירים: אין עדיין — מתחילים לאסוף מהיום");
    return emptyHistory(day);
  }
  const shards: HistoryShard[] = new Array(1000);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < 1000; i = next++) {
      const key = String(i).padStart(3, "0");
      const shard = await getJson<HistoryShard>(`${base}/h/${key}.json`);
      if (shard == null) throw new Error(`previous history shard ${key} is missing although meta.json says history exists`);
      shards[i] = shard;
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  log(`  היסטוריית מחירים: נטענה (מאז ${meta.history.since})`);
  return { since: meta.history.since, shards };
}

/**
 * Record today's price for one chain. Appends a triple only when something
 * changed; a second build on the same day overwrites that day's entry.
 */
export function recordPrice(shard: HistoryShard, barcode: string, chainIdx: number, day: number, regular: number, promo: number): void {
  const perChain = (shard[barcode] ??= {});
  const series = (perChain[chainIdx] ??= []);
  const n = series.length;
  if (n >= STRIDE) {
    const [lastDay, lastRegular, lastPromo] = series.slice(n - STRIDE);
    if (lastRegular === regular && lastPromo === promo) return;
    if (lastDay === day) {
      series.splice(n - STRIDE, STRIDE, day, regular, promo);
      // Collapse if overwriting made it equal to the entry before.
      if (series.length >= 2 * STRIDE) {
        const m = series.length;
        if (series[m - 2] === series[m - 5] && series[m - 1] === series[m - 4]) series.splice(m - STRIDE, STRIDE);
      }
      return;
    }
  }
  series.push(day, regular, promo);
}
