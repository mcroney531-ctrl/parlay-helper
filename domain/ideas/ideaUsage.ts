import type { CandidateParlay, FinalizedParlay } from "@/domain/types";
import { isPlaced } from "@/domain/candidates/candidateState";

/**
 * Where each idea is used, derived from slips and History; nothing is
 * stored. The Ideas badges ("Placed", "In N slips") and the Hide placed
 * filter all read this one result, so they can't disagree.
 */
export type IdeaUsage = {
  /**
   * Ideas that are a leg of any History record, legacy records included:
   * every record stores each leg's ideaId, so nothing is inferred, and a
   * placement still counts after its slip is deleted.
   */
  placed: ReadonlySet<string>;
  /** For each idea, the draft slips it is a leg of. Placed slips never count here. */
  draftSlips: ReadonlyMap<string, ReadonlySet<string>>;
};

/**
 * Placed comes only from History and draft membership only from draft
 * slips, so a placed slip and its History record make one "placed" and no
 * drafts, and the two are never added together. Draft membership is a set of
 * slip ids, so a slip listing an idea twice still counts once.
 */
export function ideaUsage(candidates: readonly CandidateParlay[], finalized: readonly FinalizedParlay[]): IdeaUsage {
  const placed = new Set<string>();
  for (const record of finalized) {
    for (const leg of record.legSnapshots) placed.add(leg.ideaId);
  }
  const draftSlips = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (isPlaced(candidate)) continue;
    for (const ideaId of candidate.ideaIds) {
      const slips = draftSlips.get(ideaId) ?? new Set<string>();
      slips.add(candidate.id);
      draftSlips.set(ideaId, slips);
    }
  }
  return { placed, draftSlips };
}

/** How many draft slips the idea is a leg of. */
export function draftSlipCount(usage: IdeaUsage, ideaId: string): number {
  return usage.draftSlips.get(ideaId)?.size ?? 0;
}

export function isIdeaPlaced(usage: IdeaUsage, ideaId: string): boolean {
  return usage.placed.has(ideaId);
}
