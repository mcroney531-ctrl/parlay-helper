import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CandidateParlay, FinalizedParlay, LiveContext } from "@/domain/types";
import { finalizeCandidate, listFinalizedParlays } from "../finalizeService";
import {
  addLegToCandidate,
  cloneCandidate,
  createCandidate,
  deleteCandidate,
  removeLegFromCandidate,
  renameCandidate,
  setCandidatePromo,
  setCandidateSportsbook,
  setCandidateStake,
} from "@/domain/candidates/candidateService";
import { resolveActiveCandidateId } from "@/domain/candidates/activeCandidate";
import { candidateRevision } from "@/domain/candidates/candidateState";
import {
  AlreadyPlacedError,
  CandidateNotFoundError,
  CandidatePlacedError,
  StaleCandidateError,
} from "@/domain/candidates/errors";
import { captureStructuredIdea } from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import {
  getAllCandidates,
  getCandidate,
  putCandidate,
  updateCandidate,
} from "@/storage/indexeddb/repositories/candidatesRepository";
import { commitPlacement } from "@/storage/indexeddb/repositories/placementRepository";
import { putFinalizedParlay } from "@/storage/indexeddb/repositories/finalizedRepository";
import { putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

async function stored(id: string): Promise<CandidateParlay> {
  const candidate = await getCandidate(id);
  if (!candidate) throw new Error(`test setup: no candidate ${id}`);
  return candidate;
}

async function idea(label: string) {
  return captureStructuredIdea(label, {
    marketKey: "player_reception_yds",
    selection: "over",
    lineAtCapture: 80.5,
    oddsAtCaptureAmerican: -110,
    eventId: "evt-1",
  });
}

function liveContext(ideaId: string, oddsAmerican: number): LiveContext {
  const now = new Date().toISOString();
  return {
    ideaId,
    sportsbook: "FanDuel",
    eventId: "evt-1",
    currentLine: 82.5,
    currentOddsAmerican: oddsAmerican,
    marketAvailable: true,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: now,
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: now,
    oddsSource: "odds-api",
    playerStatusFetchedAt: null,
    playerStatusSource: null,
  };
}

/** A draft slip on FanDuel with one leg, as the user sees it. */
async function draftWithLeg(name = "Sunday Core") {
  const leg = await idea("Puka O80.5");
  const slip = await createCandidate(name, "FanDuel");
  await addLegToCandidate(slip.id, leg.id);
  return { slip: await stored(slip.id), leg };
}

/** A minimal finalized record, for driving commitPlacement directly. */
function stubRecord(candidateId: string, finalizedAt: string): FinalizedParlay {
  return {
    id: `record-${candidateId}`,
    candidateId,
    candidateName: "stub",
    sportsbook: "FanDuel",
    legSnapshots: [],
    stakeCents: 200,
    estimatedOddsAmerican: null,
    estimatedPayoutCents: null,
    actualSportsbookOddsAmerican: null,
    actualSportsbookPayoutCents: null,
    promoLabel: "",
    promoMaxStakeCents: null,
    sportsbookBetId: "",
    note: "",
    finalizedAt,
  };
}

async function place(id: string): Promise<FinalizedParlay> {
  return finalizeCandidate(id, candidateRevision(await stored(id)));
}

describe("placed-slip acceptance (B's repro, inverted)", () => {
  it("a placed slip stops being current, takes no legs, and can't be placed twice", async () => {
    const legA = await idea("Leg A");
    const legB = await idea("Leg B");
    const slip = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(slip.id, legA.id);
    const pointer = slip.id;
    const record = await place(slip.id);

    // (1) not current, with the stored pointer and on a fresh device with none
    // (where the placed slip is the most recently updated candidate).
    const all = await getAllCandidates();
    expect(resolveActiveCandidateId(all, pointer)).toBeNull();
    expect(resolveActiveCandidateId(all, null)).toBeNull();

    // (2) adding a leg rejects and the legs stay [A].
    await expect(addLegToCandidate(slip.id, legB.id)).rejects.toBeInstanceOf(CandidatePlacedError);
    expect((await stored(slip.id)).ideaIds).toEqual([legA.id]);

    // (3) a second placement rejects with AlreadyPlaced naming the first record;
    // History holds one record and leg A appears in it once.
    const second = finalizeCandidate(slip.id, candidateRevision(await stored(slip.id)), { note: "again" });
    await expect(second).rejects.toBeInstanceOf(AlreadyPlacedError);
    await expect(second).rejects.toMatchObject({ existingFinalizedId: record.id });
    const history = await listFinalizedParlays();
    expect(history).toHaveLength(1);
    expect(history[0].legSnapshots.map((l) => l.ideaId)).toEqual([legA.id]);
  });
});

describe("placement commits the record and the placed status together (INV-4, INV-5)", () => {
  it("links the record to the candidate and marks it placed at the record's finalizedAt", async () => {
    const { slip } = await draftWithLeg();
    const record = await place(slip.id);

    const after = await stored(slip.id);
    expect(record.candidateId).toBe(slip.id);
    expect(after).toMatchObject({ status: "placed", placedAt: record.finalizedAt, updatedAt: record.finalizedAt });
    expect(candidateRevision(after)).toBe(candidateRevision(slip) + 1);
    expect(await listFinalizedParlays()).toEqual([record]);
  });

  it("rejects an empty candidate id before writing anything", async () => {
    await draftWithLeg();
    await expect(finalizeCandidate("", 0)).rejects.toThrow(/candidate id/);
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("writes neither the record nor the placed status when the placement is refused inside the transaction", async () => {
    const { slip, leg } = await draftWithLeg();
    const { deleteIdeaPermanently } = await import("@/domain/ideas/ideaService");
    await deleteIdeaPermanently(leg.id);

    await expect(place(slip.id)).rejects.toThrow(/no longer exists/);
    expect(await stored(slip.id)).toEqual(slip);
    expect(await listFinalizedParlays()).toHaveLength(0);
  });
});

describe("the placement is the version the user saw (INV-6)", () => {
  it("rejects, writing nothing, when the slip was edited between view and commit", async () => {
    const { slip } = await draftWithLeg();
    const seen = candidateRevision(slip);
    await setCandidateStake(slip.id, 500);

    const attempt = finalizeCandidate(slip.id, seen);
    await expect(attempt).rejects.toBeInstanceOf(StaleCandidateError);
    await expect(attempt).rejects.toMatchObject({ seenRevision: seen, currentRevision: seen + 1 });
    expect((await stored(slip.id)).status).toBe("draft");
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("rejects each kind of edit, including legs, sportsbook, name and promo", async () => {
    const edits: [string, (id: string) => Promise<unknown>][] = [
      ["add a leg", async (id) => addLegToCandidate(id, (await idea("Leg B")).id)],
      ["remove a leg", async (id) => removeLegFromCandidate(id, (await stored(id)).ideaIds[0])],
      ["change the sportsbook", (id) => setCandidateSportsbook(id, "DraftKings")],
      ["rename", (id) => renameCandidate(id, "Renamed")],
      ["change the promo", (id) => setCandidatePromo(id, "Boost", 1000)],
    ];
    for (const [label, edit] of edits) {
      const { slip } = await draftWithLeg(label);
      await edit(slip.id);
      await expect(finalizeCandidate(slip.id, candidateRevision(slip)), label).rejects.toBeInstanceOf(StaleCandidateError);
    }
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("rejects, writing nothing, when the slip was deleted between view and commit", async () => {
    const { slip } = await draftWithLeg();
    await deleteCandidate(slip.id);

    await expect(finalizeCandidate(slip.id, candidateRevision(slip))).rejects.toBeInstanceOf(CandidateNotFoundError);
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("lets exactly one of two concurrent placements through; the other rejects with AlreadyPlaced", async () => {
    const { slip } = await draftWithLeg();
    const seen = candidateRevision(slip);

    const results = await Promise.allSettled([
      finalizeCandidate(slip.id, seen, { note: "first" }),
      finalizeCandidate(slip.id, seen, { note: "second" }),
    ]);

    const placed = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(placed).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const record = (placed[0] as PromiseFulfilledResult<FinalizedParlay>).value;
    const error = (refused[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(AlreadyPlacedError);
    expect(error.existingFinalizedId).toBe(record.id);
    expect(await listFinalizedParlays()).toEqual([record]);
  });

  it("an edit issued while the placing transaction is open waits for it, then bounces off the placed slip", async () => {
    const { slip } = await draftWithLeg();
    let editing: Promise<unknown> = Promise.resolve();
    const placedAt = new Date().toISOString();

    await commitPlacement(slip.id, (reads) => {
      // Issued from inside the placement: its transaction is queued behind this one.
      editing = setCandidateStake(slip.id, 900);
      const candidate = reads.candidate as CandidateParlay;
      return {
        candidate: { ...candidate, status: "placed", placedAt, updatedAt: placedAt, revision: candidateRevision(candidate) + 1 },
        finalized: stubRecord(slip.id, placedAt),
      };
    });

    await expect(editing).rejects.toBeInstanceOf(CandidatePlacedError);
    expect(await stored(slip.id)).toMatchObject({ status: "placed", stakeCents: slip.stakeCents });
  });

  it("a placement issued while an edit's transaction is open sees the edit and is refused as stale", async () => {
    const { slip } = await draftWithLeg();
    const seen = candidateRevision(slip);
    let placing: Promise<unknown> = Promise.resolve();

    await updateCandidate(slip.id, (existing) => {
      placing = finalizeCandidate(slip.id, seen);
      return { ...(existing as CandidateParlay), stakeCents: 900, revision: seen + 1 };
    });

    await expect(placing).rejects.toBeInstanceOf(StaleCandidateError);
    expect(await stored(slip.id)).toMatchObject({ status: "draft", stakeCents: 900 });
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("records the live-context price stored at commit, even if it changed after the user's view", async () => {
    const { slip, leg } = await draftWithLeg();
    await putLiveContext(liveContext(leg.id, -120));
    const seen = candidateRevision(await stored(slip.id));
    // A price refresh lands after the user looked; it doesn't touch the slip.
    await putLiveContext(liveContext(leg.id, +105));

    const record = await finalizeCandidate(slip.id, seen);
    expect(record.legSnapshots[0].oddsAtFinalizeAmerican).toBe(105);
  });
});

describe("placed at most once (INV-3)", () => {
  it("rejects a repeat placement with AlreadyPlaced carrying the existing record id, keeping the first record", async () => {
    const { slip } = await draftWithLeg();
    const first = await place(slip.id);
    const afterFirst = await stored(slip.id);

    const again = finalizeCandidate(slip.id, candidateRevision(afterFirst), { sportsbookBetId: "different" });
    await expect(again).rejects.toBeInstanceOf(AlreadyPlacedError);
    await expect(again).rejects.toMatchObject({ candidateId: slip.id, existingFinalizedId: first.id });
    expect(await listFinalizedParlays()).toEqual([first]);
    expect(await stored(slip.id)).toEqual(afterFirst);
  });

  it("the in-transaction status check refuses a placed slip on its own, with no record for the index to catch", async () => {
    const { slip } = await draftWithLeg();
    const placedWithoutRecord = { ...slip, status: "placed" as const, placedAt: slip.updatedAt };
    await putCandidate(placedWithoutRecord);

    const attempt = finalizeCandidate(slip.id, candidateRevision(slip));
    await expect(attempt).rejects.toBeInstanceOf(AlreadyPlacedError);
    await expect(attempt).rejects.toMatchObject({ existingFinalizedId: null });
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("the unique index is a second guard: a record already naming a still-draft slip aborts the whole placement", async () => {
    // Only reachable if the status check were missed; forced here by writing a
    // record for the slip directly, without placing it.
    const { slip } = await draftWithLeg();
    const stray = { ...(await place((await draftWithLeg("other")).slip.id)), id: "stray-record", candidateId: slip.id };
    await putFinalizedParlay(stray);

    const attempt = finalizeCandidate(slip.id, candidateRevision(slip));
    await expect(attempt).rejects.toBeInstanceOf(AlreadyPlacedError);
    await expect(attempt).rejects.toMatchObject({ existingFinalizedId: "stray-record" });
    // The candidate write came first in the transaction and was rolled back with it.
    expect(await stored(slip.id)).toEqual(slip);
    expect((await listFinalizedParlays()).filter((r) => r.candidateId === slip.id)).toEqual([stray]);
  });
});

describe("placed slips are frozen (INV-2)", () => {
  const mutators: [string, (id: string) => Promise<unknown>][] = [
    ["renameCandidate", (id) => renameCandidate(id, "Renamed")],
    ["setCandidateSportsbook", (id) => setCandidateSportsbook(id, "DraftKings")],
    ["setCandidateStake", (id) => setCandidateStake(id, 900)],
    ["setCandidatePromo", (id) => setCandidatePromo(id, "Boost", 1000)],
    ["addLegToCandidate", async (id) => addLegToCandidate(id, (await idea("Leg B")).id)],
    ["removeLegFromCandidate", async (id) => removeLegFromCandidate(id, (await stored(id)).ideaIds[0])],
  ];

  for (const [name, mutate] of mutators) {
    it(`${name} rejects on a placed slip and leaves it unchanged`, async () => {
      const { slip } = await draftWithLeg();
      await place(slip.id);
      const before = await stored(slip.id);

      await expect(mutate(slip.id)).rejects.toBeInstanceOf(CandidatePlacedError);
      expect(await stored(slip.id)).toEqual(before);
    });

    it(`${name} bumps the revision by one on a draft`, async () => {
      const { slip } = await draftWithLeg();
      await mutate(slip.id);
      expect(candidateRevision(await stored(slip.id))).toBe(candidateRevision(slip) + 1);
    });
  }

  it("rejects even a no-op edit on a placed slip (re-adding a leg it already has)", async () => {
    const { slip, leg } = await draftWithLeg();
    await place(slip.id);
    await expect(addLegToCandidate(slip.id, leg.id)).rejects.toBeInstanceOf(CandidatePlacedError);
  });

  it("a no-op edit on a draft writes nothing, so it can't make a pending placement stale", async () => {
    const { slip, leg } = await draftWithLeg();
    await setCandidateStake(slip.id, slip.stakeCents);
    await addLegToCandidate(slip.id, leg.id);
    await renameCandidate(slip.id, "   ");
    await setCandidatePromo(slip.id, slip.promoLabel, slip.promoMaxStakeCents);
    await setCandidateSportsbook(slip.id, slip.sportsbook);
    await removeLegFromCandidate(slip.id, "not-a-leg");
    expect(await stored(slip.id)).toEqual(slip);
    await expect(finalizeCandidate(slip.id, candidateRevision(slip))).resolves.toMatchObject({ candidateId: slip.id });
  });

  it("the edit functions report a missing slip with CandidateNotFoundError", async () => {
    await expect(setCandidateStake("no-such-slip", 100)).rejects.toBeInstanceOf(CandidateNotFoundError);
  });

  it("clone of a placed slip is a new draft; the placed source is unchanged (INV-11)", async () => {
    const { slip, leg } = await draftWithLeg();
    await place(slip.id);
    const before = await stored(slip.id);

    const clone = await cloneCandidate(slip.id);
    expect(clone).toMatchObject({ status: "draft", revision: 0, ideaIds: [leg.id] });
    expect(clone.id).not.toBe(slip.id);
    expect(await stored(slip.id)).toEqual(before);
    // The clone is a real draft: it can be edited and placed.
    await addLegToCandidate(clone.id, (await idea("Leg B")).id);
    await expect(place(clone.id)).resolves.toMatchObject({ candidateId: clone.id });
  });
});

describe("deleting a candidate never touches History (INV-15, INV-10)", () => {
  it("deletes a placed slip and keeps its record exactly as it was", async () => {
    const { slip } = await draftWithLeg();
    const record = await place(slip.id);

    await deleteCandidate(slip.id);
    expect(await getCandidate(slip.id)).toBeUndefined();
    expect(await listFinalizedParlays()).toEqual([record]);
  });

  it("deletes a draft slip without touching other slips' records", async () => {
    const placed = await draftWithLeg("placed");
    const record = await place(placed.slip.id);
    const { slip } = await draftWithLeg("draft");

    await deleteCandidate(slip.id);
    expect(await listFinalizedParlays()).toEqual([record]);
  });
});
