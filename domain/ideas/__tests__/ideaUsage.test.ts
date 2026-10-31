import { describe, expect, it } from "vitest";
import type { CandidateParlay, FinalizedLegSnapshot, FinalizedParlay } from "@/domain/types";
import { draftSlipCount, ideaUsage, isIdeaPlaced } from "../ideaUsage";

function slip(id: string, ideaIds: string[], status?: "draft" | "placed"): CandidateParlay {
  return {
    id,
    name: id,
    sportsbook: "FanDuel",
    ideaIds,
    stakeCents: 200,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...(status ? { status } : {}),
  };
}

function leg(ideaId: string): FinalizedLegSnapshot {
  return {
    ideaId,
    playerName: null,
    team: null,
    opponent: null,
    eventId: null,
    marketLabel: null,
    selection: null,
    lineAtCapture: null,
    oddsAtCaptureAmerican: null,
    lineAtFinalize: null,
    oddsAtFinalizeAmerican: null,
    sportsbookAtCapture: null,
  };
}

function record(id: string, ideaIds: string[], candidateId?: string): FinalizedParlay {
  return {
    id,
    ...(candidateId ? { candidateId } : {}),
    candidateName: id,
    sportsbook: "FanDuel",
    legSnapshots: ideaIds.map(leg),
    stakeCents: 200,
    estimatedOddsAmerican: null,
    estimatedPayoutCents: null,
    actualSportsbookOddsAmerican: null,
    actualSportsbookPayoutCents: null,
    promoLabel: "",
    promoMaxStakeCents: null,
    sportsbookBetId: "",
    note: "",
    finalizedAt: "2026-10-31T00:00:00.000Z",
  };
}

describe("ideaUsage", () => {
  it("a placed slip and its History record make one 'placed' and no drafts", () => {
    const usage = ideaUsage([slip("s1", ["a"], "placed")], [record("r1", ["a"], "s1")]);
    expect(isIdeaPlaced(usage, "a")).toBe(true);
    expect(draftSlipCount(usage, "a")).toBe(0);
  });

  it("placed comes from History alone: a placed slip with no record doesn't make its ideas placed", () => {
    const usage = ideaUsage([slip("s1", ["a"], "placed")], []);
    expect(isIdeaPlaced(usage, "a")).toBe(false);
    expect(draftSlipCount(usage, "a")).toBe(0);
  });

  it("a legacy record (no slip link) still marks its ideas placed, from the ideaIds it stored", () => {
    const usage = ideaUsage([], [record("legacy", ["a", "b"])]);
    expect([...usage.placed].sort()).toEqual(["a", "b"]);
  });

  it("a placement still counts after its slip is deleted", () => {
    const usage = ideaUsage([], [record("r1", ["a"], "deleted-slip")]);
    expect(isIdeaPlaced(usage, "a")).toBe(true);
  });

  it("counts the draft slips an idea is in, never placed slips, and a slip once even if it lists the idea twice", () => {
    const usage = ideaUsage(
      [slip("d1", ["a", "a"]), slip("d2", ["a", "b"], "draft"), slip("p1", ["a"], "placed")],
      [],
    );
    expect(draftSlipCount(usage, "a")).toBe(2);
    expect(draftSlipCount(usage, "b")).toBe(1);
    expect(draftSlipCount(usage, "unused")).toBe(0);
  });

  it("draft and placed are separate facts, never added together", () => {
    const usage = ideaUsage([slip("d1", ["a"])], [record("r1", ["a"], "p1"), record("r2", ["a"], "p2")]);
    expect(isIdeaPlaced(usage, "a")).toBe(true);
    expect(draftSlipCount(usage, "a")).toBe(1);
  });

  it("a slip saved before v3 (no status) is a draft", () => {
    const usage = ideaUsage([slip("old", ["a"])], []);
    expect(draftSlipCount(usage, "a")).toBe(1);
  });
});
