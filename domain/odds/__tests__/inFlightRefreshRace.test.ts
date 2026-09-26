import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { describeRefreshNotice, refreshCandidateContext } from "../refreshService";
import {
  captureStructuredIdea,
  changesPriceIdentity,
  deleteIdeaPermanently,
  updateIdeaDetails,
} from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import {
  getAllLiveContext,
  mergeLiveContextIfIdeaCurrent,
  putLiveContext,
} from "@/storage/indexeddb/repositories/liveContextRepository";
import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";

/**
 * INV-13 (Phase 2 chunk 3): a refresh started against an idea's price-defining
 * identity must not write its result if that identity changed before the
 * write commits. A refresh that started before an identity edit still holds
 * the old idea, and used to put the OLD proposition's data back under the
 * edited idea once updateIdeaDetails had cleared the cache. The first two
 * tests are that gap's acceptance tests (they were it.fails until the guard
 * landed); the odds and player-status paths are gated and asserted
 * separately. The positive controls below keep a guard that drops every
 * write from passing.
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

// Set inside the two acceptance tests, checked by the test after them, so a
// broken setup can't make them pass for the wrong reason.
const reachedEmptyCacheMidEdit = { odds: false, playerStatus: false };

describe("in-flight refresh vs an identity edit (Phase 2 acceptance tests)", () => {
  it("odds path: a refresh started before the edit must not write the old proposition's price back", async () => {
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

  it("player-status path: a status fetched for the old player must not be written to the edited idea", async () => {
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

  it("both races reached the edit with the cache already cleared (guards the two tests above)", () => {
    expect(reachedEmptyCacheMidEdit).toEqual({ odds: true, playerStatus: true });
  });
});

const NEW_FETCH = "2026-09-23T12:00:00.000Z";

/**
 * Both providers held at a gate until the test opens it. Odds answers for
 * Puka (-125) and Kupp (-140) in one event; Sleeper answers for both players.
 */
function stubBothProviders() {
  const odds = gate();
  const sleeper = gate();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/odds")) {
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
                fetchedAt: NEW_FETCH,
                warning: null,
                outcomes: [
                  { marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -125 },
                  { marketKey: "player_reception_yds", name: "Over", description: "Cooper Kupp", point: 63.5, priceAmerican: -140 },
                ],
              },
            ],
          }),
        );
      }
      sleeper.reached();
      await sleeper.opened;
      return new Response(
        JSON.stringify({
          fetchedAt: NEW_FETCH,
          players: {
            "p-puka": { status: "Out", depthChartPosition: "WR1" },
            "p-kupp": { status: "Questionable", depthChartPosition: "WR2" },
          },
        }),
      );
    }),
  );
  return { odds, sleeper };
}

async function rowFor(ideaId: string): Promise<LiveContext | undefined> {
  return (await getAllLiveContext()).find((row) => row.ideaId === ideaId);
}

describe("INV-13 positive controls: the guard skips only what changed", () => {
  it("(1) with no edit mid-flight, both the odds and the player-status results ARE written", async () => {
    const { odds, sleeper } = stubBothProviders();
    const puka = await pukaIdea();

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await odds.waiting;
    odds.open();
    await sleeper.waiting;
    sleeper.open();
    const result = await refreshing;

    expect(await rowFor(puka.id)).toMatchObject({
      currentOddsAmerican: -125,
      oddsFetchedAt: NEW_FETCH,
      playerStatus: "Out",
      depthChartPosition: "WR1",
      playerStatusFetchedAt: NEW_FETCH,
    });
    expect(result.odds.changedIdeaIds).toEqual([]);
    expect(result.playerStatus.changedIdeaIds).toEqual([]);
    expect(describeRefreshNotice(result)).toBeNull();
  });

  it("(2) a cosmetic edit mid-flight (changesPriceIdentity false) still lets both writes land", async () => {
    const { odds, sleeper } = stubBothProviders();
    const puka = await pukaIdea();

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await odds.waiting;
    const edited = await updateIdeaDetails(puka.id, { note: "saw him limp", confidence: "core" });
    expect(changesPriceIdentity(puka, edited)).toBe(false);
    odds.open();
    await sleeper.waiting;
    await updateIdeaDetails(puka.id, { playerName: "  puka NACUA ", selection: "over" });
    sleeper.open();
    const result = await refreshing;

    expect(await rowFor(puka.id)).toMatchObject({ currentOddsAmerican: -125, oddsFetchedAt: NEW_FETCH, playerStatus: "Out" });
    expect(result.odds.changedIdeaIds).toEqual([]);
    expect(result.playerStatus.changedIdeaIds).toEqual([]);
  });

  it("(3)+(4) multi-leg: only the edited leg is skipped and reported as changed; the other leg is written", async () => {
    const { odds, sleeper } = stubBothProviders();
    const puka = await pukaIdea();
    const kupp = await pukaIdea({ playerId: "p-kupp", playerName: "Cooper Kupp" });

    const refreshing = refreshCandidateContext(slip([puka.id, kupp.id]), [puka, kupp]);
    await odds.waiting;
    await updateIdeaDetails(puka.id, { lineAtCapture: 70.5 });
    odds.open();
    await sleeper.waiting;
    sleeper.open();
    const result = await refreshing;

    // A: nothing written, by either path.
    expect(await rowFor(puka.id)).toBeUndefined();
    // B: both written.
    expect(await rowFor(kupp.id)).toMatchObject({
      currentOddsAmerican: -140,
      oddsFetchedAt: NEW_FETCH,
      playerStatus: "Questionable",
      playerStatusFetchedAt: NEW_FETCH,
    });
    // A is reported as skipped because its idea changed, not as refreshed or unmatched.
    expect(result.odds.changedIdeaIds).toEqual([puka.id]);
    expect(result.odds.events[0].changedIdeaIds).toEqual([puka.id]);
    expect(result.odds.events[0].unmatchedIdeaIds).toEqual([]);
    expect(result.playerStatus.changedIdeaIds).toEqual([puka.id]);
    expect(describeRefreshNotice(result)).toBe(
      "1 leg was edited during the refresh, so its results weren't saved. Refresh again to update it.",
    );
  });

  it("an idea deleted mid-flight gets no row (no orphan) and is reported as changed", async () => {
    const { odds, sleeper } = stubBothProviders();
    const puka = await pukaIdea();

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await odds.waiting;
    await deleteIdeaPermanently(puka.id);
    odds.open();
    await sleeper.waiting;
    sleeper.open();
    const result = await refreshing;

    expect(await rowFor(puka.id)).toBeUndefined();
    expect(result.odds.changedIdeaIds).toEqual([puka.id]);
    expect(result.playerStatus.changedIdeaIds).toEqual([puka.id]);
  });

  it("a not_found result for the old proposition doesn't mark the edited idea's market unavailable", async () => {
    const odds = gate();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.startsWith("/api/odds")) return new Response(JSON.stringify({ fetchedAt: NEW_FETCH, players: {} }));
        odds.reached();
        await odds.opened;
        const body = JSON.parse(String(init?.body)) as { legs: { ideaId: string }[] };
        return new Response(
          JSON.stringify({
            results: [{ eventId: "evt-1", ideaIds: body.legs.map((l) => l.ideaId), status: "not_found", fetchedAt: NEW_FETCH, warning: "gone", outcomes: [] }],
          }),
        );
      }),
    );
    const puka = await pukaIdea();

    const refreshing = refreshCandidateContext(slip([puka.id]), [puka]);
    await odds.waiting;
    await updateIdeaDetails(puka.id, { eventId: "evt-2" });
    odds.open();
    const result = await refreshing;

    expect(await rowFor(puka.id)).toBeUndefined();
    expect(result.odds.changedIdeaIds).toEqual([puka.id]);
  });
});

describe("the identity edit and a guarded write can't interleave", () => {
  it("a guarded write racing an identity edit, at every offset, never leaves the old price on the edited idea", async () => {
    const yieldTimes = async (times: number) => {
      for (let i = 0; i < times; i++) {
        await (i % 2 === 0 ? Promise.resolve() : new Promise((resolve) => setImmediate(resolve)));
      }
    };
    const outcomes = new Set<string>();
    // Negative offset: the write starts first; positive: the edit starts first.
    for (let offset = -20; offset <= 20; offset++) {
      const idea = await pukaIdea();
      const edit = () => updateIdeaDetails(idea.id, { playerName: "Cooper Kupp", playerId: "p-kupp" });
      const write = () =>
        mergeLiveContextIfIdeaCurrent(
          idea.id,
          "FanDuel",
          (current) => current !== undefined && !changesPriceIdentity(idea, current),
          () => cachedRow(idea.id, { currentOddsAmerican: -125 }),
        );
      let editing: Promise<unknown>;
      let writing: Promise<boolean>;
      if (offset < 0) {
        writing = write();
        await yieldTimes(-offset);
        editing = edit();
      } else {
        editing = edit();
        await yieldTimes(offset);
        writing = write();
      }
      const [, written] = await Promise.all([editing, writing]);
      outcomes.add(written ? "landed before the edit (then cleared by it)" : "skipped after the edit");

      expect(await rowFor(idea.id), `offset ${offset}`).toBeUndefined();
    }
    // Both orders really happened, so the assertion above covered both.
    expect(outcomes.size).toBe(2);
  });
});
