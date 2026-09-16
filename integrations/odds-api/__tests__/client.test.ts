import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEventOdds } from "../client";
import { __clearCacheForTests } from "../cache";

const baseParams = {
  sportKey: "americanfootball_nfl",
  eventId: "evt-a",
  bookmakerKey: "fanduel",
  sportsbookLabel: "FanDuel",
  marketKeys: ["player_reception_yds"],
};

beforeEach(() => {
  __clearCacheForTests();
  vi.stubEnv("ODDS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchEventOdds", () => {
  it("returns not_configured without calling fetch when no API key is set", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchEventOdds(baseParams);
    expect(result.status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes a successful provider response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt-a",
          commence_time: "2026-09-21T17:00:00Z",
          bookmakers: [
            {
              key: "fanduel",
              markets: [
                {
                  key: "player_reception_yds",
                  outcomes: [{ name: "Over", point: 63.5, price: -110 }],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await fetchEventOdds(baseParams);
    expect(result.status).toBe("ok");
    expect(result.odds?.outcomes[0]).toMatchObject({ name: "Over", point: 63.5, priceAmerican: -110 });
  });

  it("returns not_found on a 404 without leaking the raw response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 404 }));
    const result = await fetchEventOdds(baseParams);
    expect(result.status).toBe("not_found");
  });

  it("returns provider_error on network failure without leaking internals", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET secret-detail"));
    const result = await fetchEventOdds(baseParams);
    expect(result.status).toBe("provider_error");
    expect(result.warning).not.toContain("secret-detail");
  });

  it("caches successive identical requests instead of calling fetch twice", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt-a", commence_time: null, bookmakers: [] }), { status: 200 }),
    );
    await fetchEventOdds(baseParams);
    await fetchEventOdds(baseParams);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
