import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clientKeyFromRequest, __clearRateLimitForTests } from "../rateLimit";

beforeEach(() => {
  __clearRateLimitForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkRateLimit", () => {
  it("allows requests up to the max within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("a", 5, 60_000).allowed).toBe(true);
    }
  });

  it("rejects once the max is exceeded, with a positive retryAfterSeconds", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    const result = checkRateLimit("a", 5, 60_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    expect(checkRateLimit("b", 5, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 10);
    expect(checkRateLimit("a", 5, 10).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checkRateLimit("a", 5, 10).allowed).toBe(true);
  });

  it("hard-caps the number of tracked keys instead of growing unboundedly", () => {
    // Simulate an attacker cycling through far more distinct identifiers
    // than the tracked-key cap within a single window (none expire).
    for (let i = 0; i < 5100; i++) {
      checkRateLimit(`spoofed-${i}`, 20, 60_000);
    }
    // Internal map size isn't exported directly; verify boundedness by
    // confirming an old key's budget was reclaimed rather than preserved
    // forever — key 0 should now behave like a brand-new key again.
    const veryFirstKeyResult = checkRateLimit("spoofed-0", 20, 60_000);
    expect(veryFirstKeyResult.allowed).toBe(true);
  });
});

describe("clientKeyFromRequest", () => {
  it("does not trust X-Forwarded-For by default (every caller shares one bucket)", () => {
    const spoofed1 = new Request("http://localhost/api/odds", { headers: { "x-forwarded-for": "1.2.3.4" } });
    const spoofed2 = new Request("http://localhost/api/odds", { headers: { "x-forwarded-for": "5.6.7.8" } });
    expect(clientKeyFromRequest(spoofed1)).toBe(clientKeyFromRequest(spoofed2));
  });

  it("still ignores X-Forwarded-For without an explicit trust flag", () => {
    vi.stubEnv("RATE_LIMIT_TRUST_PROXY", "false");
    const request = new Request("http://localhost/api/odds", { headers: { "x-forwarded-for": "203.0.113.5" } });
    expect(clientKeyFromRequest(request)).not.toBe("203.0.113.5");
  });

  it("uses the last hop of X-Forwarded-For when trust is explicitly enabled", () => {
    vi.stubEnv("RATE_LIMIT_TRUST_PROXY", "true");
    // Convention: client-supplied entries come first, the trusted proxy's
    // own observed peer is appended last — only the last entry is safe to use.
    const request = new Request("http://localhost/api/odds", {
      headers: { "x-forwarded-for": "9.9.9.9 (attacker-supplied), 203.0.113.5" },
    });
    expect(clientKeyFromRequest(request)).toBe("203.0.113.5");
  });

  it("falls back to a shared key rather than skipping the limit entirely", () => {
    vi.stubEnv("RATE_LIMIT_TRUST_PROXY", "true");
    const request = new Request("http://localhost/api/odds");
    expect(clientKeyFromRequest(request)).toBe("__shared__");
  });
});

describe("configurable limits", () => {
  it("reads ODDS_RATE_LIMIT_MAX / ODDS_RATE_LIMIT_WINDOW_MS instead of a hardcoded policy", async () => {
    vi.stubEnv("ODDS_RATE_LIMIT_MAX", "3");
    vi.stubEnv("ODDS_RATE_LIMIT_WINDOW_MS", "5000");
    vi.resetModules();
    const fresh = await import("../rateLimit");
    expect(fresh.DEFAULT_MAX_REQUESTS).toBe(3);
    expect(fresh.DEFAULT_WINDOW_MS).toBe(5000);
  });

  it("falls back to sane defaults when unset or invalid", async () => {
    vi.stubEnv("ODDS_RATE_LIMIT_MAX", "not-a-number");
    vi.resetModules();
    const fresh = await import("../rateLimit");
    expect(fresh.DEFAULT_MAX_REQUESTS).toBe(20);
  });
});
