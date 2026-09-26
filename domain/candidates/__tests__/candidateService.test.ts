import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  addLegToCandidate,
  cloneCandidate,
  createCandidate,
  listCandidates,
  removeLegFromCandidate,
  renameCandidate,
  setCandidateStake,
} from "../candidateService";
import { __setDBForTests } from "@/storage/indexeddb/db";
import { putCandidate } from "@/storage/indexeddb/repositories/candidatesRepository";
import { DEFAULT_STAKE_CENTS } from "@/domain/types";
import { captureInstantIdea } from "@/domain/ideas/ideaService";

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

describe("renameCandidate", () => {
  it("updates the name and persists it", async () => {
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    const renamed = await renameCandidate(candidate.id, "Sunday Chaos");
    expect(renamed.name).toBe("Sunday Chaos");

    const all = await listCandidates();
    expect(all.find((c) => c.id === candidate.id)?.name).toBe("Sunday Chaos");
  });

  it("ignores a blank rename and keeps the existing name", async () => {
    const candidate = await createCandidate("Sunday Core", "FanDuel");
    const renamed = await renameCandidate(candidate.id, "   ");
    expect(renamed.name).toBe("Sunday Core");
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

describe("adding legs is never gated on priceability (permanent control)", () => {
  it("adds a raw needs_details idea to a slip on a book with no live odds", async () => {
    const raw = await captureInstantIdea("Puka big game Sunday");
    expect(raw.detailsStatus).toBe("needs_details");
    const slip = await createCandidate("Sunday", "Bet365");

    const updated = await addLegToCandidate(slip.id, raw.id);

    expect(updated.ideaIds).toEqual([raw.id]);
  });
});

describe("schema v3 fields on new and cloned slips", () => {
  it("writes status 'draft' and revision 0 explicitly on a new slip, so a missing field means a pre-v3 record", async () => {
    const created = await createCandidate("Sunday", "FanDuel");
    expect(created).toMatchObject({ status: "draft", revision: 0 });
    expect("placedAt" in created).toBe(false);
    const [stored] = await listCandidates();
    expect(stored).toMatchObject({ status: "draft", revision: 0 });
  });

  it("clones a placed slip as a fresh draft at revision 0 with no placedAt, leaving the source unchanged", async () => {
    const source = await createCandidate("Sunday", "FanDuel");
    await addLegToCandidate(source.id, "idea-1");
    const placedSource = { ...(await listCandidates())[0], status: "placed" as const, placedAt: "2026-09-26T12:00:00.000Z", revision: 5 };
    await putCandidate(placedSource);

    const clone = await cloneCandidate(source.id);

    expect(clone.id).not.toBe(source.id);
    expect(clone).toMatchObject({ status: "draft", revision: 0, ideaIds: ["idea-1"], sportsbook: "FanDuel" });
    expect("placedAt" in clone).toBe(false);
    const stored = await listCandidates();
    expect(stored.find((c) => c.id === clone.id)).toEqual(clone);
    expect(stored.find((c) => c.id === source.id)).toEqual(placedSource);
  });
});
