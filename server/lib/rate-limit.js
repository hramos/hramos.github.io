// Simple in-memory fixed-window rate limiter, per IP.
//
// SERVERLESS CAVEAT: the counter lives in process memory. On Vercel each
// instance has its own map and cold starts reset it, so the effective limit is
// per-instance, not global. That's intentional and good enough to stop naive
// credit-burning loops; it is NOT a hard global quota. The real spend backstop
// is OpenAI's usage caps. Locally (single long-running process) it's exact.

const WINDOW_MS = 60_000; // fixed 1-minute window

export function rateLimitFromEnv(env = process.env) {
  const n = Number(env.PBJT_RATE_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 20; // default 20 req/min
}

// Create an isolated limiter. Each module-level instance keeps its own map.
export function createRateLimiter({ limit, windowMs = WINDOW_MS, now = () => Date.now() } = {}) {
  const max = limit ?? rateLimitFromEnv();
  const buckets = new Map(); // ip -> { count, resetAt }

  return {
    // Returns { allowed, retryAfter } — retryAfter is whole seconds until reset.
    check(ip) {
      const key = ip || 'unknown';
      const t = now();
      let b = buckets.get(key);
      if (!b || t >= b.resetAt) {
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      if (b.count > max) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
      }
      return { allowed: true, retryAfter: 0 };
    },
  };
}

// Extract the client IP. On Vercel, x-forwarded-for's FIRST value is the real
// client; locally we fall back to the socket address.
export function clientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}
