import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";
import { __setSnapshotForTests } from "@/integrations/sleeper/client";

beforeEach(() => {
  __setSnapshotForTests({
    fetchedAt: new Date().toISOString(),
    players: {
      "1": { playerId: "1", fullName: "Puka Nacua", team: "LAR", position: "WR", status: "Active", depthChartPosition: null },
      "2": { playerId: "2", fullName: "Someone Else", team: "SF", position: "WR", status: "Questionable", depthChartPosition: null },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/sleeper", () => {
  it("only returns the requested subset of players, never the full snapshot", async () => {
    const request = new Request("http://localhost/api/sleeper?playerIds=1");
    const response = await GET(request);
    const json = await response.json();
    expect(Object.keys(json.players)).toEqual(["1"]);
  });

  it("rejects too many requested ids", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => i).join(",");
    const request = new Request(`http://localhost/api/sleeper?playerIds=${ids}`);
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
