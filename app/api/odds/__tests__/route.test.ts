import { describe, expect, it, beforeEach, vi } from "vitest";
import { groupLegsByEvent, POST } from "../route";
import { __clearRateLimitForTests } from "@/integrations/rateLimit";

describe("groupLegsByEvent", () => {
  it("groups multiple legs in the same event into one request group", () => {
    const groups = groupLegsByEvent([
      { ideaId: "1", league: "NFL", eventId: "evt-a", marketKey: "player_reception_yds" },
      { ideaId: "2", league: "NFL", eventId: "evt-a", marketKey: "player_receptions" },
      { ideaId: "3", league: "NFL", eventId: "evt-b", marketKey: "player_anytime_td" },
    ]);
    expect(groups).toHaveLength(2);
    const evtA = groups.find((g) => g.eventId === "evt-a");
    expect(evtA?.ideaIds).toEqual(["1", "2"]);
    expect([...(evtA?.marketKeys ?? [])].sort()).toEqual(["player_reception_yds", "player_receptions"]);
  });
});

describe("POST /api/odds", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    __clearRateLimitForTests();
  });

  it("rejects invalid request bodies", async () => {
    const request = new Request("http://localhost/api/odds", {
      method: "POST",
      body: JSON.stringify({ sportsbook: "FanDuel", legs: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns not_configured per event group when no API key is set, without leaking a raw upstream error", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const request = new Request("http://localhost/api/odds", {
      method: "POST",
      body: JSON.stringify({
        sportsbook: "FanDuel",
        legs: [{ ideaId: "1", league: "NFL", eventId: "evt-a", marketKey: "player_reception_yds" }],
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results).toHaveLength(1);
    expect(json.results[0].status).toBe("not_configured");
  });

  it("rejects an eventId with path-breaking characters instead of forwarding it upstream", async () => {
    const request = new Request("http://localhost/api/odds", {
      method: "POST",
      body: JSON.stringify({
        sportsbook: "FanDuel",
        legs: [{ ideaId: "1", league: "NFL", eventId: "../../etc/passwd", marketKey: "player_reception_yds" }],
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("caps requests spanning too many distinct events", async () => {
    const legs = Array.from({ length: 20 }, (_, i) => ({
      ideaId: `idea-${i}`,
      league: "NFL",
      eventId: `evt-${i}`,
      marketKey: "player_reception_yds",
    }));
    const request = new Request("http://localhost/api/odds", {
      method: "POST",
      body: JSON.stringify({ sportsbook: "FanDuel", legs }),
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("rate-limits repeated requests from the same client", async () => {
    const makeRequest = () =>
      new Request("http://localhost/api/odds", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ sportsbook: "FanDuel", legs: [{ ideaId: "1", league: "NFL", eventId: "evt-a", marketKey: "player_reception_yds" }] }),
      });

    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      lastStatus = (await POST(makeRequest())).status;
    }
    expect(lastStatus).toBe(429);
  });
});
