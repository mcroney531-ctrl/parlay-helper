import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { refreshCandidateContext } from "../refreshService";
import { captureStructuredIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getAllLiveContext, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";

/**
 * KNOWN GAP, tracked as the Phase 2 item "IN-FLIGHT REFRESH RACE" in
 * project_state: a refresh that started before an identity edit still holds
 * the old idea, so once updateIdeaDetails has cleared the cache its writes put
 * the OLD proposition's data back under the edited idea. These are the
 * acceptance tests for that fix, written as it.fails so they document the gap
 * now and turn red (asking to become plain `it`) the moment the Phase 2 guard
 * lands. The odds and player-status paths are gated and asserted separately.
 */

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});
afterEach(() => vi.unstubAllGlobals());

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  let reached!: () => void;
  const waiting = new Promise<void>((resolve) => (reached = resolve));
  return { open, opened, reached, waiting };
}

function slip(ideaIds: string[]): CandidateParlay {
  return { id: "slip-1", name: "Sunday", sportsbook: "FanDuel", ideaIds } as unknown as CandidateParlay;
}

function cachedRow(ideaId: string, overrides: Partial<LiveContext> = {}): LiveContext {
  return {
    ideaId,
    sportsbook: "FanDuel",
    eventId: "evt-1",
    currentLine: 63.5,
    currentOddsAmerican: -110,
    marketAvailable: true,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: "2026-09-20T12:00:00.000Z",
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: "2026-09-20T12:00:00.000Z",
    oddsSource: "odds-api",
    playerStatusFetchedAt: null,
    playerStatusSource: null,
    ...overrides,
  };
}

async function pukaIdea(overrides: Partial<CapturedIdea> = {}): Promise<CapturedIdea> {
  return captureStructuredIdea("Puka o63.5", {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerId: "p-puka",
    playerName: "Puka Nacua",
    selection: "Over",
    lineAtCapture: 63.5,
    ...overrides,
  });
}

// Set inside the it.fails bodies, checked by a plain test below, so a broken
// setup can't make an it.fails pass for the wrong reason.
const reachedEmptyCacheMidEdit = { odds: false, playerStatus: false };

describe("in-flight refresh vs an identity edit (Phase 2 acceptance tests)", () => {
  it.fails("odds path: a refresh started before the edit must not write the old proposition's price back", async () => {
    const odds = gate();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.startsWith("/api/odds")) return new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), players: {} }));
        odds.reached();
        await odds.opened;
        const body = JSON.parse(String(init?.body)) as { legs: { ideaId: string }[] };
        return new Response(
          JSON.stringify({
            results: [
              {
                eventId: "evt-1",
                ideaIds: body.legs.map((leg) => leg.ideaId),
                status: "ok",
                fetchedAt: "2026-09-23T12:00:00.000Z",
                warning: null,
                outcomes: [{ marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -125 }],
              },
            ],
          }),
        );
      }),
    );
    const puka = await pukaIdea();
    await putLiveContext(cachedRow(puka.id));

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await odds.waiting;
    await updateIdeaDetails(puka.id, { playerName: "Cooper Kupp", playerId: "p-kupp" });
    reachedEmptyCacheMidEdit.odds = (await getAllLiveContext()).length === 0;
    odds.open();
    await refreshing;

    const rows = (await getAllLiveContext()).filter((row) => row.ideaId === puka.id);
    expect(rows.filter((row) => row.currentOddsAmerican === -125)).toEqual([]);
    expect(rows.filter((row) => row.oddsFetchedAt === "2026-09-23T12:00:00.000Z")).toEqual([]);
  });

  it.fails("player-status path: a status fetched for the old player must not be written to the edited idea", async () => {
    const sleeper = gate();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/odds")) throw new Error("no odds request expected: the leg has no game");
        sleeper.reached();
        await sleeper.opened;
        return new Response(
          JSON.stringify({ fetchedAt: "2026-09-23T12:00:00.000Z", players: { "p-puka": { status: "Out", depthChartPosition: "WR1" } } }),
        );
      }),
    );
    // No game, so only the player-status half runs and the odds path can't cause this failure.
    const puka = await pukaIdea({ eventId: null });
    await putLiveContext(cachedRow(puka.id, { playerStatus: "Active" }));

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await sleeper.waiting;
    await updateIdeaDetails(puka.id, { playerName: "Cooper Kupp", playerId: "p-kupp" });
    reachedEmptyCacheMidEdit.playerStatus = (await getAllLiveContext()).length === 0;
    sleeper.open();
    await refreshing;

    const rows = (await getAllLiveContext()).filter((row) => row.ideaId === puka.id);
    expect(rows.filter((row) => row.playerStatus === "Out" || row.depthChartPosition === "WR1")).toEqual([]);
  });

  it("both races reached the edit with the cache already cleared (guards the it.fails above)", () => {
    expect(reachedEmptyCacheMidEdit).toEqual({ odds: true, playerStatus: true });
  });
});
