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

describe("resolveActiveCandidateId never returns a placed slip (INV-7)", () => {
  it("ignores a stale stored pointer that names a placed slip", () => {
    const placed = makeCandidate({ id: "placed", status: "placed", updatedAt: "2026-09-05T00:00:00.000Z" });
    const draft = makeCandidate({ id: "draft", status: "draft", updatedAt: "2026-09-01T00:00:00.000Z" });
    expect(resolveActiveCandidateId([placed, draft], "placed")).toBe("draft");
  });

  it("with no stored pointer, falls back to the most recently updated draft, skipping a newer placed slip", () => {
    const placed = makeCandidate({ id: "placed", status: "placed", updatedAt: "2026-09-05T00:00:00.000Z" });
    const older = makeCandidate({ id: "older", updatedAt: "2026-09-01T00:00:00.000Z" });
    const newer = makeCandidate({ id: "newer", status: "draft", updatedAt: "2026-09-03T00:00:00.000Z" });
    expect(resolveActiveCandidateId([placed, older, newer], null)).toBe("newer");
  });

  it("with no stored pointer and every slip placed, returns null", () => {
    const a = makeCandidate({ id: "a", status: "placed" });
    const b = makeCandidate({ id: "b", status: "placed", updatedAt: "2026-09-05T00:00:00.000Z" });
    expect(resolveActiveCandidateId([a, b], null)).toBeNull();
    expect(resolveActiveCandidateId([a, b], "a")).toBeNull();
  });

  it("still treats a slip with no status (saved before v3) as a draft", () => {
    const legacy = makeCandidate({ id: "legacy" });
    expect(resolveActiveCandidateId([legacy], null)).toBe("legacy");
  });
});
