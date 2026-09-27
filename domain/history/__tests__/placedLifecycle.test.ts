import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CandidateParlay, FinalizedParlay } from "@/domain/types";
import { finalizeCandidate, listFinalizedParlays } from "../finalizeService";
import { placedSlipFor } from "../placedSlip";
import {
  addLegToCandidate,
  cloneCandidate,
  createCandidate,
  deleteCandidate,
  listCandidates,
  setCandidateStake,
} from "@/domain/candidates/candidateService";
import { NO_CURRENT_SLIP, noCurrentSlipBecausePlaced, resolveActiveCandidateId } from "@/domain/candidates/activeCandidate";
import { candidateRevision } from "@/domain/candidates/candidateState";
import { captureStructuredIdea } from "@/domain/ideas/ideaService";
import { refreshCandidateContext } from "@/domain/odds/refreshService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { putFinalizedParlay } from "@/storage/indexeddb/repositories/finalizedRepository";
import { getAllLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";

// Chunk 5: the placed-slip lifecycle, end to end through the services the
// screens call. After Mark Placed the placed slip can't stay the current slip
// and nothing is chosen for the user; the placed slip is reached from its
// History record (clone, delete); refreshes never touch a History record.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});
afterEach(() => vi.unstubAllGlobals());

async function puka() {
  return captureStructuredIdea("Puka o63.5", {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerName: "Puka Nacua",
    selection: "Over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: -110,
  });
}

async function slipWithLeg(name: string, ideaId: string): Promise<CandidateParlay> {
  const slip = await createCandidate(name, "FanDuel");
  await addLegToCandidate(slip.id, ideaId);
  return (await getCandidate(slip.id)) as CandidateParlay;
}

async function place(slip: CandidateParlay): Promise<FinalizedParlay> {
  return finalizeCandidate(slip.id, candidateRevision(slip));
}

describe("after Mark Placed: no current slip until the user picks one", () => {
  it("the placed slip isn't current, and no other draft is chosen silently; picking one makes it current", async () => {
    const leg = await puka();
    const other = await slipWithLeg("Other draft", leg.id);
    const placing = await slipWithLeg("Sunday Core", leg.id);
    await place(placing);
    // What FinalizeSection stores after a successful placement.
    const pointer = NO_CURRENT_SLIP;

    const candidates = await listCandidates();
    expect(resolveActiveCandidateId(candidates, pointer)).toBeNull();
    expect(noCurrentSlipBecausePlaced(candidates, pointer)).toBe(true);
    expect(resolveActiveCandidateId(candidates, other.id)).toBe(other.id);
  });

  it("a pointer left on the placed slip (placed in another tab) also resolves to no slip, flagged as placed", async () => {
    const leg = await puka();
    await slipWithLeg("Other draft", leg.id);
    const placing = await slipWithLeg("Sunday Core", leg.id);
    await place(placing);

    const candidates = await listCandidates();
    expect(resolveActiveCandidateId(candidates, placing.id)).toBeNull();
    expect(noCurrentSlipBecausePlaced(candidates, placing.id)).toBe(true);
  });
});

describe("a placed slip is reached from its History record", () => {
  it("placedSlipFor finds the placed slip of a v3 record", async () => {
    const slip = await slipWithLeg("Sunday Core", (await puka()).id);
    const record = await place(slip);

    expect(placedSlipFor(record, await listCandidates())).toMatchObject({ id: slip.id, status: "placed" });
  });

  it("Clone to new slip: a new current draft with the same legs, editable and placeable; the record is unchanged", async () => {
    const leg = await puka();
    const slip = await slipWithLeg("Sunday Core", leg.id);
    const record = await place(slip);

    const source = placedSlipFor(record, await listCandidates()) as CandidateParlay;
    const clone = await cloneCandidate(source.id);
    // What PlacedSlipActions stores: the clone becomes the current slip.
    expect(resolveActiveCandidateId(await listCandidates(), clone.id)).toBe(clone.id);
    expect(clone).toMatchObject({ status: "draft", ideaIds: [leg.id], sportsbook: "FanDuel" });

    await setCandidateStake(clone.id, 900);
    const cloneRecord = await finalizeCandidate(clone.id, candidateRevision((await getCandidate(clone.id)) as CandidateParlay));
    expect(cloneRecord).toMatchObject({ candidateId: clone.id, stakeCents: 900 });
    expect((await listFinalizedParlays()).find((r) => r.id === record.id)).toEqual(record);
  });

  it("Delete slip: the slip goes, the record stays exactly as it was and then has no slip actions (renders like legacy)", async () => {
    const slip = await slipWithLeg("Sunday Core", (await puka()).id);
    const record = await place(slip);

    // Another placed slip with the same name: the record must never pick it up.
    const namesake = await slipWithLeg("Sunday Core", (await puka()).id);
    const namesakeRecord = await place(namesake);

    await deleteCandidate(slip.id);
    expect(await getCandidate(slip.id)).toBeUndefined();
    expect((await listFinalizedParlays()).find((r) => r.id === record.id)).toEqual(record);
    expect(placedSlipFor(record, await listCandidates())).toBeNull();
    expect(placedSlipFor(namesakeRecord, await listCandidates())).toMatchObject({ id: namesake.id });
  });

  it("a legacy record (no candidateId) has no slip actions, even if a slip with the same name and legs exists", async () => {
    const leg = await puka();
    const lookalike = await slipWithLeg("Sunday Core", leg.id);
    const legacy: FinalizedParlay = {
      id: "legacy-1",
      candidateName: "Sunday Core",
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
      finalizedAt: "2026-09-01T00:00:00.000Z",
    };
    await putFinalizedParlay(legacy);

    // Never inferred from name/book/legs (INV-8).
    expect(placedSlipFor(legacy, await listCandidates())).toBeNull();
    expect(lookalike.status).toBe("draft");
  });
});

describe("refreshes never change a History record (INV-10)", () => {
  it("a refresh in flight while the slip is placed updates live context but not the record", async () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const waiting = new Promise<void>((resolve) => (reached = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.startsWith("/api/odds")) return new Response(JSON.stringify({ fetchedAt: "2026-09-26T12:00:00.000Z", players: {} }));
        reached();
        await opened;
        const body = JSON.parse(String(init?.body)) as { legs: { ideaId: string }[] };
        return new Response(
          JSON.stringify({
            results: [
              {
                eventId: "evt-1",
                ideaIds: body.legs.map((l) => l.ideaId),
                status: "ok",
                fetchedAt: "2026-09-26T12:00:00.000Z",
                warning: null,
                outcomes: [{ marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -150 }],
              },
            ],
          }),
        );
      }),
    );
    const leg = await puka();
    const slip = await slipWithLeg("Sunday Core", leg.id);

    const refreshing = refreshCandidateContext(slip, [leg]);
    await waiting;
    const record = await place(slip);
    open();
    await refreshing;

    // The refresh landed (same identity), but the record keeps the price it was placed at.
    expect((await getAllLiveContext()).find((row) => row.ideaId === leg.id)?.currentOddsAmerican).toBe(-150);
    expect(await listFinalizedParlays()).toEqual([record]);
    expect(record.legSnapshots[0].price).toMatchObject({ source: "capture", oddsAmerican: -110 });
  });
});
