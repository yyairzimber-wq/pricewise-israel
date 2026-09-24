import type { DB } from "./db.ts";

/**
 * Stores files give the city as a CBS settlement code (e.g. 3000 = ירושלים).
 * The official list is published on data.gov.il.
 */
const RESOURCE = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba";

export async function ensureSettlements(db: DB, log: (m: string) => void) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM settlements").get() as { n: number };
  if (n > 0) return;
  try {
    const res = await fetch(`https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE}&limit=5000`, { signal: AbortSignal.timeout(60_000) });
    const json = (await res.json()) as { result: { records: Record<string, string>[] } };
    const put = db.prepare("INSERT OR REPLACE INTO settlements (code, name) VALUES (?, ?)");
    db.exec("BEGIN");
    for (const r of json.result.records) {
      const code = String(r["סמל_ישוב"] ?? "").trim();
      const name = String(r["שם_ישוב"] ?? "").trim();
      if (code && name) put.run(String(parseInt(code, 10)), name);
    }
    db.exec("COMMIT");
    log(`settlements: ${json.result.records.length} (data.gov.il)`);
  } catch (e) {
    log(`settlements: could not load (${(e as Error).message}) — cities will show as codes`);
  }
}

export function settlementName(db: DB, code: string): string | null {
  const row = db.prepare("SELECT name FROM settlements WHERE code = ?").get(String(parseInt(code, 10))) as { name: string } | undefined;
  return row?.name ?? null;
}
