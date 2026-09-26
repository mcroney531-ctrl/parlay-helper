import { describe, expect, it } from "vitest";
import { buildChangeRadar } from "../changeRadar";
import type { CapturedIdea, LiveContext } from "@/domain/types";

function makeIdea(overrides: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id: "idea-1",
    rawText: "Puka O80.5",
    detailsStatus: "structured",
    sport: "football",
    league: "NFL",
    slateDate: "2026-09-21",
    playerId: null,
    playerName: "Puka Nacua",
    team: "LAR",
    opponent: "SF",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: "Receiving Yards",
    selection: "over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: -110,
    sportsbookAtCapture: "FanDuel",
    confidence: "core",
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function makeLiveContext(overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId: "idea-1",
    sportsbook: "FanDuel",
    eventId: "evt-1",
    currentLine: 63.5,
    currentOddsAmerican: -110,
    marketAvailable: true,
    playerStatus: "Active",
    depthChartPosition: null,
    gameStatus: "Scheduled",
    scheduledStart: null,
    fetchedAt: new Date().toISOString(),
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: new Date().toISOString(),
    oddsSource: "odds-api",
    playerStatusFetchedAt: null,
    playerStatusSource: null,
    ...overrides,
  };
}

describe("buildChangeRadar", () => {
  it("reports not_found when no live context has been fetched", () => {
    const entries = buildChangeRadar(makeIdea(), undefined);
    expect(entries).toEqual([{ kind: "not_found", text: "No current data fetched yet for this leg." }]);
  });

  it("reports line and odds changes since capture", () => {
    const entries = buildChangeRadar(
      makeIdea(),
      makeLiveContext({ currentLine: 67.5, currentOddsAmerican: -120 }),
    );
    expect(entries.some((e) => e.kind === "line_change" && e.text.includes("67.5"))).toBe(true);
  });

  it("reports player status changes", () => {
    const entries = buildChangeRadar(makeIdea(), makeLiveContext({ playerStatus: "Questionable" }));
    expect(entries.some((e) => e.text.includes("Questionable"))).toBe(true);
  });

  it("reports when nothing changed", () => {
    const entries = buildChangeRadar(makeIdea(), makeLiveContext());
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("ok");
  });

  it("formats line-less selections (e.g. anytime TD) without a stray placeholder", () => {
    const entries = buildChangeRadar(
      makeIdea({ selection: "yes", lineAtCapture: null, oddsAtCaptureAmerican: 140 }),
      makeLiveContext({ currentLine: null, currentOddsAmerican: 125 }),
    );
    const changed = entries.find((e) => e.kind === "odds_change");
    expect(changed?.text).toBe("Captured: Yes (+140) · Now: Yes (+125)");
    expect(changed?.text).not.toContain("?");
  });

  it("never recommends a bet in its text", () => {
    const entries = buildChangeRadar(makeIdea(), makeLiveContext({ currentOddsAmerican: -200 }));
    for (const entry of entries) {
      expect(entry.text.toLowerCase()).not.toMatch(/good bet|bad bet|recommend|safe|sharp/);
    }
  });
});

describe("buildChangeRadar: odds age and legs that can't be priced", () => {
  const texts = (idea: CapturedIdea, live: LiveContext | undefined, blocked?: boolean) =>
    buildChangeRadar(idea, live, blocked).map((entry) => entry.text);

  it("a stored price with no fetch time has an unknown age, and a refresh is suggested when one can help", () => {
    const entries = buildChangeRadar(makeIdea(), makeLiveContext({ oddsFetchedAt: null }));
    expect(entries).toContainEqual({ kind: "stale", text: "Odds age unknown — refresh to update." });
    expect(texts(makeIdea(), makeLiveContext({ oddsFetchedAt: null }))).not.toContain("No odds fetched yet for this leg.");
  });

  it("the same price on a leg that can't be priced doesn't suggest a refresh", () => {
    const result = texts(makeIdea(), makeLiveContext({ oddsFetchedAt: null }), true);
    expect(result).toContain("Odds age unknown.");
    expect(result.join(" ")).not.toMatch(/refresh/i);
  });

  it("no price and no fetch time (a Sleeper-only row) still reads 'No odds fetched yet'", () => {
    expect(texts(makeIdea(), makeLiveContext({ oddsFetchedAt: null, currentOddsAmerican: null, currentLine: null }))).toContain(
      "No odds fetched yet for this leg.",
    );
  });

  it("a leg that can't be priced gets no 'not fetched yet' lines, because a refresh wouldn't fix them", () => {
    expect(buildChangeRadar(makeIdea({ eventId: null }), undefined, true)).toEqual([]);
    expect(texts(makeIdea(), makeLiveContext({ oddsFetchedAt: null, currentOddsAmerican: null, currentLine: null }), true)).not.toContain(
      "No odds fetched yet for this leg.",
    );
  });

  it("a refreshable leg that was never fetched is unchanged", () => {
    expect(buildChangeRadar(makeIdea(), undefined, false)).toEqual([
      { kind: "not_found", text: "No current data fetched yet for this leg." },
    ]);
  });
});
