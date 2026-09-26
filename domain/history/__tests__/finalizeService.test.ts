import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { finalizeCandidate, listFinalizedParlays } from "../finalizeService";
import { createCandidate, addLegToCandidate } from "@/domain/candidates/candidateService";
import { captureStructuredIdea } from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import { putFinalizedParlay } from "@/storage/indexeddb/repositories/finalizedRepository";
import { sleeperHeadshotUrl } from "@/components/sleeperImage";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

describe("finalizeCandidate", () => {
  it("freezes an immutable snapshot with capture and current values", async () => {
    const idea = await captureStructuredIdea("Puka O80.5 receiving yards", {
      marketKey: "player_reception_yds",
      marketLabel: "Receiving Yards",
      selection: "over",
      lineAtCapture: 80.5,
      oddsAtCaptureAmerican: -110,
      sportsbookAtCapture: "FanDuel",
      eventId: "evt-1",
    });
    await putLiveContext({
      ideaId: idea.id,
      sportsbook: "FanDuel",
      eventId: "evt-1",
      currentLine: 82.5,
      currentOddsAmerican: -120,
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
    });

    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, idea.id);

    const finalized = await finalizeCandidate(candidate.id, {
      sportsbookBetId: "abc123",
    });

    expect(finalized.legSnapshots).toHaveLength(1);
    expect(finalized.legSnapshots[0].lineAtCapture).toBe(80.5);
    expect(finalized.legSnapshots[0].lineAtFinalize).toBe(82.5);
    expect(finalized.estimatedOddsAmerican).not.toBeNull();
    expect(finalized.estimatedPayoutCents).not.toBeNull();
    expect(finalized.sportsbookBetId).toBe("abc123");

    const all = await listFinalizedParlays();
    expect(all).toHaveLength(1);
  });

  it("refuses to finalize a candidate with no legs", async () => {
    const candidate = await createCandidate("Empty", "FanDuel");
    await expect(finalizeCandidate(candidate.id)).rejects.toThrow();
  });

  it("is unaffected by later edits to the source idea", async () => {
    const idea = await captureStructuredIdea("Puka O80.5", {
      marketKey: "player_reception_yds",
      selection: "over",
      lineAtCapture: 80.5,
      oddsAtCaptureAmerican: -110,
    });
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, idea.id);
    const finalized = await finalizeCandidate(candidate.id);

    const { updateIdeaDetails } = await import("@/domain/ideas/ideaService");
    await updateIdeaDetails(idea.id, { lineAtCapture: 999 });

    const stored = (await listFinalizedParlays()).find((f) => f.id === finalized.id);
    expect(stored?.legSnapshots[0].lineAtCapture).toBe(80.5);
  });

  it("refuses to finalize rather than silently dropping a leg whose idea was deleted", async () => {
    const idea = await captureStructuredIdea("Puka O80.5", {
      marketKey: "player_reception_yds",
      selection: "over",
    });
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, idea.id);

    const { deleteIdeaPermanently } = await import("@/domain/ideas/ideaService");
    await deleteIdeaPermanently(idea.id);

    await expect(finalizeCandidate(candidate.id)).rejects.toThrow(/no longer exists/);
    expect(await listFinalizedParlays()).toHaveLength(0);
  });

  it("rejects an invalid actual American odds value instead of persisting NaN", async () => {
    const idea = await captureStructuredIdea("Puka O80.5", {
      marketKey: "player_reception_yds",
      selection: "over",
      oddsAtCaptureAmerican: -110,
    });
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, idea.id);

    await expect(
      finalizeCandidate(candidate.id, { actualSportsbookOddsAmerican: Number("not a number") }),
    ).rejects.toThrow();
    await expect(finalizeCandidate(candidate.id, { actualSportsbookOddsAmerican: 0 })).rejects.toThrow();
    await expect(finalizeCandidate(candidate.id, { actualSportsbookOddsAmerican: 50 })).rejects.toThrow();
  });

  it("only reads live context scoped to the candidate's own sportsbook", async () => {
    const idea = await captureStructuredIdea("Puka O80.5", {
      marketKey: "player_reception_yds",
      selection: "over",
      oddsAtCaptureAmerican: -110,
      eventId: "evt-1",
    });
    const fanduel = await createCandidate("FD Core", "FanDuel");
    await addLegToCandidate(fanduel.id, idea.id);

    await putLiveContext({
      ideaId: idea.id,
      sportsbook: "DraftKings",
      eventId: "evt-1",
      currentLine: 90,
      currentOddsAmerican: -500,
      marketAvailable: true,
      playerStatus: null,
      depthChartPosition: null,
      gameStatus: null,
      scheduledStart: null,
      fetchedAt: new Date().toISOString(),
      source: "odds-api",
      warnings: [],
      oddsFetchedAt: new Date().toISOString(),
      oddsSource: "odds-api",
      playerStatusFetchedAt: null,
      playerStatusSource: null,
    });

    const finalized = await finalizeCandidate(fanduel.id);
    // The FanDuel candidate must never pick up DraftKings' cached price.
    expect(finalized.legSnapshots[0].lineAtFinalize).toBeNull();
    expect(finalized.legSnapshots[0].oddsAtFinalizeAmerican).toBeNull();
  });

  it("carries the idea's playerId into the snapshot, frozen at finalize time", async () => {
    const idea = await captureStructuredIdea("Mahomes O1.5 pass TDs", {
      marketKey: "player_pass_tds",
      selection: "over",
      playerId: "4046",
    });
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, idea.id);
    const finalized = await finalizeCandidate(candidate.id);

    expect(finalized.legSnapshots[0].playerId).toBe("4046");

    // Re-matching the idea to a different player afterward must not reach
    // back into the already-frozen snapshot (same immutability guarantee
    // as the other capture-time fields, verified above for lineAtCapture).
    const { updateIdeaDetails } = await import("@/domain/ideas/ideaService");
    await updateIdeaDetails(idea.id, { playerId: "9999" });
    const stored = (await listFinalizedParlays()).find((f) => f.id === finalized.id);
    expect(stored?.legSnapshots[0].playerId).toBe("4046");
  });

  it("reads a legacy finalized record written before playerId existed without throwing", async () => {
    // Simulates a record persisted by an older build of this app, before
    // FinalizedLegSnapshot gained the playerId field — no `playerId` key
    // in the stored object at all, not even `null`.
    const legacyRecord = {
      id: "legacy-1",
      candidateName: "Old Slip",
      sportsbook: "FanDuel",
      legSnapshots: [
        {
          ideaId: "old-idea-1",
          playerName: "Legacy Player",
          team: "LAR",
          opponent: "SF",
          eventId: "evt-old",
          marketLabel: "Receiving Yards",
          selection: "over",
          lineAtCapture: 60.5,
          oddsAtCaptureAmerican: -110,
          lineAtFinalize: null,
          oddsAtFinalizeAmerican: null,
          sportsbookAtCapture: "FanDuel",
          // playerId intentionally absent
        },
      ],
      stakeCents: 200,
      estimatedOddsAmerican: 150,
      estimatedPayoutCents: 500,
      actualSportsbookOddsAmerican: null,
      actualSportsbookPayoutCents: null,
      promoLabel: "",
      promoMaxStakeCents: null,
      sportsbookBetId: "",
      note: "",
      finalizedAt: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately shaped like pre-migration stored data, not today's type.
    } as any;
    await putFinalizedParlay(legacyRecord);

    const all = await listFinalizedParlays();
    expect(all).toHaveLength(1);
    expect(all[0].legSnapshots[0].playerId).toBeUndefined();
    // The rendering path (PlayerAvatar via sleeperHeadshotUrl) must treat
    // that missing field the same as a known-absent one: no image, no crash.
    expect(sleeperHeadshotUrl(all[0].legSnapshots[0].playerId)).toBeNull();
  });
});
