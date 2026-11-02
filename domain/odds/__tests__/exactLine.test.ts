import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { matchLeg, matchOutcome, refreshOddsForCandidate, type OddsApiOutcome } from "../refreshService";
import { resolveLegPrice } from "../estimate";
import { describeLegPrice } from "../priceSource";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { putIdea } from "@/storage/indexeddb/repositories/ideasRepository";
import { getAllLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import type { CandidateParlay, CapturedIdea } from "@/domain/types";

// EXACT LINE (Trevor/GPT 2026-11-02): the line is part of the bet. If the book
// no longer offers the captured line, the leg is unavailable at that line; the
// main line is never substituted into a refresh or an estimate.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});
afterEach(() => vi.unstubAllGlobals());

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
    selection: "Over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: "",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

const puka = (point: number, name = "Over", priceAmerican = -110, marketKey = "player_reception_yds"): OddsApiOutcome => ({
  marketKey,
  name,
  description: "Puka Nacua",
  point,
  priceAmerican,
});

describe("matchLeg: only the leg's own line is the leg", () => {
  it("a book that moved its line isn't offering this bet; its new main line is never taken", () => {
    const outcomes = [puka(65.5, "Over", -115), puka(65.5, "Under", -105)];
    expect(matchLeg(makeIdea(), outcomes)).toEqual({ miss: "line_not_offered" });
    expect(matchOutcome(makeIdea(), outcomes)).toBeNull();
  });

  it("among several lines (an alternate-line market), takes the exact one, not the first with the selection", () => {
    const alt = "player_reception_yds_alternate";
    const outcomes = [puka(49.5, "Over", -400, alt), puka(59.5, "Over", -180, alt), puka(63.5, "Over", -110, alt), puka(79.5, "Over", 200, alt)];
    expect(matchOutcome(makeIdea({ marketKey: alt }), outcomes)).toMatchObject({ point: 63.5, priceAmerican: -110 });
  });

  it("a leg with no line, in a market with lines, can't be identified (no guess)", () => {
    expect(matchLeg(makeIdea({ lineAtCapture: null }), [puka(63.5)])).toEqual({ miss: "unidentified" });
  });

  it("a market the book doesn't list is still told apart from a line it doesn't offer", () => {
    expect(matchLeg(makeIdea(), [puka(63.5, "Over", -110, "player_receptions")])).toEqual({ miss: "market_not_listed" });
  });

  it("a market with no lines (anytime TD) still matches by player", () => {
    const td: OddsApiOutcome = { marketKey: "player_anytime_td", name: "Yes", description: "Puka Nacua", point: null, priceAmerican: 140 };
    expect(matchOutcome(makeIdea({ marketKey: "player_anytime_td", selection: "Yes", lineAtCapture: null }), [td])).toEqual(td);
  });
});

describe("refresh at a line the book no longer offers", () => {
  it("stores the bet as not offered, with no price, and says which line", async () => {
    const idea = makeIdea();
    await putIdea(idea);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.startsWith("/api/odds")) return new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), players: {} }));
        return new Response(
          JSON.stringify({
            results: [
              {
                eventId: "evt-1",
                ideaIds: [idea.id],
                status: "ok",
                fetchedAt: new Date().toISOString(),
                warning: null,
                outcomes: [puka(65.5, "Over", -115), puka(65.5, "Under", -105)],
              },
            ],
          }),
        );
      }),
    );
    await refreshOddsForCandidate({ id: "slip-1", name: "Sunday", sportsbook: "FanDuel", ideaIds: [idea.id] } as unknown as CandidateParlay, [idea]);

    const [row] = await getAllLiveContext();
    expect(row.marketAvailable).toBe(false);
    expect(row.currentOddsAmerican).toBeNull();
    expect(row.currentLine).toBeNull();
    expect(row.warnings).toContain("This sportsbook isn't offering this bet at 63.5 right now.");
  });
});

describe("the estimate never prices a leg at another line", () => {
  const base = { ideaId: "a", eventId: "evt-1", slipSportsbook: "FanDuel" };

  it("ignores a live price stored for another line; the capture price (its own line) is the fallback", () => {
    const resolved = resolveLegPrice({ ...base, currentOddsAmerican: -115, currentLine: 65.5, captureOddsAmerican: -110, captureLine: 63.5, captureSportsbook: "FanDuel" });
    expect(resolved).toMatchObject({ source: "capture", oddsAmerican: -110, line: 63.5 });
  });

  it("a live price for a line the leg doesn't have (no line set) isn't the leg's either", () => {
    const resolved = resolveLegPrice({ ...base, currentOddsAmerican: -115, currentLine: 65.5, captureOddsAmerican: null, captureLine: null });
    expect(resolved.source).toBe("unavailable");
  });

  it("says the book isn't offering this bet AT its line", () => {
    const resolved = resolveLegPrice({ ...base, currentOddsAmerican: null, captureOddsAmerican: -110, captureLine: 63.5, marketAvailable: false });
    expect(resolved).toMatchObject({ source: "unavailable", unavailableReason: "market_not_offered", notOfferedLine: 63.5 });
    expect(describeLegPrice(resolved, "FanDuel").text).toBe("No price · FanDuel isn't offering this bet at 63.5");
  });
});
