import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { finalizeCandidate } from "../finalizeService";
import { addLegToCandidate, createCandidate } from "@/domain/candidates/candidateService";
import { candidateRevision } from "@/domain/candidates/candidateState";
import { captureStructuredIdea } from "@/domain/ideas/ideaService";
import { americanToDecimal, decimalToAmerican, roundAmerican } from "@/domain/odds/conversion";
import { calculateCombinedEstimate, calculatePayoutCents, legPriceInputs } from "@/domain/odds/estimate";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { getAllIdeas } from "@/storage/indexeddb/repositories/ideasRepository";
import { getAllLiveContext, liveContextKey, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

// INV-12: one price path. The builder's estimate, finalize's saved estimate and
// each saved leg's price all come from the same resolution of the same inputs,
// so a saved leg and the saved estimate can't disagree about a leg's price, and
// every saved leg says where its price came from.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

const FETCHED = "2026-09-26T12:00:00.000Z";

function live(ideaId: string, overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId,
    sportsbook: "DraftKings",
    eventId: "evt-1",
    currentLine: 64.5,
    currentOddsAmerican: -120,
    marketAvailable: true,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: FETCHED,
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: FETCHED,
    oddsSource: "odds-api",
    playerStatusFetchedAt: null,
    playerStatusSource: null,
    ...overrides,
  };
}

async function leg(label: string, capture: { odds: number | null; line: number | null; book: string | null }): Promise<CapturedIdea> {
  return captureStructuredIdea(label, {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerName: label,
    selection: "Over",
    lineAtCapture: capture.line,
    oddsAtCaptureAmerican: capture.odds,
    sportsbookAtCapture: capture.book,
  });
}

async function slipOf(ideas: CapturedIdea[]) {
  const slip = await createCandidate("Sunday", "DraftKings");
  for (const idea of ideas) await addLegToCandidate(slip.id, idea.id);
  const seen = await getCandidate(slip.id);
  return { slipId: slip.id, seen: candidateRevision(seen!) };
}

/** The builder's estimate, computed exactly as app/builder/page.tsx does from what DataProvider loads. */
async function builderEstimate(ideaIds: string[]) {
  const byKey: Record<string, LiveContext> = {};
  for (const row of await getAllLiveContext()) byKey[liveContextKey(row.ideaId, row.sportsbook)] = row;
  const ideas = await getAllIdeas();
  const legs = ideaIds.map((id) => ideas.find((idea) => idea.id === id) as CapturedIdea);
  return calculateCombinedEstimate(legPriceInputs(legs, "DraftKings", (id) => byKey[liveContextKey(id, "DraftKings")]));
}

/** The parlay price recomputed from nothing but the saved legs' prices. */
function fromSavedLegs(record: FinalizedParlay): number | null {
  const prices = record.legSnapshots.map((l) => l.price?.oddsAmerican ?? null);
  if (prices.some((p) => p === null)) return null;
  return roundAmerican(decimalToAmerican(prices.reduce((d: number, p) => d * americanToDecimal(p as number), 1)));
}

describe("one price path (INV-12)", () => {
  it("each saved leg records its price and provenance: live at the slip's book, or capture with its book", async () => {
    const liveLeg = await leg("Live Leg", { odds: -110, line: 63.5, book: "DraftKings" });
    const otherBook = await leg("Other Book", { odds: 150, line: 1.5, book: "FanDuel" });
    const sameBook = await leg("Same Book", { odds: -105, line: 40.5, book: "draft kings" });
    await putLiveContext(live(liveLeg.id));
    const { slipId, seen } = await slipOf([liveLeg, otherBook, sameBook]);

    const record = await finalizeCandidate(slipId, seen);
    const [a, b, c] = record.legSnapshots;

    expect(a.price).toStrictEqual({ source: "current", oddsAmerican: -120, line: 64.5, book: "DraftKings", oddsFetchedAt: FETCHED });
    expect(b.price).toStrictEqual({ source: "capture", oddsAmerican: 150, line: 1.5, book: "FanDuel", bookMatch: "different" });
    expect(c.price).toStrictEqual({ source: "capture", oddsAmerican: -105, line: 40.5, book: "draft kings", bookMatch: "same" });
    // The live-at-the-slip's-book fields are set only for the live-priced leg.
    expect([a.oddsAtFinalizeAmerican, a.lineAtFinalize]).toEqual([-120, 64.5]);
    expect([b.oddsAtFinalizeAmerican, b.lineAtFinalize]).toEqual([null, null]);
    expect([c.oddsAtFinalizeAmerican, c.lineAtFinalize]).toEqual([null, null]);
  });

  it("the saved estimate is exactly the saved legs' prices combined, and equals the builder's estimate", async () => {
    const liveLeg = await leg("Live Leg", { odds: -110, line: 63.5, book: "DraftKings" });
    const captureLeg = await leg("Capture Leg", { odds: 150, line: 1.5, book: "FanDuel" });
    await putLiveContext(live(liveLeg.id));
    const { slipId, seen } = await slipOf([liveLeg, captureLeg]);

    const builder = await builderEstimate([liveLeg.id, captureLeg.id]);
    const record = await finalizeCandidate(slipId, seen);

    expect(builder.ok).toBe(true);
    expect(record.estimatedOddsAmerican).toBe(fromSavedLegs(record));
    expect(record.estimatedOddsAmerican).toBe(builder.ok ? builder.americanOdds : "builder not ok");
    expect(record.estimatedPayoutCents).toBe(builder.ok ? calculatePayoutCents(record.stakeCents, builder.decimalOdds) : "builder not ok");
    // And per leg, the builder's resolution is the one that was saved.
    expect(record.legSnapshots.map((l) => [l.price?.source, l.price?.oddsAmerican])).toEqual(
      builder.legSources.map((l) => [l.source, l.oddsAmerican]),
    );
  });

  it("a market the slip's book no longer offers is saved as unavailable, with no price and no estimate", async () => {
    const pulled = await leg("Pulled", { odds: -110, line: 63.5, book: "DraftKings" });
    const fine = await leg("Fine", { odds: 120, line: 2.5, book: "DraftKings" });
    await putLiveContext(live(pulled.id, { marketAvailable: false, currentOddsAmerican: -130, currentLine: 65.5 }));
    const { slipId, seen } = await slipOf([pulled, fine]);

    const builder = await builderEstimate([pulled.id, fine.id]);
    const record = await finalizeCandidate(slipId, seen);

    // Neither the last-known live price nor the capture price stands in for it.
    expect(record.legSnapshots[0].price).toStrictEqual({
      source: "unavailable",
      oddsAmerican: null,
      line: null,
      book: null,
      unavailableReason: "market_not_offered",
    });
    expect([record.legSnapshots[0].oddsAtFinalizeAmerican, record.legSnapshots[0].lineAtFinalize]).toEqual([null, null]);
    expect(record.legSnapshots[1].price).toMatchObject({ source: "capture", oddsAmerican: 120 });
    expect(record.estimatedOddsAmerican).toBeNull();
    expect(record.estimatedPayoutCents).toBeNull();
    expect(builder.ok).toBe(false);
  });

  it("a leg with no live and no capture price is saved as unavailable (no reason)", async () => {
    const bare = await leg("Bare", { odds: null, line: null, book: null });
    const { slipId, seen } = await slipOf([bare]);

    const record = await finalizeCandidate(slipId, seen);
    expect(record.legSnapshots[0].price).toStrictEqual({ source: "unavailable", oddsAmerican: null, line: null, book: null });
    expect(record.estimatedOddsAmerican).toBeNull();
  });
});
