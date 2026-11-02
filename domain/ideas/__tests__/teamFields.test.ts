import { describe, expect, it } from "vitest";
import { opponentFor, teamFieldsAfterGameChange, teamFieldsAfterPlayerChange } from "../teamFields";
import { resolveNflTeam } from "@/domain/teams";

// Chunk 4b (Trevor/GPT 2026-11-02): Team from the picked player via the static
// table, Opponent from the picked game. A player or game change recomputes
// them, over anything typed; a typed value lasts only until that change.
// Unknown teams give a blank, never a guess.

const game = { homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" };
const blank = { team: "", opponent: "" };

describe("the team table", () => {
  it("resolves codes, full names, nicknames, City Nickname and a city one team has", () => {
    for (const v of ["LAR", "lar", "Los Angeles Rams", "Rams", "LA Rams", "los angeles rams"]) expect(resolveNflTeam(v)?.name).toBe("Los Angeles Rams");
    expect(resolveNflTeam("Seattle")?.name).toBe("Seattle Seahawks");
  });

  it("never guesses: a shared city or an unknown team is null", () => {
    for (const v of ["Los Angeles", "New York", "LA", "Lakers", "FA", ""]) expect(resolveNflTeam(v)).toBeNull();
  });
});

describe("picking a game", () => {
  it("never guesses the player's side: blank Team leaves both blank", () => {
    expect(teamFieldsAfterGameChange(blank, game)).toEqual(blank);
  });

  it("fills Opponent with the other side when Team names one, in any form the table knows", () => {
    expect(teamFieldsAfterGameChange({ team: "Los Angeles Rams", opponent: "" }, game).opponent).toBe("Seattle Seahawks");
    expect(teamFieldsAfterGameChange({ team: "Seattle Seahawks", opponent: "" }, game).opponent).toBe("Los Angeles Rams");
    expect(teamFieldsAfterGameChange({ team: "LAR", opponent: "" }, game).opponent).toBe("Seattle Seahawks"); // an older idea's code
  });

  it("recomputes Opponent for a new game, and clears it when the game is cleared or Team isn't in it", () => {
    const filled = { team: "Los Angeles Rams", opponent: "Seattle Seahawks" };
    expect(teamFieldsAfterGameChange(filled, { homeTeam: "San Francisco 49ers", awayTeam: "Los Angeles Rams" }).opponent).toBe("San Francisco 49ers");
    expect(teamFieldsAfterGameChange(filled, null).opponent).toBe("");
    expect(teamFieldsAfterGameChange({ team: "Dallas Cowboys", opponent: "Seattle Seahawks" }, game).opponent).toBe("");
  });

  it("recomputes over a typed Opponent, and keeps Team (typed or not)", () => {
    expect(teamFieldsAfterGameChange({ team: "Los Angeles Rams", opponent: "Somebody Else" }, game)).toEqual({ team: "Los Angeles Rams", opponent: "Seattle Seahawks" });
    expect(teamFieldsAfterGameChange({ team: "Rams practice squad", opponent: "Somebody Else" }, game)).toEqual({ team: "Rams practice squad", opponent: "" });
  });
});

describe("picking a player", () => {
  it("sets Team from the player's team, and Opponent from the selected game", () => {
    expect(teamFieldsAfterPlayerChange("LAR", game)).toEqual({ team: "Los Angeles Rams", opponent: "Seattle Seahawks" });
    expect(teamFieldsAfterPlayerChange("SEA", null)).toEqual({ team: "Seattle Seahawks", opponent: "" });
  });

  it("an unknown team, or a player typed rather than picked, gives a blank Team, never the old one", () => {
    expect(teamFieldsAfterPlayerChange("FA", game)).toEqual(blank);
    expect(teamFieldsAfterPlayerChange(null, game)).toEqual(blank);
  });

  it("doesn't depend on what was in Team or Opponent before, typed or not", () => {
    expect(teamFieldsAfterPlayerChange("PIT", game)).toEqual({ team: "Pittsburgh Steelers", opponent: "" });
  });
});

describe("opponentFor", () => {
  it("is null without a game or a Team", () => {
    expect(opponentFor("", game)).toBeNull();
    expect(opponentFor("Los Angeles Rams", null)).toBeNull();
  });

  it("matches an exact side name for a team the table doesn't know (e.g. college)", () => {
    expect(opponentFor("Alabama Crimson Tide", { homeTeam: "Alabama Crimson Tide", awayTeam: "Georgia Bulldogs" })).toBe("Georgia Bulldogs");
  });
});
