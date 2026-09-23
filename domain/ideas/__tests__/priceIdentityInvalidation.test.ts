import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { captureStructuredIdea, getIdea, updateIdeaDetails } from "../ideaService";
import { resolveLegPrice } from "@/domain/odds/estimate";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { getAllLiveContext, getLiveContext, putLiveContext } from "@/storage/indexeddb/repositories/liveContextRepository";
import type { CapturedIdea, LiveContext } from "@/domain/types";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

function makeContext(overrides: Partial<LiveContext>): LiveContext {
  return {
    ideaId: "idea-1",
    sportsbook: "FanDuel",
    eventId: "evt-1",
    currentLine: 63.5,
    currentOddsAmerican: -110,
    marketAvailable: true,
    playerStatus: "Active",
    depthChartPosition: "WR1",
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: "2026-09-20T12:00:00.000Z",
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: "2026-09-20T12:00:00.000Z",
    oddsSource: "odds-api",
    playerStatusFetchedAt: "2026-09-20T12:00:00.000Z",
    playerStatusSource: "sleeper",
    ...overrides,
  };
}

/** Idea X priced at two books, idea Y at one. Every field populated so a partial rewrite would show. */
async function seed(): Promise<{ x: CapturedIdea; y: CapturedIdea }> {
  const x = await captureStructuredIdea("Puka o63.5", {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerId: "p-puka",
    playerName: "Puka Nacua",
    selection: "Over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: -115,
    sportsbookAtCapture: "FanDuel",
    team: "Los Angeles Rams",
    opponent: "Seattle Seahawks",
    marketLabel: "Receiving Yards",
    sport: "football",
    slateDate: "2026-09-27",
    note: "",
  });
  const y = await captureStructuredIdea("Kupp o71.5", {
    league: "NFL",
    eventId: "evt-1",
    marketKey: "player_reception_yds",
    playerName: "Cooper Kupp",
    selection: "Over",
    lineAtCapture: 71.5,
  });
  await putLiveContext(makeContext({ ideaId: x.id, sportsbook: "FanDuel" }));
  await putLiveContext(makeContext({ ideaId: x.id, sportsbook: "DraftKings", currentOddsAmerican: -105 }));
  await putLiveContext(makeContext({ ideaId: y.id, sportsbook: "FanDuel", currentOddsAmerican: 110, currentLine: 71.5 }));
  return { x, y };
}

async function snapshot(): Promise<string> {
  const rows = await getAllLiveContext();
  rows.sort((a, b) => `${a.ideaId}${a.sportsbook}`.localeCompare(`${b.ideaId}${b.sportsbook}`));
  return JSON.stringify(rows);
}

const identityEdits: [string, Partial<CapturedIdea>][] = [
  ["league", { league: "NCAAF" }],
  ["eventId", { eventId: "evt-2" }],
  ["eventId cleared", { eventId: null }],
  ["marketKey", { marketKey: "player_receptions" }],
  ["playerId", { playerId: "p-kupp" }],
  ["playerName", { playerName: "Cooper Kupp" }],
  ["selection", { selection: "Under" }],
  ["lineAtCapture", { lineAtCapture: 71.5 }],
  ["lineAtCapture cleared", { lineAtCapture: null }],
];

describe("updateIdeaDetails: an edit that changes the priced proposition", () => {
  it.each(identityEdits)("%s: deletes the idea's live context at every book and nothing else", async (_name, patch) => {
    const { x, y } = await seed();
    const yRows = (await getAllLiveContext()).filter((row) => row.ideaId === y.id);

    const saved = await updateIdeaDetails(x.id, patch);

    const after = await getAllLiveContext();
    expect(after.filter((row) => row.ideaId === x.id)).toEqual([]);
    // Alias spellings resolve to the same (now deleted) row.
    expect(await getLiveContext(x.id, "Fan Duel")).toBeUndefined();
    expect(await getLiveContext(x.id, "DK")).toBeUndefined();
    expect(after.filter((row) => row.ideaId === y.id)).toEqual(yRows);
    expect(saved).toMatchObject(patch);
    expect(await getIdea(x.id)).toMatchObject(patch);
  });

  it("leaves the resolver on the capture price instead of the old proposition's live price", async () => {
    const { x } = await seed();
    await updateIdeaDetails(x.id, { selection: "Under" });
    const live = await getLiveContext(x.id, "FanDuel");
    const resolved = resolveLegPrice({
      ideaId: x.id,
      eventId: "evt-1",
      currentOddsAmerican: live?.currentOddsAmerican ?? null,
      captureOddsAmerican: -115,
      captureSportsbook: "FanDuel",
      slipSportsbook: "FanDuel",
      marketAvailable: live?.marketAvailable ?? null,
    });
    expect(resolved).toMatchObject({ source: "capture", oddsAmerican: -115 });
  });
});

const cosmeticEdits: [string, Partial<CapturedIdea>][] = [
  ["confidence", { confidence: "core" }],
  ["note", { note: "love the matchup" }],
  ["sport", { sport: "basketball" }],
  ["slateDate", { slateDate: "2026-10-04" }],
  ["team and opponent", { team: "LAR", opponent: null }],
  ["marketLabel", { marketLabel: "Rec Yds" }],
  ["capture odds and book", { oddsAtCaptureAmerican: 120, sportsbookAtCapture: "DraftKings" }],
  ["case-only playerName and selection", { playerName: "puka nacua", selection: "OVER" }],
  ["whitespace around playerName", { playerName: "  Puka Nacua " }],
  [
    "identity values re-sent unchanged",
    { league: "NFL", eventId: "evt-1", marketKey: "player_reception_yds", playerId: "p-puka", lineAtCapture: 63.5 },
  ],
  [
    "every cosmetic field at once",
    { confidence: "longshot", note: "x", sport: null, slateDate: null, team: null, opponent: null, marketLabel: null, oddsAtCaptureAmerican: null, sportsbookAtCapture: null },
  ],
];

describe("updateIdeaDetails: an edit that doesn't change what is priced", () => {
  it.each(cosmeticEdits)("%s: leaves the whole live-context store byte-identical", async (_name, patch) => {
    const { x } = await seed();
    const before = await snapshot();

    await updateIdeaDetails(x.id, patch);

    expect(await snapshot()).toBe(before);
    expect(await getAllLiveContext()).toHaveLength(3);
  });
});
