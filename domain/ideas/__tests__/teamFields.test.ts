import { describe, expect, it } from "vitest";
import { manualFromValues, opponentFor, teamFieldsAfterGameChange, teamFieldsAfterPlayerChange } from "../teamFields";
import { resolveNflTeam } from "@/domain/teams";

// Chunk 4b (Trevor/GPT 2026-11-02): Team from the picked player via the static
// table, Opponent from the picked game; recomputed only on a player or game
// change; typed values stick; unknown teams give a blank, never a guess.

const game = { homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" };
const auto = { team: false, opponent: false };
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
    expect(teamFieldsAfterGameChange(blank, auto, game)).toEqual(blank);
  });

  it("fills Opponent with the other side when Team names one, in any form the table knows", () => {
    expect(teamFieldsAfterGameChange({ team: "Los Angeles Rams", opponent: "" }, auto, game).opponent).toBe("Seattle Seahawks");
    expect(teamFieldsAfterGameChange({ team: "Seattle Seahawks", opponent: "" }, auto, game).opponent).toBe("Los Angeles Rams");
    expect(teamFieldsAfterGameChange({ team: "LAR", opponent: "" }, auto, game).opponent).toBe("Seattle Seahawks"); // an older idea's code
  });

  it("recomputes a filled-in Opponent for a new game, and clears it when the game is cleared or Team isn't in it", () => {
    const filled = { team: "Los Angeles Rams", opponent: "Seattle Seahawks" };
    expect(teamFieldsAfterGameChange(filled, auto, { homeTeam: "San Francisco 49ers", awayTeam: "Los Angeles Rams" }).opponent).toBe("San Francisco 49ers");
    expect(teamFieldsAfterGameChange(filled, auto, null).opponent).toBe("");
    expect(teamFieldsAfterGameChange({ team: "Dallas Cowboys", opponent: "Seattle Seahawks" }, auto, game).opponent).toBe("");
  });

  it("keeps an Opponent the user typed, through any game change", () => {
    const typed = { team: "Los Angeles Rams", opponent: "Somebody Else" };
    const manual = { team: false, opponent: true };
    expect(teamFieldsAfterGameChange(typed, manual, game)).toEqual(typed);
    expect(teamFieldsAfterGameChange(typed, manual, null)).toEqual(typed);
  });
});

describe("picking a player", () => {
  it("sets Team from the player's team, and Opponent from the selected game", () => {
    expect(teamFieldsAfterPlayerChange(blank, auto, "LAR", game)).toEqual({ team: "Los Angeles Rams", opponent: "Seattle Seahawks" });
    expect(teamFieldsAfterPlayerChange(blank, auto, "SEA", null)).toEqual({ team: "Seattle Seahawks", opponent: "" });
  });

  it("a new player replaces a filled-in Team, and the Opponent follows", () => {
    const puka = { team: "Los Angeles Rams", opponent: "Seattle Seahawks" };
    expect(teamFieldsAfterPlayerChange(puka, auto, "SEA", game)).toEqual({ team: "Seattle Seahawks", opponent: "Los Angeles Rams" });
  });

  it("an unknown team, or a player typed rather than picked, gives a blank Team, never the old one", () => {
    const puka = { team: "Los Angeles Rams", opponent: "Seattle Seahawks" };
    expect(teamFieldsAfterPlayerChange(puka, auto, "FA", game)).toEqual(blank);
    expect(teamFieldsAfterPlayerChange(puka, auto, null, game)).toEqual(blank);
  });

  it("keeps a Team and Opponent the user typed", () => {
    const typed = { team: "Rams practice squad", opponent: "Somebody Else" };
    expect(teamFieldsAfterPlayerChange(typed, { team: true, opponent: true }, "SEA", game)).toEqual(typed);
  });
});

describe("what counts as typed when the sheet opens", () => {
  it("a team the table knows was filled in (recomputed); anything else was typed (sticks); blank is neither", () => {
    expect(manualFromValues({ team: "Los Angeles Rams", opponent: "SEA" })).toEqual({ team: false, opponent: false });
    expect(manualFromValues({ team: "Rams practice squad", opponent: "Somebody Else" })).toEqual({ team: true, opponent: true });
    expect(manualFromValues(blank)).toEqual(auto);
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
