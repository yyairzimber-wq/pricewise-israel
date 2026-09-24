/**
 * Minimal in-memory rate limiter (fixed window per client IP). Enough for a
 * single server behind a tunnel/proxy; protects the paid AI endpoint and the
 * heavier queries from abuse when the server is reachable from the internet.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns seconds to wait, or 0 if the request is allowed. */
  check(key: string, now = Date.now()): number {
    const cur = this.hits.get(key);
    if (!cur || now >= cur.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return 0;
    }
    if (cur.count >= this.limit) return Math.ceil((cur.resetAt - now) / 1000);
    cur.count++;
    return 0;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (now >= v.resetAt) this.hits.delete(k);
  }
}

/**
 * Client IP behind one trusted proxy (Tailscale Funnel / Caddy): the proxy
 * appends the address it saw, so the LAST X-Forwarded-For entry is the real
 * client. Earlier entries are whatever the client sent and can be spoofed.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketIp: string | undefined): string {
  const fwd = headers["x-forwarded-for"];
  const last = (Array.isArray(fwd) ? fwd.join(",") : fwd)?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return last || socketIp || "unknown";
}
