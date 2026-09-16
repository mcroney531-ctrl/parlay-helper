import { describe, expect, it } from "vitest";
import { searchPlayersByName } from "../search";
import type { SleeperPlayer } from "../types";

function player(overrides: Partial<SleeperPlayer>): SleeperPlayer {
  return {
    playerId: "0",
    fullName: "Test Player",
    team: null,
    position: null,
    status: null,
    depthChartPosition: null,
    ...overrides,
  };
}

const PLAYERS: Record<string, SleeperPlayer> = {
  "1": player({ playerId: "1", fullName: "Puka Nacua", team: "LAR" }),
  "2": player({ playerId: "2", fullName: "Cooper Kupp", team: "SEA" }),
  "3": player({ playerId: "3", fullName: "Puka Backup Guy", team: "LAR" }),
};

describe("searchPlayersByName", () => {
  it("returns no results for a query shorter than 2 characters", () => {
    expect(searchPlayersByName(PLAYERS, "p")).toEqual([]);
  });

  it("matches by substring, case-insensitively", () => {
    const results = searchPlayersByName(PLAYERS, "kupp");
    expect(results.map((p) => p.playerId)).toEqual(["2"]);
  });

  it("ranks prefix matches above other substring matches", () => {
    const results = searchPlayersByName(PLAYERS, "puka");
    expect(results.map((p) => p.playerId)).toEqual(["1", "3"]);
  });

  it("never returns a raw id as the visible label — always resolves to a full name", () => {
    const results = searchPlayersByName(PLAYERS, "puka");
    for (const r of results) expect(r.fullName).toMatch(/[a-z]/i);
  });
});
