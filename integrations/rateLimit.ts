// Minimal in-process, fixed-window, per-key rate limiter. It is deliberately
// small and has a real limitation worth stating plainly: on a multi-instance
// or serverless deployment (e.g. Vercel functions), each instance holds its
// own Map, so this only blunts abuse landing repeatedly on the same warm
// instance — it is not a substitute for platform/edge-level rate limiting
// on a publicly reachable deployment with a real, quota-bearing API key.
// It's a cheap second layer, not the primary control.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000; // hard cap on distinct keys tracked at once — see evictOneEntry
const SHARED_KEY = "__shared__";

export const DEFAULT_MAX_REQUESTS = numericEnv("ODDS_RATE_LIMIT_MAX", 20);
export const DEFAULT_WINDOW_MS = numericEnv("ODDS_RATE_LIMIT_WINDOW_MS", 60_000);

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= MAX_TRACKED_KEYS) {
      evictOneEntry(now);
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true };
}

/**
 * Keeps the map's size hard-bounded regardless of how many distinct keys
 * arrive within a single window (e.g. an attacker cycling through many
 * spoofed identifiers). Reclaims an already-expired entry when one exists;
 * otherwise evicts the oldest tracked key — Map iteration order is
 * insertion order, and re-`set()`ing an existing key never moves it, so
 * `buckets.keys().next()` is genuinely the least-recently-first-seen key.
 */
function evictOneEntry(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) {
      buckets.delete(k);
      return;
    }
  }
  const oldestKey = buckets.keys().next().value;
  if (oldestKey !== undefined) buckets.delete(oldestKey);
}

/**
 * Best-effort client identifier. `X-Forwarded-For` and `X-Real-Ip` are
 * ordinary request headers — with no trusted proxy in front of this
 * process, a caller can set them to anything, including a fresh random
 * value on every request, which would let them bypass a per-IP limit
 * entirely. So by default we don't trust them at all: every caller shares
 * one bucket, which is more restrictive but never spoofable down to "no
 * limit."
 *
 * Set RATE_LIMIT_TRUST_PROXY=true only if this process sits behind a
 * trusted reverse proxy/edge that itself appends the real client IP as
 * the *last* hop of X-Forwarded-For (the standard single-trusted-hop
 * convention) — verify that against your actual deployment topology
 * before enabling it; getting this wrong reopens the same spoofing hole
 * this default is closing.
 */
export function clientKeyFromRequest(request: Request): string {
  if (process.env.RATE_LIMIT_TRUST_PROXY !== "true") {
    return SHARED_KEY;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return request.headers.get("x-real-ip") ?? SHARED_KEY;
}

export function __clearRateLimitForTests(): void {
  buckets.clear();
}
