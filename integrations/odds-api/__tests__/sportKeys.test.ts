import { describe, expect, it } from "vitest";
import { sportForLeague, SUPPORTED_LEAGUES } from "../sportKeys";

describe("sportForLeague", () => {
  it("maps every supported league to a sport label", () => {
    for (const league of SUPPORTED_LEAGUES) {
      expect(sportForLeague(league)).not.toBeNull();
    }
  });

  it("is case-insensitive", () => {
    expect(sportForLeague("nfl")).toBe("football");
  });

  it("returns null for an unrecognized or missing league", () => {
    expect(sportForLeague("XFL")).toBeNull();
    expect(sportForLeague(null)).toBeNull();
  });
});
