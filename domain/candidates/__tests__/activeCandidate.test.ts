import { describe, expect, it } from "vitest";
import { resolveActiveCandidateId } from "../activeCandidate";
import type { CandidateParlay } from "@/domain/types";

function makeCandidate(overrides: Partial<CandidateParlay>): CandidateParlay {
  return {
    id: "cand-1",
    name: "Sunday Core",
    sportsbook: "FanDuel",
    ideaIds: [],
    stakeCents: 200,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveActiveCandidateId", () => {
  it("returns null when there are no candidates", () => {
    expect(resolveActiveCandidateId([], null)).toBeNull();
    expect(resolveActiveCandidateId([], "stale-id")).toBeNull();
  });

  it("prefers the remembered id when it still refers to a real candidate", () => {
    const a = makeCandidate({ id: "a", updatedAt: "2026-09-01T00:00:00.000Z" });
    const b = makeCandidate({ id: "b", updatedAt: "2026-09-05T00:00:00.000Z" });
    expect(resolveActiveCandidateId([a, b], "a")).toBe("a");
  });

  it("falls back to the most recently updated candidate when nothing is remembered", () => {
    const a = makeCandidate({ id: "a", updatedAt: "2026-09-01T00:00:00.000Z" });
    const b = makeCandidate({ id: "b", updatedAt: "2026-09-05T00:00:00.000Z" });
    const c = makeCandidate({ id: "c", updatedAt: "2026-09-03T00:00:00.000Z" });
    expect(resolveActiveCandidateId([a, b, c], null)).toBe("b");
  });

  it("falls back to the most recently updated candidate when the remembered one was deleted", () => {
    const a = makeCandidate({ id: "a", updatedAt: "2026-09-01T00:00:00.000Z" });
    const b = makeCandidate({ id: "b", updatedAt: "2026-09-05T00:00:00.000Z" });
    expect(resolveActiveCandidateId([a, b], "deleted-id")).toBe("b");
  });
});
