import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { describeRefreshNotice, describeRefreshProblem, refreshCandidateContext } from "../refreshService";
import { captureInstantIdea } from "@/domain/ideas/ideaService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { putIdea } from "@/storage/indexeddb/repositories/ideasRepository";
import type { CandidateParlay, CapturedIdea } from "@/domain/types";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});
afterEach(() => vi.unstubAllGlobals());

function makeIdea(overrides: Partial<CapturedIdea> = {}): CapturedIdea {
  return {
    id: "idea-1",
    rawText: "raw",
    detailsStatus: "structured",
    sport: null,
    league: "NFL",
    slateDate: null,
    playerId: null,
    playerName: "Puka Nacua",
    team: null,
    opponent: null,
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    marketLabel: null,
    selection: "Over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: null,
    sportsbookAtCapture: null,
    confidence: "unrated",
    note: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function makeSlip(ideaIds: string[], sportsbook = "FanDuel"): CandidateParlay {
  return { id: "slip-1", name: "Sunday", sportsbook, ideaIds } as unknown as CandidateParlay;
}

type Sent = { sportsbook: string; legs: { ideaId: string }[] };

/** Records every /api/odds body and answers each event as a fresh Response (a Response body can be read once). */
function stubOdds(respond: (body: Sent) => Response = (body) => okFor(body.legs.map((leg) => leg.ideaId))): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.startsWith("/api/odds")) return new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), players: {} }));
      const body = JSON.parse(String(init?.body)) as Sent;
      sent.push(body);
      return respond(body);
    }),
  );
  return sent;
}

function okFor(ideaIds: string[]): Response {
  return new Response(
    JSON.stringify({
      results: [
        {
          eventId: "evt-1",
          ideaIds,
          status: "ok",
          fetchedAt: new Date().toISOString(),
          warning: null,
          outcomes: [{ marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican: -110 }],
        },
      ],
    }),
  );
}

describe("refreshOddsForCandidate: which legs are sent", () => {
  it("sends exactly the legs with a league, game and market, in slip order (permanent control)", async () => {
    const raw = await captureInstantIdea("Puka big game");
    const ideas = [
      makeIdea({ id: "full-1" }),
      makeIdea({ id: "no-league", league: null }),
      makeIdea({ id: "empty-event", eventId: "" }),
      makeIdea({ id: "no-market", marketKey: null }),
      raw,
      makeIdea({ id: "full-2", selection: null, playerName: null }),
    ];
    const sent = stubOdds();

    const result = await refreshCandidateContext(
      makeSlip(["full-1", "no-league", "empty-event", "no-market", raw.id, "deleted", "full-2"]),
      ideas,
    );

    expect(sent.map((body) => body.legs.map((leg) => leg.ideaId))).toEqual([["full-1", "full-2"]]);
    expect(result.odds.skippedIdeaIds).toEqual(["no-league", "empty-event", "no-market", raw.id, "deleted"]);
  });

  it("reports deleted ideas separately from legs skipped for missing details", async () => {
    stubOdds();
    const result = await refreshCandidateContext(makeSlip(["full", "raw", "deleted"]), [
      makeIdea({ id: "full" }),
      makeIdea({ id: "raw", eventId: null }),
    ]);
    expect(result.odds.skippedIdeaIds).toEqual(["raw", "deleted"]);
    expect(result.odds.missingIdeaIds).toEqual(["deleted"]);
  });
});

describe("describeRefreshProblem vs describeRefreshNotice", () => {
  it("nothing to refresh: no error, a neutral note saying why", async () => {
    const sent = stubOdds();
    const result = await refreshCandidateContext(makeSlip(["raw"]), [makeIdea({ id: "raw", eventId: null, marketKey: null, league: null })]);

    expect(sent).toEqual([]);
    expect(result.odds.status).toBe("nothing_to_refresh");
    expect(describeRefreshProblem(result)).toBeNull();
    expect(describeRefreshNotice(result)).toBe(
      "No odds to refresh: every leg still needs a league, game and market in its details.",
    );
  });

  it("a successful refresh that skipped raw legs: no error, the skip only as a note", async () => {
    stubOdds();
    // Stored, as the app's ideas always are: a refresh writes only for an idea
    // that still exists as it was sent (INV-13), so an unsaved one would be
    // reported as changed.
    const ideas = [makeIdea({ id: "full" }), makeIdea({ id: "raw-1", eventId: null }), makeIdea({ id: "raw-2", league: null })];
    for (const idea of ideas) await putIdea(idea);
    const result = await refreshCandidateContext(makeSlip(["full", "raw-1", "raw-2"]), ideas);

    expect(result.odds.status).toBe("ok");
    expect(describeRefreshProblem(result)).toBeNull();
    expect(describeRefreshNotice(result)).toBe(
      "2 legs were skipped: they need a league, game and market in the idea's details.",
    );
  });

  it("a real failure plus a skipped leg: the failure alone is the error, the skip alone is the note", async () => {
    stubOdds(() => new Response("", { status: 429, headers: { "Retry-After": "30" } }));
    const result = await refreshCandidateContext(makeSlip(["full", "raw"]), [makeIdea({ id: "full" }), makeIdea({ id: "raw", eventId: null })]);

    expect(describeRefreshProblem(result)).toBe("Too many refreshes. Try again in 30s.");
    expect(describeRefreshNotice(result)).toBe("1 leg was skipped: it needs a league, game and market in the idea's details.");
  });

  it("a deleted idea alone is neither an error nor blamed on missing details", async () => {
    stubOdds();
    const result = await refreshCandidateContext(makeSlip(["deleted"]), []);

    expect(result.odds.missingIdeaIds).toEqual(["deleted"]);
    expect(describeRefreshProblem(result)).toBeNull();
    expect(describeRefreshNotice(result)).toBeNull();
  });
});
