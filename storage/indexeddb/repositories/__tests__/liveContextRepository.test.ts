import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { getAllLiveContext, getLiveContext, putLiveContext } from "../liveContextRepository";
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
