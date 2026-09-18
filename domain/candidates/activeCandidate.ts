import type { CandidateParlay } from "@/domain/types";

/**
 * Resolves which candidate is the "current slip": the remembered id if it
 * still refers to a real candidate, otherwise the most recently updated
 * one, otherwise null (no candidates at all). Pulled out of DataProvider
 * as a pure function so the fallback logic is unit-testable on its own.
 */
export function resolveActiveCandidateId(
  candidates: CandidateParlay[],
  storedId: string | null,
): string | null {
  if (storedId && candidates.some((c) => c.id === storedId)) return storedId;
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest), candidates[0]).id;
}
