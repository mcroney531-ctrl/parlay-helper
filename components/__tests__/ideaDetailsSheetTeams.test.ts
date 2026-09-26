import { describe, expect, it } from "vitest";
import { teamFieldsForPickedEvent } from "../IdeaDetailsSheet";

// Picking a game gives both team names but not which side the player is on,
// so a blank Team must never be guessed as either side (away was wrong for
// every home-team player, and home would be wrong for every away player).
const game = { homeTeam: "Los Angeles Rams", awayTeam: "Seattle Seahawks" };

describe("teamFieldsForPickedEvent (IdeaDetailsSheet game picker)", () => {
  it("leaves Team and Opponent blank when both are blank, instead of guessing a side", () => {
    expect(teamFieldsForPickedEvent("", "", game)).toEqual({});
    expect(teamFieldsForPickedEvent("  ", " ", game)).toEqual({});
  });

  it("fills Opponent with the away team when Team is the home team", () => {
    expect(teamFieldsForPickedEvent("Los Angeles Rams", "", game)).toEqual({ opponent: "Seattle Seahawks" });
  });

  it("fills Opponent with the home team when Team is the away team", () => {
    expect(teamFieldsForPickedEvent("Seattle Seahawks", "", game)).toEqual({ opponent: "Los Angeles Rams" });
  });

  it("leaves Opponent blank when Team doesn't name either side of the game", () => {
    expect(teamFieldsForPickedEvent("LAR", "", game)).toEqual({});
    expect(teamFieldsForPickedEvent("Dallas Cowboys", "", game)).toEqual({});
  });

  it("never overwrites a Team or Opponent the user already entered", () => {
    expect(teamFieldsForPickedEvent("Los Angeles Rams", "San Francisco 49ers", game)).toEqual({});
    expect(teamFieldsForPickedEvent("", "Seattle Seahawks", game)).toEqual({});
  });
});
