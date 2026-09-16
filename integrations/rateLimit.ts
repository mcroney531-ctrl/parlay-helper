// Minimal in-process, fixed-window, per-key rate limiter. It is deliberately
// small and has a real limitation worth stating plainly: on a multi-instance
// or serverless deployment (e.g. Vercel functions), each instance holds its
// own Map, so this only blunts abuse landing repeatedly on the same warm
// instance — it is not a substitute for platform/edge-level rate limiting
// on a publicly reachable deployment with a real, quota-bearing API key.
// It's a cheap second layer, not the primary control.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000; // opportunistic cap so an unbounded set of distinct keys can't grow this forever

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/** Best-effort client identifier from standard proxy headers; a shared fallback key fails toward more-restrictive shared limiting, never toward no limiting. */
export function clientKeyFromRequest(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function __clearRateLimitForTests(): void {
  buckets.clear();
}
