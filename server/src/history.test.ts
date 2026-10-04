import { describe, expect, it } from "vitest";
import { dayNumber, dayToIso, loadPreviousHistory, previousSnapshotBase, recordPrice, type HistoryShard } from "./history.ts";

describe("price history", () => {
  it("stores only changes", () => {
    const s: HistoryShard = {};
    recordPrice(s, "1", 0, 100, 5.9, 0);
    recordPrice(s, "1", 0, 101, 5.9, 0); // unchanged
    recordPrice(s, "1", 0, 102, 6.5, 0); // changed
    recordPrice(s, "1", 0, 103, 6.5, 4.9); // promo started
    expect(s["1"][0]).toEqual([100, 5.9, 0, 102, 6.5, 0, 103, 6.5, 4.9]);
  });

  it("a second run on the same day overwrites that day, and collapses back to unchanged", () => {
    const s: HistoryShard = {};
    recordPrice(s, "1", 2, 100, 5, 0);
    recordPrice(s, "1", 2, 101, 7, 0);
    recordPrice(s, "1", 2, 101, 8, 0);
    expect(s["1"][2]).toEqual([100, 5, 0, 101, 8, 0]);
    recordPrice(s, "1", 2, 101, 5, 0); // back to the earlier price the same day
    expect(s["1"][2]).toEqual([100, 5, 0]);
  });

  it("keeps chains separate", () => {
    const s: HistoryShard = {};
    recordPrice(s, "1", 0, 100, 5, 0);
    recordPrice(s, "1", 1, 100, 6, 0);
    expect(Object.keys(s["1"])).toEqual(["0", "1"]);
  });

  it("day helpers", () => {
    expect(dayToIso(dayNumber(Date.parse("2026-10-04T13:30:00Z")))).toBe("2026-10-04");
  });

  it("finds the previous snapshot from the GitHub Actions environment", () => {
    expect(previousSnapshotBase({ GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "me/app" } as never)).toBe("https://me.github.io/app/data");
    expect(previousSnapshotBase({} as never)).toBeNull();
    expect(previousSnapshotBase({ PRICEWISE_HISTORY_BASE: "https://x/data/" } as never)).toBe("https://x/data");
  });
});

describe("loadPreviousHistory", () => {
  async function withServer(handler: (url: string) => { status: number; body?: unknown }, run: (base: string) => Promise<void>) {
    const http = await import("node:http");
    const server = http.createServer((req, res) => {
      const r = handler(req.url ?? "");
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(r.body === undefined ? "" : JSON.stringify(r.body));
    });
    await new Promise<void>((ok) => server.listen(0, ok));
    try {
      await run(`http://127.0.0.1:${(server.address() as { port: number }).port}/data`);
    } finally {
      server.close();
    }
  }

  it("starts fresh when the previous snapshot has no history yet", async () => {
    await withServer(() => ({ status: 200, body: { counts: {} } }), async (base) => {
      const h = await loadPreviousHistory(base, 20730, () => {});
      expect(h.since).toBe("2026-10-04");
      expect(h.shards).toHaveLength(1000);
    });
  });

  it("carries over the previous history", async () => {
    await withServer(
      (url) => (url.endsWith("meta.json") ? { status: 200, body: { history: { since: "2026-09-01" } } } : { status: 200, body: { "123": { "0": [20700, 5, 0] } } }),
      async (base) => {
        const h = await loadPreviousHistory(base, 20730, () => {});
        expect(h.since).toBe("2026-09-01");
        expect(h.shards[7]["123"]["0"]).toEqual([20700, 5, 0]);
      },
    );
  });

  it("refuses to continue (so the old history is never overwritten) when a shard cannot be fetched", async () => {
    await withServer(
      (url) => (url.endsWith("meta.json") ? { status: 200, body: { history: { since: "2026-09-01" } } } : { status: 404 }),
      async (base) => {
        await expect(loadPreviousHistory(base, 20730, () => {})).rejects.toThrow(/missing/);
      },
    );
  });
});
