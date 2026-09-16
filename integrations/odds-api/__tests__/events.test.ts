import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listUpcomingEvents, __clearEventsCacheForTests } from "../events";

beforeEach(() => {
  __clearEventsCacheForTests();
  vi.stubEnv("ODDS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("listUpcomingEvents", () => {
  it("returns an empty list without calling fetch when no API key is set", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const events = await listUpcomingEvents("americanfootball_nfl");
    expect(events).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizes the provider's event list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "evt-1", commence_time: "2026-09-21T17:00:00Z", home_team: "Cincinnati Bengals", away_team: "Baltimore Ravens" },
        ]),
        { status: 200 },
      ),
    );
    const events = await listUpcomingEvents("americanfootball_nfl");
    expect(events).toEqual([
      { eventId: "evt-1", commenceTime: "2026-09-21T17:00:00Z", homeTeam: "Cincinnati Bengals", awayTeam: "Baltimore Ravens" },
    ]);
  });

  it("caches successive calls instead of refetching on every keystroke", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await listUpcomingEvents("americanfootball_nfl");
    await listUpcomingEvents("americanfootball_nfl");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
