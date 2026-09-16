import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientKeyFromRequest, __clearRateLimitForTests } from "../rateLimit";

beforeEach(() => {
  __clearRateLimitForTests();
});

describe("checkRateLimit", () => {
  it("allows requests up to the max within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("a", 5, 60_000)).toBe(true);
    }
  });

  it("rejects once the max is exceeded within the window", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    expect(checkRateLimit("a", 5, 60_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 60_000);
    expect(checkRateLimit("b", 5, 60_000)).toBe(true);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("a", 5, 10);
    expect(checkRateLimit("a", 5, 10)).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit("a", 5, 10)).toBe(true);
        resolve(undefined);
      }, 20);
    });
  });
});

describe("clientKeyFromRequest", () => {
  it("uses the first x-forwarded-for entry", () => {
    const request = new Request("http://localhost/api/odds", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientKeyFromRequest(request)).toBe("203.0.113.5");
  });

  it("falls back to a shared key rather than skipping the limit entirely", () => {
    const request = new Request("http://localhost/api/odds");
    expect(clientKeyFromRequest(request)).toBe("unknown");
  });
});
