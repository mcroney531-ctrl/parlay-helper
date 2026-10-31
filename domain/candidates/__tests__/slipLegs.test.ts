import { describe, expect, it } from "vitest";
import type { CapturedIdea, LiveContext } from "@/domain/types";
import { ideaLookup, missingLegIds, presentIdeas, resolveSlipLegs } from "../slipLegs";
import { calculateSlipEstimate, unpricedLegIds } from "@/domain/odds/estimate";

function idea(id: string, oddsAtCaptureAmerican: number | null): CapturedIdea {
  return {
    id,
    rawText: id,
    detailsStatus: "structured",
    sport: null,
    league: "NFL",
    slateDate: null,
    playerId: null,
    playerName: id,
    team: null,
    opponent: null,
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: null,
    selection: "Over",
    lineAtCapture: 60.5,
    oddsAtCaptureAmerican,
    sportsbookAtCapture: "DraftKings",
    confidence: "unrated",
    note: "",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    archivedAt: null,
  };
}

function live(ideaId: string, currentOddsAmerican: number): LiveContext {
  return {
    ideaId,
    sportsbook: "DraftKings",
    eventId: "evt-1",
    currentLine: 60.5,
    currentOddsAmerican,
    marketAvailable: true,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: "2026-10-31T00:00:00.000Z",
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: null,
    oddsSource: null,
    playerStatusFetchedAt: null,
    playerStatusSource: null,
  };
}

describe("resolveSlipLegs", () => {
  it("keeps every stored leg in order, and a deleted idea as a missing leg with its id", () => {
    const legs = resolveSlipLegs(["a", "gone", "b"], ideaLookup([idea("b", -110), idea("a", -110)]));
    expect(legs.map((leg) => [leg.kind, leg.ideaId])).toEqual([
      ["present", "a"],
      ["missing", "gone"],
      ["present", "b"],
    ]);
    expect(presentIdeas(legs).map((i) => i.id)).toEqual(["a", "b"]);
    expect(missingLegIds(legs)).toEqual(["gone"]);
  });

  it("never fills a missing leg in with a made-up idea", () => {
    const [leg] = resolveSlipLegs(["gone"], ideaLookup([]));
    expect(leg).toStrictEqual({ kind: "missing", ideaId: "gone" });
  });
});

describe("calculateSlipEstimate", () => {
  const book = "DraftKings";

  it("prices a slip whose legs all exist, like the combined estimate", () => {
    const legs = resolveSlipLegs(["a", "b"], ideaLookup([idea("a", 100), idea("b", 100)]));
    const estimate = calculateSlipEstimate(legs, book, () => undefined);
    expect(estimate).toMatchObject({ ok: true, americanOdds: 300, missingLegIds: [] });
  });

  it("a deleted leg fails the whole slip's estimate, even with a cached live price for it", () => {
    const orphan = live("gone", 200);
    const legs = resolveSlipLegs(["a", "gone"], ideaLookup([idea("a", 100)]));
    const estimate = calculateSlipEstimate(legs, book, (id) => (id === "gone" ? orphan : undefined));
    expect(estimate).toMatchObject({ ok: false, reason: "deleted_legs", missingLegIds: ["gone"], unavailableLegIds: [] });
    // Only present legs are resolved; the deleted one gets no price of any kind.
    expect(estimate.legSources.map((leg) => leg.ideaId)).toEqual(["a"]);
  });

  it("counts deleted legs apart from present legs with no price", () => {
    const legs = resolveSlipLegs(["a", "gone", "b"], ideaLookup([idea("a", null), idea("b", 100)]));
    const estimate = calculateSlipEstimate(legs, book, () => undefined);
    expect(estimate).toMatchObject({ ok: false, reason: "deleted_legs", missingLegIds: ["gone"], unavailableLegIds: ["a"] });
    expect(unpricedLegIds(estimate)).toEqual(["a"]);
  });

  it("a slip whose only legs are deleted is reported as deleted legs, not as empty", () => {
    const estimate = calculateSlipEstimate(resolveSlipLegs(["gone"], ideaLookup([])), book, () => undefined);
    expect(estimate).toMatchObject({ ok: false, reason: "deleted_legs", missingLegIds: ["gone"] });
  });

  it("an empty slip has no legs", () => {
    expect(calculateSlipEstimate([], book, () => undefined)).toMatchObject({ ok: false, reason: "no_legs", missingLegIds: [] });
  });

  it("unpricedLegIds counts only legs with no price: a live or capture price is a price", () => {
    const legs = resolveSlipLegs(["live", "capture", "none"], ideaLookup([idea("live", null), idea("capture", -110), idea("none", null)]));
    const estimate = calculateSlipEstimate(legs, book, (id) => (id === "live" ? live("live", 120) : undefined));
    expect(unpricedLegIds(estimate)).toEqual(["none"]);
  });
});
