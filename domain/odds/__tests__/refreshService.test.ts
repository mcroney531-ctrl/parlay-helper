import { describe, expect, it } from "vitest";
import { matchOutcome } from "../refreshService";
import { changesPriceIdentity } from "@/domain/ideas/ideaService";
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
    playerName: null,
    team: null,
    opponent: null,
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: "Receiving Yards",
    selection: "over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: -110,
    sportsbookAtCapture: "FanDuel",
    confidence: "unrated",
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

describe("matchOutcome — player identity", () => {
  it("attaches the correct player's line when multiple players share a market", () => {
    const outcomes = [
      { marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -110 },
      { marketKey: "player_reception_yds", name: "Under", description: "Puka Nacua", point: 63.5, priceAmerican: -110 },
      { marketKey: "player_reception_yds", name: "Over", description: "Cooper Kupp", point: 71.5, priceAmerican: -115 },
      { marketKey: "player_reception_yds", name: "Under", description: "Cooper Kupp", point: 71.5, priceAmerican: -105 },
    ];
    const match = matchOutcome(makeIdea({ playerName: "Puka Nacua" }), outcomes);
    expect(match).toMatchObject({ description: "Puka Nacua", priceAmerican: -110 });
  });

  it("never silently attaches another player's outcome when the idea has no player name", () => {
    const outcomes = [
      { marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -110 },
      { marketKey: "player_reception_yds", name: "Over", description: "Cooper Kupp", point: 71.5, priceAmerican: -115 },
    ];
    const match = matchOutcome(makeIdea({ playerName: null }), outcomes);
    expect(match).toBeNull();
  });

  it("returns null instead of guessing when the named player isn't in the market", () => {
    const outcomes = [
      { marketKey: "player_reception_yds", name: "Over", description: "Cooper Kupp", point: 71.5, priceAmerican: -115 },
    ];
    const match = matchOutcome(makeIdea({ playerName: "Puka Nacua" }), outcomes);
    expect(match).toBeNull();
  });

  it("matches anytime-TD-style markets where the outcome name IS the player", () => {
    const outcomes = [
      { marketKey: "player_anytime_td", name: "Jonathan Taylor", description: null, point: null, priceAmerican: -170 },
      { marketKey: "player_anytime_td", name: "Puka Nacua", description: null, point: null, priceAmerican: 140 },
    ];
    const match = matchOutcome(
      makeIdea({ marketKey: "player_anytime_td", playerName: "Puka Nacua", selection: "yes", lineAtCapture: null }),
      outcomes,
    );
    expect(match).toMatchObject({ name: "Puka Nacua", priceAmerican: 140 });
  });

  it("still matches non-player markets (e.g. game totals) without a player name", () => {
    const outcomes = [
      { marketKey: "totals", name: "Over", description: null, point: 47.5, priceAmerican: -110 },
      { marketKey: "totals", name: "Under", description: null, point: 47.5, priceAmerican: -110 },
    ];
    const match = matchOutcome(
      makeIdea({ marketKey: "totals", playerName: null, selection: "over", lineAtCapture: 47.5 }),
      outcomes,
    );
    expect(match).toMatchObject({ name: "Over", point: 47.5 });
  });
});

describe("matchOutcome — selection normalization", () => {
  const totals = [
    { marketKey: "totals", name: "Over", description: null, point: 47.5, priceAmerican: -110 },
    { marketKey: "totals", name: "Under", description: null, point: 47.5, priceAmerican: -105 },
  ];
  const totalsIdea = (selection: string) =>
    makeIdea({ marketKey: "totals", playerName: null, selection, lineAtCapture: null });

  it("ignores surrounding whitespace in the selection, as it ignores case", () => {
    expect(matchOutcome(totalsIdea(" Over "), totals)).toMatchObject({ name: "Over", priceAmerican: -110 });
    expect(matchOutcome(totalsIdea("under\t"), totals)).toMatchObject({ name: "Under", priceAmerican: -105 });
  });

  it("prices two selections the same whenever changesPriceIdentity calls them the same proposition", () => {
    for (const [a, b] of [["Over", " over "], ["UNDER", "under"], ["Over", "Over  "]]) {
      expect(changesPriceIdentity(totalsIdea(a), totalsIdea(b))).toBe(false);
      expect(matchOutcome(totalsIdea(a), totals)).toEqual(matchOutcome(totalsIdea(b), totals));
    }
  });
});
