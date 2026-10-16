import { execFileSync } from "node:child_process";
import fs from "node:fs";
import zlib from "node:zlib";
import type { HistoryShard, PreviousHistory } from "./history.ts";

/**
 * Backups of the price history.
 *
 * The history lives only in the published snapshot (see history.ts), so one bad
 * deploy or a deleted Pages site would lose it for good. A backup is the whole
 * history in one gzip file, stored as an asset of a GitHub release (outside the
 * git history, so the repository doesn't grow). Restoring merges a backup into
 * the next build instead of replacing the live history, so nothing newer is lost.
 */

const STRIDE = 3;
export const BACKUP_FORMAT = 1;
export const RELEASE_TAG = "history-backups";
/** A backup committed to the repo under this name is merged into the next build, then can be deleted. */
export const RESTORE_FILE = "server/history-restore.json.gz";

interface BackupFile {
  format: number;
  createdAt: string;
  since: string;
  shards: HistoryShard[];
}

export interface BackupStats {
  products: number;
  series: number;
  points: number;
}

export function statsOf(h: PreviousHistory): BackupStats {
  const s: BackupStats = { products: 0, series: 0, points: 0 };
  for (const shard of h.shards)
    for (const perChain of Object.values(shard)) {
      s.products++;
      for (const series of Object.values(perChain)) {
        s.series++;
        s.points += series.length / STRIDE;
      }
    }
  return s;
}

export function packHistory(h: PreviousHistory, now = new Date()): Buffer {
  const file: BackupFile = { format: BACKUP_FORMAT, createdAt: now.toISOString(), since: h.since, shards: h.shards };
  return zlib.gzipSync(JSON.stringify(file), { level: 9 });
}

export function unpackHistory(buf: Buffer): PreviousHistory {
  let file: BackupFile;
  try {
    file = JSON.parse(zlib.gunzipSync(buf).toString("utf8")) as BackupFile;
  } catch {
    throw new Error("not a valid history backup (cannot unzip / parse)");
  }
  if (file.format !== BACKUP_FORMAT || !Array.isArray(file.shards) || file.shards.length !== 1000 || typeof file.since !== "string") {
    throw new Error("unsupported or corrupt history backup");
  }
  return { since: file.since, shards: file.shards };
}

/** Merge two price series (flat [day, regular, promo, …]): union by day, `primary` wins on a shared day. */
function mergeSeries(primary: number[], secondary: number[]): number[] {
  const byDay = new Map<number, [number, number]>();
  for (const src of [secondary, primary]) for (let i = 0; i + 2 < src.length; i += STRIDE) byDay.set(src[i], [src[i + 1], src[i + 2]]);
  const out: number[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const [regular, promo] = byDay.get(day)!;
    const n = out.length;
    if (n && out[n - 2] === regular && out[n - 1] === promo) continue; // not a change
    out.push(day, regular, promo);
  }
  return out;
}

/**
 * Add everything in `extra` that `base` doesn't have (typically: base = the live
 * history, extra = a backup). Where both know a day, base wins. Returns how many
 * price points the merge added, so a restore can say what it recovered.
 */
export function mergeHistory(base: PreviousHistory, extra: PreviousHistory): { history: PreviousHistory; added: number } {
  const before = statsOf(base).points;
  const shards = base.shards.map((s) => s);
  extra.shards.forEach((shard, i) => {
    for (const [barcode, perChain] of Object.entries(shard)) {
      const target = (shards[i][barcode] ??= {});
      for (const [chain, series] of Object.entries(perChain)) target[chain] = target[chain] ? mergeSeries(target[chain], series) : series;
    }
  });
  const since = base.since < extra.since ? base.since : extra.since;
  const history = { since, shards };
  return { history, added: statsOf(history).points - before };
}

// ---------------------------------------------------------------------------
// GitHub release storage
// ---------------------------------------------------------------------------

export function repoSlug(env = process.env): string {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url);
  if (!m) throw new Error(`cannot work out the GitHub repository from "${url}"`);
  return m[1];
}

/** A token with repo access: GITHUB_TOKEN, or the one git already uses to push from this machine. */
export function githubToken(env = process.env): string {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  try {
    const out = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
    const token = /^password=(.+)$/m.exec(out)?.[1];
    if (token) return token;
  } catch {
    /* fall through */
  }
  throw new Error("no GitHub token: set GITHUB_TOKEN or sign in with git (the one you push with)");
}

interface Release {
  id: number;
  assets: { id: number; name: string; created_at: string; browser_download_url: string; size: number }[];
}

async function api<T>(token: string, url: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "pricewise-history-backup", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${init.method ?? "GET"} ${url.replace(/^https:\/\/[^/]+/, "")} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (res.status === 404) return null as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function ensureRelease(token: string, repo: string): Promise<Release> {
  const existing = await api<Release | null>(token, `https://api.github.com/repos/${repo}/releases/tags/${RELEASE_TAG}`);
  if (existing) return existing;
  return api<Release>(token, `https://api.github.com/repos/${repo}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: RELEASE_TAG,
      name: "גיבויי היסטוריית מחירים",
      body: "גיבויים של היסטוריית המחירים של PriceWise (קובץ אחד לכל גיבוי). לשחזור: node server/src/cli.ts history-restore",
      prerelease: false,
    }),
  });
}

export interface UploadResult {
  name: string;
  bytes: number;
  pruned: string[];
}

/** Upload a backup and keep only the newest `keep`. The upload is read back and checked before anything is deleted. */
export async function uploadBackup(buf: Buffer, name: string, keep: number, expected: BackupStats, log: (m: string) => void): Promise<UploadResult> {
  const token = githubToken();
  const repo = repoSlug();
  const release = await ensureRelease(token, repo);

  // Same-day re-run: replace that day's file.
  for (const a of release.assets.filter((x) => x.name === name)) await api(token, `https://api.github.com/repos/${repo}/releases/assets/${a.id}`, { method: "DELETE" });

  const up = await api<{ id: number; browser_download_url: string }>(token, `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/gzip", "Content-Length": String(buf.length) },
    body: new Uint8Array(buf),
  });
  log(`  הועלה: ${name} (${(buf.length / 1e6).toFixed(1)}MB)`);

  // Verify by downloading it again and comparing what's inside.
  const back = await fetch(up.browser_download_url, { signal: AbortSignal.timeout(120_000) });
  if (!back.ok) throw new Error(`could not read the uploaded backup back (HTTP ${back.status}) — old backups were NOT deleted`);
  const got = statsOf(unpackHistory(Buffer.from(await back.arrayBuffer())));
  if (got.points !== expected.points || got.products !== expected.products) throw new Error(`uploaded backup does not match (${got.points} vs ${expected.points} points) — old backups were NOT deleted`);
  log("  אומת: ההורדה חזרה זהה למקור");

  const fresh = await api<Release>(token, `https://api.github.com/repos/${repo}/releases/${release.id}`);
  const backups = fresh.assets.filter((a) => /^history-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(a.name)).sort((a, b) => b.name.localeCompare(a.name));
  const pruned: string[] = [];
  for (const old of backups.slice(Math.max(1, keep))) {
    await api(token, `https://api.github.com/repos/${repo}/releases/assets/${old.id}`, { method: "DELETE" });
    pruned.push(old.name);
  }
  return { name, bytes: buf.length, pruned };
}

/** Newest backup of this repository's release (public — no token needed). */
export async function downloadLatestBackup(): Promise<{ name: string; buf: Buffer }> {
  const repo = repoSlug();
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${RELEASE_TAG}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "pricewise-history-backup" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`no backups found (release "${RELEASE_TAG}": HTTP ${res.status})`);
  const release = (await res.json()) as Release;
  const latest = release.assets.filter((a) => /^history-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(a.name)).sort((a, b) => b.name.localeCompare(a.name))[0];
  if (!latest) throw new Error("the backups release has no backup files yet");
  const file = await fetch(latest.browser_download_url, { signal: AbortSignal.timeout(120_000) });
  if (!file.ok) throw new Error(`download failed: HTTP ${file.status}`);
  return { name: latest.name, buf: Buffer.from(await file.arrayBuffer()) };
}

/** If a restore file is committed to the repo, load it (otherwise null). */
export function loadRestoreFile(file = RESTORE_FILE): PreviousHistory | null {
  return fs.existsSync(file) ? unpackHistory(fs.readFileSync(file)) : null;
}
