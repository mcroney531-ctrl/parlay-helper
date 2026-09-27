import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CandidateParlay, CapturedIdea, LiveContext } from "@/domain/types";
import { refreshOddsForCandidate, refreshPlayerStatusForCandidate } from "../refreshService";
import { captureStructuredIdea, updateIdeaDetails } from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import {
  getAllLiveContext,
  mergeLiveContextIfIdeaCurrent,
  putLiveContext,
} from "@/storage/indexeddb/repositories/liveContextRepository";
import { allocateRefreshAttempt } from "@/storage/indexeddb/repositories/metaRepository";

// Same-identity refresh ordering (Phase 3 chunk 2). Invariant, AS CORRECTED
// (GPT, adopting B's refinement): for the same idea identity, an older market
// observation must never overwrite a newer market observation. Attempts that
// fail before observing market state don't take part in the ordering: the
// absence of knowledge shouldn't outrank a real observation.
//   successful fetch      -> observation, advances the stamp
//   genuine not_found     -> observation, advances the stamp
//   provider/network error -> not an observation, doesn't advance the stamp
//   identity changed/deleted -> nothing written (INV-13)
// Attempts are still ordered by when they STARTED (a number taken before the
// request goes out), not by when their responses arrive. Distinct from INV-13.

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});
afterEach(() => vi.unstubAllGlobals());

type Pending = { url: string; body: unknown; respond: (response: Response) => void };

/** fetch that holds every request until the test answers it, in whatever order the test chooses. */
function controlledFetch() {
  const pending: Pending[] = [];
  const waiters: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      return new Promise<Response>((respond) => {
        pending.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, respond });
        waiters.splice(0).forEach((wake) => wake());
      });
    }),
  );
  return {
    /** Resolves once `count` requests have been made (and are being held). */
    async requested(count: number): Promise<Pending[]> {
      while (pending.length < count) await new Promise<void>((wake) => waiters.push(wake));
      return pending;
    },
  };
}

function oddsResponse(request: Pending, priceAmerican: number, status: "ok" | "provider_error" | "not_found" = "ok"): Response {
  const legs = (request.body as { legs: { ideaId: string }[] }).legs;
  return new Response(
    JSON.stringify({
      results: [
        {
          eventId: "evt-1",
          ideaIds: legs.map((leg) => leg.ideaId),
          status,
          fetchedAt: `2026-09-27T12:00:0${Math.abs(priceAmerican) % 10}.000Z`,
          warning: status === "ok" ? null : "provider trouble",
          outcomes:
            status === "ok"
              ? [{ marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican }]
              : [],
        },
      ],
    }),
  );
}

function statusResponse(status: string): Response {
  return new Response(
    JSON.stringify({ fetchedAt: "2026-09-27T12:00:00.000Z", players: { "p-puka": { status, depthChartPosition: "WR1" } } }),
  );
}

function slip(ideaIds: string[]): CandidateParlay {
  return { id: "slip-1", name: "Sunday", sportsbook: "FanDuel", ideaIds } as unknown as CandidateParlay;
}

async function puka(overrides: Partial<CapturedIdea> = {}): Promise<CapturedIdea> {
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

async function row(ideaId: string): Promise<LiveContext | undefined> {
  return (await getAllLiveContext()).find((r) => r.ideaId === ideaId);
}

describe("an earlier refresh attempt never overwrites a later attempt's committed result", () => {
  it("odds: the attempt that started first but answered last is not written", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const earlier = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    const later = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);

    second.respond(oddsResponse(second, -150));
    const laterResult = await later;
    first.respond(oddsResponse(first, -110));
    const earlierResult = await earlier;

    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -150 });
    expect(laterResult.supersededIdeaIds).toEqual([]);
    expect(earlierResult.supersededIdeaIds).toEqual([idea.id]);
    expect(earlierResult.events[0].supersededIdeaIds).toEqual([idea.id]);
    // Superseded is not a failure and not an identity change.
    expect(earlierResult.status).toBe("ok");
    expect(earlierResult.changedIdeaIds).toEqual([]);
  });

  it("player status: the attempt that started first but answered last is not written", async () => {
    const net = controlledFetch();
    const idea = await puka({ eventId: null }); // no game: status only

    const earlier = refreshPlayerStatusForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    const later = refreshPlayerStatusForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);

    second.respond(statusResponse("Questionable"));
    await later;
    first.respond(statusResponse("Out"));
    const earlierResult = await earlier;

    expect(await row(idea.id)).toMatchObject({ playerStatus: "Questionable" });
    expect(earlierResult.supersededIdeaIds).toEqual([idea.id]);
  });

  it("an earlier attempt answering last with not_found doesn't mark the market unavailable over the newer price", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const earlier = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    const later = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);

    second.respond(oddsResponse(second, -150));
    await later;
    first.respond(oddsResponse(first, 0, "not_found"));
    const earlierResult = await earlier;

    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -150, marketAvailable: true, warnings: [] });
    expect(earlierResult.supersededIdeaIds).toEqual([idea.id]);
    expect(earlierResult.changedIdeaIds).toEqual([]);
  });

  it("control: when the later attempt also answers last, it is written over the earlier one", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const earlier = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    const later = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);

    first.respond(oddsResponse(first, -110));
    const earlierResult = await earlier;
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -110 });
    second.respond(oddsResponse(second, -150));
    const laterResult = await later;

    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -150 });
    expect(earlierResult.supersededIdeaIds).toEqual([]);
    expect(laterResult.supersededIdeaIds).toEqual([]);
  });

  it("control: back-to-back refreshes each write normally", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const firstRun = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    first.respond(oddsResponse(first, -110));
    await firstRun;
    const secondRun = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);
    second.respond(oddsResponse(second, -150));
    await secondRun;

    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -150 });
  });

  it("odds and player status are ordered separately: a newer status result doesn't block an older odds result", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const odds = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [oddsRequest] = await net.requested(1);
    const status = refreshPlayerStatusForCandidate(slip([idea.id]), [idea]);
    const [, statusRequest] = await net.requested(2);

    statusRequest.respond(statusResponse("Questionable"));
    await status;
    oddsRequest.respond(oddsResponse(oddsRequest, -110));
    const oddsResult = await odds;

    expect(oddsResult.supersededIdeaIds).toEqual([]);
    const stored = await row(idea.id);
    expect(stored).toMatchObject({ currentOddsAmerican: -110, playerStatus: "Questionable" });
    // Each half keeps its own attempt stamp; neither write dropped the other's.
    expect(stored?.oddsAttempt).toBeLessThan(stored?.playerStatusAttempt as number);
  });

  it("a row saved before attempts were stamped is overwritten by any attempt", async () => {
    const net = controlledFetch();
    const idea = await puka();
    await putLiveContext({
      ideaId: idea.id,
      sportsbook: "FanDuel",
      eventId: "evt-1",
      currentLine: 60.5,
      currentOddsAmerican: -200,
      marketAvailable: true,
      playerStatus: null,
      depthChartPosition: null,
      gameStatus: null,
      scheduledStart: null,
      fetchedAt: "2026-09-01T00:00:00.000Z",
      source: "odds-api",
      warnings: [],
      oddsFetchedAt: "2026-09-01T00:00:00.000Z",
      oddsSource: "odds-api",
      playerStatusFetchedAt: null,
      playerStatusSource: null,
    });

    const run = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [request] = await net.requested(1);
    request.respond(oddsResponse(request, -110));
    expect((await run).supersededIdeaIds).toEqual([]);
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -110 });
  });

  /** Starts two odds refreshes (the earlier one first) and returns their held requests. */
  async function twoAttempts(idea: CapturedIdea) {
    const net = controlledFetch();
    const earlier = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    const later = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [, second] = await net.requested(2);
    return { earlier, later, first, second };
  }

  it("B's pin (a): a newer provider error, then an older success: the success IS written (an error observed nothing)", async () => {
    const idea = await puka();
    const { earlier, later, first, second } = await twoAttempts(idea);

    second.respond(oddsResponse(second, 0, "provider_error"));
    const laterResult = await later;
    first.respond(oddsResponse(first, -110));
    const earlierResult = await earlier;

    expect(laterResult.supersededIdeaIds).toEqual([]);
    expect(earlierResult.supersededIdeaIds).toEqual([]);
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -110, marketAvailable: true, warnings: [] });
  });

  it("B's pin (b): a newer genuine not_found, then an older success: blocked, the market stays unavailable", async () => {
    const idea = await puka();
    const { earlier, later, first, second } = await twoAttempts(idea);

    second.respond(oddsResponse(second, 0, "not_found"));
    await later;
    first.respond(oddsResponse(first, -110));
    const earlierResult = await earlier;

    // Ordered by real information, not by preferring good news over bad.
    expect(earlierResult.supersededIdeaIds).toEqual([idea.id]);
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: null, marketAvailable: false });
  });

  it("B's pin (c): a newer success, then an older provider error: blocked, no stale error crowds out the fresh price", async () => {
    const idea = await puka();
    const { earlier, later, first, second } = await twoAttempts(idea);

    second.respond(oddsResponse(second, -150));
    await later;
    first.respond(oddsResponse(first, 0, "provider_error"));
    const earlierResult = await earlier;

    expect(earlierResult.supersededIdeaIds).toEqual([idea.id]);
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -150, warnings: [] });
  });

  it("a newer provider error doesn't advance the stamp; the older success that lands after it does", async () => {
    const idea = await puka();
    const { earlier, later, first, second } = await twoAttempts(idea);

    second.respond(oddsResponse(second, 0, "provider_error"));
    await later;
    expect((await row(idea.id))?.oddsAttempt).toBeUndefined();
    first.respond(oddsResponse(first, -110));
    await earlier;

    const stored = await row(idea.id);
    expect(stored?.oddsAttempt).toBeDefined();
    // The stored observation is the earlier attempt's, so its stamp is the smaller number.
    expect(stored?.oddsAttempt).toBeLessThan(await allocateRefreshAttempt());
  });

  it("an older attempt for a proposition that has since been edited is reported as changed, not superseded", async () => {
    const net = controlledFetch();
    const idea = await puka();

    const earlier = refreshOddsForCandidate(slip([idea.id]), [idea]);
    const [first] = await net.requested(1);
    await updateIdeaDetails(idea.id, { lineAtCapture: 70.5 });
    first.respond(oddsResponse(first, -110));
    const result = await earlier;

    expect(result.changedIdeaIds).toEqual([idea.id]);
    expect(result.supersededIdeaIds).toEqual([]);
    expect(await row(idea.id)).toBeUndefined();
  });
});

describe("mergeLiveContextIfIdeaCurrent's ordering rule, directly", () => {
  it("only a strictly later stored attempt supersedes: the same attempt may write the same row again", async () => {
    const idea = await puka();
    const write = (seq: number, price: number) =>
      mergeLiveContextIfIdeaCurrent(idea.id, "FanDuel", { source: "odds", seq, observation: true }, () => true, (existing) => ({
        ...(existing as LiveContext),
        ideaId: idea.id,
        sportsbook: "FanDuel",
        currentOddsAmerican: price,
      }));

    expect(await write(5, -110)).toBe("written");
    expect(await write(5, -120)).toBe("written");
    expect(await write(4, -130)).toBe("superseded");
    expect(await write(6, -140)).toBe("written");
    expect(await row(idea.id)).toMatchObject({ currentOddsAmerican: -140, oddsAttempt: 6 });
  });

  it("a non-observation is still blocked by a newer observation, but never advances the stamp", async () => {
    const idea = await puka();
    const write = (seq: number, observation: boolean, warnings: string[]) =>
      mergeLiveContextIfIdeaCurrent(idea.id, "FanDuel", { source: "odds", seq, observation }, () => true, (existing) => ({
        ...(existing as LiveContext),
        ideaId: idea.id,
        sportsbook: "FanDuel",
        warnings,
      }));

    expect(await write(5, true, [])).toBe("written");
    expect(await write(4, false, ["stale error"])).toBe("superseded");
    expect(await write(7, false, ["newer error"])).toBe("written");
    expect(await row(idea.id)).toMatchObject({ oddsAttempt: 5, warnings: ["newer error"] });
    // So an observation between the two still lands.
    expect(await write(6, true, [])).toBe("written");
    expect(await row(idea.id)).toMatchObject({ oddsAttempt: 6 });
  });
});

describe("attempt numbers", () => {
  it("strictly increase, also across tabs sharing the database", async () => {
    vi.resetModules();
    const otherTab = await import("@/storage/indexeddb/repositories/metaRepository");
    const numbers = [
      await allocateRefreshAttempt(),
      await otherTab.allocateRefreshAttempt(),
      await allocateRefreshAttempt(),
      await otherTab.allocateRefreshAttempt(),
    ];
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(4);
  });

  it("concurrent allocations never hand out the same number", async () => {
    const numbers = await Promise.all(Array.from({ length: 20 }, () => allocateRefreshAttempt()));
    expect(new Set(numbers).size).toBe(20);
  });
});
