import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiServer } from "./api.ts";
import { openDb } from "./db.ts";
import { parseRecognizeBody } from "./recognize.ts";

let base = "";
let close: () => void = () => {};
let tmp = "";

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pw-api-"));
  fs.mkdirSync(path.join(tmp, "dist", "assets"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "dist-secret"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "dist", "index.html"), "<!doctype html><title>app</title>");
  fs.writeFileSync(path.join(tmp, "dist", "assets", "a.js"), "console.log(1)");
  fs.writeFileSync(path.join(tmp, "dist-secret", "passwords.txt"), "hunter2");
  const db = openDb(path.join(tmp, "test.db"));
  db.exec("INSERT INTO products (barcode, name, manufacturer, chain_count) VALUES ('7290000066318', 'במבה 80 גרם', 'אסם', 5)");
  const server = createApiServer(db, { staticDir: path.join(tmp, "dist") });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => {
    server.close();
    db.close();
  };
});

afterAll(() => {
  close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// A raw request, so odd paths reach the server exactly as written (fetch would normalise them).
function raw(pathAndQuery: string, method = "GET", body?: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  return new Promise((resolve, reject) => {
    import("node:http").then(({ request }) => {
      const url = new URL(base);
      const req = request({ host: url.hostname, port: url.port, path: pathAndQuery, method, headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {} }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
      });
      req.on("error", reject);
      req.end(body);
    });
  });
}

describe("API server hardening", () => {
  it("serves the app and the data API", async () => {
    expect((await raw("/")).text).toContain("<title>app</title>");
    const r = await raw("/pw-api/products?q=" + encodeURIComponent("במבה"));
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)[0].barcode).toBe("7290000066318");
  });

  it("survives a malformed %-escape instead of crashing", async () => {
    const bad = await raw("/%E0%A4%A");
    expect(bad.status).toBeLessThan(500);
    // …and is still alive afterwards
    expect((await raw("/pw-api/health")).status).toBe(200);
  });

  it("does not serve files outside dist/ (including a sibling that shares the prefix)", async () => {
    for (const p of ["/../dist-secret/passwords.txt", "/..%2Fdist-secret%2Fpasswords.txt", "/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2F..%2Fdist-secret%2Fpasswords.txt"]) {
      // A refused/aborted connection is also "not served"; what matters is no leak and no crash.
      const r = await raw(p).catch((e: Error) => ({ status: 0, text: "", error: e.message }));
      expect(r.text).not.toContain("hunter2");
      if ("error" in r) console.warn("aborted:", p, r.error);
    }
    expect((await raw("/assets/a.js")).status).toBe(200);
  });

  it("sends security headers", async () => {
    const r = await raw("/");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    const api = await raw("/pw-api/products?q=x");
    expect(api.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("ignores NaN/Infinity query numbers instead of failing", async () => {
    expect((await raw("/pw-api/products?q=" + encodeURIComponent("במבה") + "&limit=abc")).status).toBe(200);
    expect((await raw("/pw-api/branches?lat=NaN&lng=Infinity&radiusKm=x&limit=-5")).status).toBe(200);
  });

  it("validates the recognize request before spending money on the AI", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-never-used";
    try {
      for (const body of ["null", "[]", '"x"', '{"image":123}', '{"image":["a"]}', '{"image":"not base64!!"}', '{"image":"AAAA"}', "{not json"]) {
        const r = await raw("/pw-api/recognize", "POST", body);
        expect([400, 413]).toContain(r.status);
      }
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});

describe("parseRecognizeBody", () => {
  const ok = "A".repeat(200);
  it("accepts a base64 image and defaults to jpeg", () => {
    expect(parseRecognizeBody({ image: ok })).toEqual({ image: ok, mediaType: "image/jpeg" });
    expect(parseRecognizeBody({ image: ok, mediaType: "image/png" })?.mediaType).toBe("image/png");
    expect(parseRecognizeBody({ image: ok, mediaType: "text/html" })?.mediaType).toBe("image/jpeg");
  });
  it("rejects everything else", () => {
    expect(parseRecognizeBody(null)).toBeNull();
    expect(parseRecognizeBody({ image: 5 })).toBeNull();
    expect(parseRecognizeBody({ image: ok + "!" })).toBeNull();
    expect(parseRecognizeBody({ image: ok }, 100)).toBeNull(); // too large
  });
});
