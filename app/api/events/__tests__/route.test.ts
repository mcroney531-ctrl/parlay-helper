import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import { __clearEventsCacheForTests } from "@/integrations/odds-api/events";

beforeEach(() => {
  __clearEventsCacheForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/events", () => {
  it("requires a league", async () => {
    const response = await GET(new Request("http://localhost/api/events"));
    expect(response.status).toBe(400);
  });

  it("reports not_configured for an unsupported league without erroring", async () => {
    const response = await GET(new Request("http://localhost/api/events?league=CFL"));
    const json = await response.json();
    expect(json.status).toBe("not_configured");
    expect(json.events).toEqual([]);
  });

  it("reports not_configured when no API key is set, without leaking an error", async () => {
    vi.stubEnv("ODDS_API_KEY", "");
    const response = await GET(new Request("http://localhost/api/events?league=NFL"));
    const json = await response.json();
    expect(json.status).toBe("not_configured");
  });

  it("returns normalized events when configured", async () => {
    vi.stubEnv("ODDS_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "evt-1", commence_time: "2026-09-21T17:00:00Z", home_team: "Bengals", away_team: "Ravens" },
        ]),
        { status: 200 },
      ),
    );
    const response = await GET(new Request("http://localhost/api/events?league=NFL"));
    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.events).toHaveLength(1);
  });
});
