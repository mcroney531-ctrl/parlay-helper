import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CapturedIdea, LiveContext } from "@/domain/types";
import { finalizeCandidate } from "../finalizeService";
import { addLegToCandidate, createCandidate } from "@/domain/candidates/candidateService";
import { candidateRevision, isPlaced } from "@/domain/candidates/candidateState";
import { DeletedLegsError, UnpricedConsentError } from "@/domain/candidates/errors";
import { ideaLookup, resolveSlipLegs } from "@/domain/candidates/slipLegs";
import { captureStructuredIdea, deleteIdeaPermanently } from "@/domain/ideas/ideaService";
import { calculateSlipEstimate, unpricedLegIds } from "@/domain/odds/estimate";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { getAllFinalizedParlays } from "@/storage/indexeddb/repositories/finalizedRepository";
import { getAllIdeas } from "@/storage/indexeddb/repositories/ideasRepository";
import { getAllLiveContext, liveContextKey, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

// INV-17: confirming Mark Placed is consent to place exactly the unpriced legs
// the confirm showed. A leg that loses its price between the confirm and the
// commit makes placement reject with nothing written, so the user is asked
// again; a leg that gains a price in between is fine. Deleted legs are never
// covered by consent.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

const BOOK = "DraftKings";
const FETCHED = "2026-10-31T12:00:00.000Z";

function live(ideaId: string, overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId,
    sportsbook: BOOK,
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

/** A leg with no capture price, so its only possible price is a live one. */
async function liveOnlyLeg(label: string): Promise<CapturedIdea> {
  return captureStructuredIdea(label, {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerName: label,
    selection: "Over",
    lineAtCapture: 64.5, // the live fixture's line: a live price counts only at the leg's own line
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
  });
}

async function slipOf(ideas: CapturedIdea[]) {
  const slip = await createCandidate("Sunday", BOOK);
  for (const idea of ideas) await addLegToCandidate(slip.id, idea.id);
  return slip.id;
}

/**
 * What the confirm step freezes when it is shown: the revision on screen and
 * the unpriced legs of the estimate built from what is stored, the same way
 * the Slip screen builds it.
 */
async function confirmShown(slipId: string) {
  const slip = await getCandidate(slipId);
  const byKey: Record<string, LiveContext> = {};
  for (const row of await getAllLiveContext()) byKey[liveContextKey(row.ideaId, row.sportsbook)] = row;
  const legs = resolveSlipLegs(slip!.ideaIds, ideaLookup(await getAllIdeas()));
  const estimate = calculateSlipEstimate(legs, BOOK, (id) => byKey[liveContextKey(id, BOOK)]);
  return { seen: candidateRevision(slip!), acknowledgedUnpricedLegIds: unpricedLegIds(estimate) };
}

async function expectNothingWritten(slipId: string, seen: number) {
  expect(await getAllFinalizedParlays()).toEqual([]);
  const slip = await getCandidate(slipId);
  expect(isPlaced(slip!)).toBe(false);
  expect(candidateRevision(slip!)).toBe(seen);
}

describe("unpriced-placement consent (INV-17)", () => {
  it("a price that disappears between the confirm and the commit rejects with nothing written", async () => {
    const a = await liveOnlyLeg("A");
    const b = await liveOnlyLeg("B");
    await putLiveContext(live(a.id));
    await putLiveContext(live(b.id));
    const slipId = await slipOf([a, b]);

    const confirm = await confirmShown(slipId);
    expect(confirm.acknowledgedUnpricedLegIds).toEqual([]);

    // A refresh lands while the confirm is open: the book no longer offers A's market.
    await putLiveContext(live(a.id, { marketAvailable: false }));

    const placing = finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: confirm.acknowledgedUnpricedLegIds });
    await expect(placing).rejects.toBeInstanceOf(UnpricedConsentError);
    await expect(placing).rejects.toMatchObject({ unpricedLegIds: [a.id], unacknowledgedLegIds: [a.id] });
    await expectNothingWritten(slipId, confirm.seen);
  });

  it("the confirm shown again with the current set places the slip", async () => {
    const a = await liveOnlyLeg("A");
    const b = await liveOnlyLeg("B");
    await putLiveContext(live(a.id, { marketAvailable: false }));
    await putLiveContext(live(b.id));
    const slipId = await slipOf([a, b]);

    const confirm = await confirmShown(slipId);
    expect(confirm.acknowledgedUnpricedLegIds).toEqual([a.id]);

    const record = await finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: confirm.acknowledgedUnpricedLegIds });
    expect(record.legSnapshots.map((leg) => leg.price?.source)).toEqual(["unavailable", "current"]);
    expect(record.estimatedOddsAmerican).toBeNull();
  });

  it("placing with no consent at all rejects an unpriced slip", async () => {
    const a = await liveOnlyLeg("A");
    const slipId = await slipOf([a]);
    const { seen } = await confirmShown(slipId);

    await expect(finalizeCandidate(slipId, seen)).rejects.toBeInstanceOf(UnpricedConsentError);
    await expectNothingWritten(slipId, seen);
  });

  it("the same number of unpriced legs, but a different leg, rejects", async () => {
    const a = await liveOnlyLeg("A");
    const b = await liveOnlyLeg("B");
    await putLiveContext(live(a.id, { marketAvailable: false }));
    await putLiveContext(live(b.id));
    const slipId = await slipOf([a, b]);
    const confirm = await confirmShown(slipId);
    expect(confirm.acknowledgedUnpricedLegIds).toEqual([a.id]);

    // A gets a price back and B loses its: still one unpriced leg, but not the one agreed to.
    await putLiveContext(live(a.id));
    await putLiveContext(live(b.id, { marketAvailable: false }));

    const placing = finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: confirm.acknowledgedUnpricedLegIds });
    await expect(placing).rejects.toMatchObject({ name: "UnpricedConsentError", unacknowledgedLegIds: [b.id] });
    await expectNothingWritten(slipId, confirm.seen);
  });

  it("a leg that gains a price after the confirm is fine, and is saved at its new price", async () => {
    const a = await liveOnlyLeg("A");
    const b = await liveOnlyLeg("B");
    await putLiveContext(live(b.id));
    const slipId = await slipOf([a, b]);
    const confirm = await confirmShown(slipId);
    expect(confirm.acknowledgedUnpricedLegIds).toEqual([a.id]);

    await putLiveContext(live(a.id, { currentOddsAmerican: 150 }));

    const record = await finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: confirm.acknowledgedUnpricedLegIds });
    expect(record.legSnapshots[0].price).toMatchObject({ source: "current", oddsAmerican: 150 });
    expect(record.estimatedOddsAmerican).not.toBeNull();
  });

  it("a capture price counts as a price: nothing to consent to", async () => {
    const captured = await captureStructuredIdea("Captured", {
      league: "NFL",
      eventId: "evt-1",
      marketKey: "player_reception_yds",
      playerName: "Captured",
      selection: "Over",
      lineAtCapture: 63.5,
      oddsAtCaptureAmerican: -110,
      sportsbookAtCapture: BOOK,
    });
    const slipId = await slipOf([captured]);
    const confirm = await confirmShown(slipId);
    expect(confirm.acknowledgedUnpricedLegIds).toEqual([]);

    const record = await finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: [] });
    expect(record.legSnapshots[0].price).toMatchObject({ source: "capture", oddsAmerican: -110 });
  });

  it("a deleted leg rejects even when consented to, and is checked before prices", async () => {
    const a = await liveOnlyLeg("A");
    const b = await liveOnlyLeg("B");
    await putLiveContext(live(b.id));
    const slipId = await slipOf([a, b]);
    const confirm = await confirmShown(slipId);

    // Deleted after the confirm; its id is even passed as consented. A cached
    // live price for it remains and must not price it either.
    await putLiveContext(live(a.id));
    await deleteIdeaPermanently(a.id);

    const placing = finalizeCandidate(slipId, confirm.seen, { acknowledgedUnpricedLegIds: [a.id, b.id] });
    await expect(placing).rejects.toBeInstanceOf(DeletedLegsError);
    await expect(placing).rejects.toMatchObject({ missingLegIds: [a.id] });
    await expectNothingWritten(slipId, confirm.seen);
  });
});
