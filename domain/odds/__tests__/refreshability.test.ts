import { describe, expect, it } from "vitest";
import { describePriceBlockers, missingOddsRequestFields, priceBlockers } from "../refreshability";
import type { CapturedIdea } from "@/domain/types";

function makeIdea(overrides: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id: "idea-1",
    rawText: "raw",
    detailsStatus: "structured",
    sport: null,
    league: "NFL",
    slateDate: null,
    playerId: null,
    playerName: "Puka Nacua",
    team: null,
    opponent: null,
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: null,
    selection: "over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

describe("missingOddsRequestFields", () => {
  it("is empty when league, game and market are all set, whatever else is missing", () => {
    expect(missingOddsRequestFields(makeIdea({ selection: null, playerName: null, lineAtCapture: null }))).toEqual([]);
  });

  it("names each missing request field, treating an empty string as missing", () => {
    expect(missingOddsRequestFields(makeIdea({ eventId: null }))).toEqual(["no_game"]);
    expect(missingOddsRequestFields(makeIdea({ eventId: "" }))).toEqual(["no_game"]);
    expect(missingOddsRequestFields(makeIdea({ marketKey: null }))).toEqual(["no_market"]);
    expect(missingOddsRequestFields(makeIdea({ league: null }))).toEqual(["no_league"]);
    expect(missingOddsRequestFields(makeIdea({ eventId: null, marketKey: null, league: null }))).toEqual([
      "no_game",
      "no_market",
      "no_league",
    ]);
  });
});

describe("priceBlockers", () => {
  it("adds unsupported_book only for a book the odds provider doesn't cover", () => {
    expect(priceBlockers(makeIdea(), "Bet365")).toEqual(["unsupported_book"]);
    expect(priceBlockers(makeIdea(), "")).toEqual(["unsupported_book"]);
    for (const book of ["FanDuel", "fan duel", "FD", "DK", "DraftKings Sportsbook", "MGM", "Caesars", "ESPN BET"]) {
      expect(priceBlockers(makeIdea(), book)).toEqual([]);
    }
  });

  it("combines missing details with an unsupported book", () => {
    expect(priceBlockers(makeIdea({ marketKey: null }), "Bet365")).toEqual(["no_market", "unsupported_book"]);
  });
});

describe("describePriceBlockers", () => {
  it("is null when nothing blocks a price", () => {
    expect(describePriceBlockers([], "FanDuel")).toBeNull();
  });

  it("lists one, two or three missing details as a sentence", () => {
    expect(describePriceBlockers(["no_game"], "FanDuel")).toBe(
      "No live price until this idea has a game set in its details.",
    );
    expect(describePriceBlockers(["no_game", "no_market"], "FanDuel")).toBe(
      "No live price until this idea has a game and a market set in its details.",
    );
    expect(describePriceBlockers(["no_game", "no_market", "no_league"], "FanDuel")).toBe(
      "No live price until this idea has a game, a market and a league set in its details.",
    );
  });

  it("names an unsupported book and the supported list, after any missing details", () => {
    expect(describePriceBlockers(["no_market", "unsupported_book"], " Bet365 ")).toBe(
      'No live price until this idea has a market set in its details. Live odds aren\'t available for "Bet365" (supported: FanDuel, DraftKings, BetMGM, Caesars, ESPN BET).',
    );
  });
});
