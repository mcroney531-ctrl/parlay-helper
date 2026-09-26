import type { CandidateParlay } from "@/domain/types";
import { isPlaced } from "./candidateState";

/**
 * Resolves which candidate is the "current slip": the remembered id if it
 * still refers to a real draft, otherwise the most recently updated draft,
 * otherwise null. A placed candidate is never current (INV-7): placed status
 * is the source of truth, and the remembered id is only advisory, so a stale
 * pointer to a slip that has since been placed (in this tab or another) is
 * ignored rather than trusted. Pulled out of DataProvider as a pure function
 * so the fallback logic is unit-testable on its own.
 */
export function resolveActiveCandidateId(
  candidates: CandidateParlay[],
  storedId: string | null,
): string | null {
  const drafts = candidates.filter((c) => !isPlaced(c));
  if (storedId && drafts.some((c) => c.id === storedId)) return storedId;
  if (drafts.length === 0) return null;
  return drafts.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest), drafts[0]).id;
}
