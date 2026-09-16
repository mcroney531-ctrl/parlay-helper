import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  addLegToCandidate,
  cloneCandidate,
  createCandidate,
  listCandidates,
  removeLegFromCandidate,
  setCandidateStake,
} from "../candidateService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { DEFAULT_STAKE_CENTS } from "@/domain/types";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

describe("createCandidate", () => {
  it("defaults stake to $2 and starts with no legs", async () => {
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    expect(candidate.stakeCents).toBe(DEFAULT_STAKE_CENTS);
    expect(candidate.ideaIds).toEqual([]);
    expect(candidate.sportsbook).toBe("FanDuel");
  });
});

describe("addLegToCandidate / removeLegFromCandidate", () => {
  it("adds and removes legs without duplication", async () => {
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    const withLeg = await addLegToCandidate(candidate.id, "idea-1");
    expect(withLeg.ideaIds).toEqual(["idea-1"]);

    const noDupe = await addLegToCandidate(candidate.id, "idea-1");
    expect(noDupe.ideaIds).toEqual(["idea-1"]);

    const removed = await removeLegFromCandidate(candidate.id, "idea-1");
    expect(removed.ideaIds).toEqual([]);
  });
});

describe("cloneCandidate", () => {
  it("duplicates legs and settings under a new id", async () => {
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    await addLegToCandidate(candidate.id, "idea-1");
    await setCandidateStake(candidate.id, 500);

    const clone = await cloneCandidate(candidate.id);
    expect(clone.id).not.toBe(candidate.id);
    expect(clone.name).toBe("Sunday Core (copy)");
    expect(clone.ideaIds).toEqual(["idea-1"]);
    expect(clone.stakeCents).toBe(500);

    const all = await listCandidates();
    expect(all).toHaveLength(2);
  });
});
