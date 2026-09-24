import { describe, expect, it } from "vitest";
import { clientIp, RateLimiter } from "../src/ratelimit.ts";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then asks to wait, then resets", () => {
    const rl = new RateLimiter(2, 60_000);
    expect(rl.check("a", 0)).toBe(0);
    expect(rl.check("a", 1)).toBe(0);
    expect(rl.check("a", 2)).toBe(60);
    expect(rl.check("b", 2)).toBe(0); // other clients unaffected
    expect(rl.check("a", 60_001)).toBe(0);
  });

  it("uses the forwarded client IP behind a tunnel", () => {
    // A client can prepend a fake address; the proxy-appended last one is trusted.
    expect(clientIp({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, "127.0.0.1")).toBe("1.2.3.4");
    expect(clientIp({}, "127.0.0.1")).toBe("127.0.0.1");
  });
});
