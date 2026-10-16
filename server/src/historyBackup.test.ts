import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { emptyHistory, type PreviousHistory } from "./history.ts";
import { mergeHistory, packHistory, statsOf, unpackHistory } from "./historyBackup.ts";

const hist = (since: string, data: Record<string, Record<string, number[]>>): PreviousHistory => {
  const h = emptyHistory(0);
  h.since = since;
  for (const [barcode, perChain] of Object.entries(data)) h.shards[Number(barcode.slice(-3))][barcode] = perChain;
  return h;
};

describe("history backup file", () => {
  const h = hist("2026-10-04", { "7290000066318": { "0": [20730, 5, 0, 20735, 6, 0], "3": [20730, 7, 5] } });

  it("round-trips through pack/unpack", () => {
    const back = unpackHistory(packHistory(h));
    expect(back.since).toBe("2026-10-04");
    expect(back.shards[318]["7290000066318"]).toEqual(h.shards[318]["7290000066318"]);
    expect(statsOf(back)).toEqual({ products: 1, series: 2, points: 3 });
  });

  it("rejects garbage, wrong versions and truncated shard lists instead of restoring nonsense", () => {
    expect(() => unpackHistory(Buffer.from("not gzip"))).toThrow(/not a valid/);
    const wrongVersion = zlib.gzipSync(JSON.stringify({ format: 99, since: "2026-01-01", shards: h.shards }));
    expect(() => unpackHistory(wrongVersion)).toThrow(/unsupported/);
    const short = zlib.gzipSync(JSON.stringify({ format: 1, since: "2026-01-01", shards: h.shards.slice(0, 10) }));
    expect(() => unpackHistory(short)).toThrow(/unsupported/);
  });

  it("is much smaller than the JSON it holds", () => {
    const big = hist("2026-10-04", {});
    for (let i = 0; i < 3000; i++) big.shards[i % 1000][String(7290000000000 + i)] = { "0": [20730, 5 + (i % 7), 0], "1": [20730, 6, 0] };
    expect(packHistory(big).length).toBeLessThan(JSON.stringify(big.shards).length / 4);
  });
});

describe("restoring a backup into the live history", () => {
  it("fills a gap in the live history without touching what the live history already has", () => {
    // Live lost days 100–104 (it only knows from 105); the backup has them.
    const live = hist("2026-10-04", { "7290000066318": { "0": [105, 6, 0, 108, 7, 0] } });
    const backup = hist("2026-09-30", { "7290000066318": { "0": [100, 5, 0, 105, 99, 0] } });
    const { history, added } = mergeHistory(live, backup);
    // Day 105: both know it → LIVE wins (6, not the backup's 99).
    expect(history.shards[318]["7290000066318"]["0"]).toEqual([100, 5, 0, 105, 6, 0, 108, 7, 0]);
    expect(added).toBe(1);
    expect(history.since).toBe("2026-09-30"); // the earlier of the two
  });

  it("adds products and chains the live history doesn't have", () => {
    const live = hist("2026-10-04", { "7290000066318": { "0": [105, 6, 0] } });
    const backup = hist("2026-10-04", { "7290000066318": { "1": [100, 4, 0] }, "7290000066325": { "2": [100, 9, 0] } });
    const { history, added } = mergeHistory(live, backup);
    expect(Object.keys(history.shards[318]["7290000066318"]).sort()).toEqual(["0", "1"]);
    expect(history.shards[325]["7290000066325"]["2"]).toEqual([100, 9, 0]);
    expect(added).toBe(2);
  });

  it("is idempotent: restoring the same backup twice changes nothing the second time", () => {
    const live = hist("2026-10-04", { "7290000066318": { "0": [105, 6, 0] } });
    const backup = hist("2026-09-30", { "7290000066318": { "0": [100, 5, 0, 103, 6, 0] } });
    const once = mergeHistory(live, backup);
    const snapshot = JSON.stringify(once.history.shards);
    const twice = mergeHistory(once.history, backup);
    expect(twice.added).toBe(0);
    expect(JSON.stringify(twice.history.shards)).toBe(snapshot);
  });

  it("does not store an unchanged price as a new point", () => {
    const live = hist("2026-10-04", { "7290000066318": { "0": [105, 6, 0] } });
    const backup = hist("2026-09-30", { "7290000066318": { "0": [100, 6, 0] } }); // same price earlier
    const { history } = mergeHistory(live, backup);
    expect(history.shards[318]["7290000066318"]["0"]).toEqual([100, 6, 0]); // one point, from the earlier day
  });
});
