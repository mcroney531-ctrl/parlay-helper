import type { CandidateParlay } from "@/domain/types";
import { isPlaced } from "./candidateState";

/**
 * Stored as the current-slip pointer right after a slip is placed: there is
 * deliberately no current slip until the user picks one or starts a new one.
 * A placed slip can't stay the current slip (INV-7), and silently switching
 * to some other draft would hide that the one they were working on is done.
 */
export const NO_CURRENT_SLIP = "none";

/**
 * Resolves which candidate is the "current slip". The pointer is advisory
 * and placed status is the source of truth (INV-7), so a placed candidate is
 * never returned:
 * - the remembered id, if it still names a draft;
 * - null if the pointer is NO_CURRENT_SLIP, or names a slip that has since
 *   been placed (in this tab or another): the user chooses what's next;
 * - otherwise (nothing remembered, e.g. a fresh device, or the remembered slip
 *   was deleted) the most recently updated draft, or null if there is none.
 * Pulled out of DataProvider as a pure function so it is unit-testable.
 */
export function resolveActiveCandidateId(
  candidates: CandidateParlay[],
  storedId: string | null,
): string | null {
  if (noCurrentSlipBecausePlaced(candidates, storedId)) return null;
  const drafts = candidates.filter((c) => !isPlaced(c));
  if (storedId && drafts.some((c) => c.id === storedId)) return storedId;
  if (drafts.length === 0) return null;
  return drafts.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest), drafts[0]).id;
}

/**
 * True when there is no current slip because the last one was placed (the
 * pointer is NO_CURRENT_SLIP, or still names a slip that is now placed), as
 * opposed to there simply being no draft. The Slip screen says so instead of
 * behaving as if the user had never started one.
 */
export function noCurrentSlipBecausePlaced(candidates: CandidateParlay[], storedId: string | null): boolean {
  if (storedId === NO_CURRENT_SLIP) return true;
  const named = storedId ? candidates.find((c) => c.id === storedId) : undefined;
  return named !== undefined && isPlaced(named);
}
