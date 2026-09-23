import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { deleteLiveContextForIdea, getAllLiveContext, getLiveContext, putLiveContext } from "../liveContextRepository";
import { __setDBForTests } from "@/storage/indexeddb/db";
import type { LiveContext } from "@/domain/types";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

function makeContext(overrides: Partial<LiveContext>): LiveContext {
  return {
    ideaId: "idea-1",
    sportsbook: "FanDuel",
    eventId: "evt-1",
    currentLine: null,
    currentOddsAmerican: null,
    marketAvailable: null,
    playerStatus: null,
    depthChartPosition: null,
    gameStatus: null,
    scheduledStart: null,
    fetchedAt: new Date().toISOString(),
    source: "odds-api",
    warnings: [],
    oddsFetchedAt: null,
    oddsSource: null,
    playerStatusFetchedAt: null,
    playerStatusSource: null,
    ...overrides,
  };
}

describe("liveContextRepository — per-book isolation", () => {
  it("keeps separate records for the same idea across two different sportsbooks", async () => {
    await putLiveContext(makeContext({ sportsbook: "FanDuel", currentOddsAmerican: -110 }));
    await putLiveContext(makeContext({ sportsbook: "DraftKings", currentOddsAmerican: -500 }));

    const fanduel = await getLiveContext("idea-1", "FanDuel");
    const draftkings = await getLiveContext("idea-1", "DraftKings");

    expect(fanduel?.currentOddsAmerican).toBe(-110);
    expect(draftkings?.currentOddsAmerican).toBe(-500);

    const all = await getAllLiveContext();
    expect(all).toHaveLength(2);
  });

  it("does not find a record under the wrong sportsbook", async () => {
    await putLiveContext(makeContext({ sportsbook: "FanDuel" }));
    expect(await getLiveContext("idea-1", "DraftKings")).toBeUndefined();
  });
});

describe("deleteLiveContextForIdea", () => {
  it("removes that idea's rows at every book and leaves other ideas alone", async () => {
    await putLiveContext(makeContext({ ideaId: "idea-1", sportsbook: "FanDuel" }));
    await putLiveContext(makeContext({ ideaId: "idea-1", sportsbook: "DraftKings" }));
    await putLiveContext(makeContext({ ideaId: "idea-1", sportsbook: "Bet365" }));
    await putLiveContext(makeContext({ ideaId: "idea-2", sportsbook: "FanDuel" }));

    await deleteLiveContextForIdea("idea-1");

    const rows = await getAllLiveContext();
    expect(rows.map((row) => [row.ideaId, row.sportsbook])).toEqual([["idea-2", "fanduel"]]);
  });

  it("is a no-op for an idea with no rows", async () => {
    await putLiveContext(makeContext({ ideaId: "idea-2", sportsbook: "FanDuel" }));
    await deleteLiveContextForIdea("idea-1");
    expect(await getAllLiveContext()).toHaveLength(1);
  });
});
