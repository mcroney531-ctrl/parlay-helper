import type { CandidateParlay, FinalizedParlay } from "@/domain/types";
import { isPlaced } from "@/domain/candidates/candidateState";

/**
 * The placed slip a History record came from, when it can still be acted on
 * (cloned or deleted) from History: the record names a candidate (v3+,
 * INV-4) and that candidate still exists and is placed. Null for a legacy
 * record (no candidateId, never inferred: INV-8) and for one whose slip was
 * deleted (INV-15); both render as plain records with no slip actions. The
 * record itself never depends on the slip (INV-10).
 */
export function placedSlipFor(record: FinalizedParlay, candidates: CandidateParlay[]): CandidateParlay | null {
  if (!record.candidateId) return null;
  const slip = candidates.find((c) => c.id === record.candidateId);
  return slip && isPlaced(slip) ? slip : null;
}

/** INV-15's confirm text: deleting a placed slip never touches its History record. */
export function deletePlacedSlipConfirmText(slipName: string): string {
  return `Delete the slip "${slipName}"? Its History record stays exactly as it is; you just won't be able to clone it from here anymore.`;
}
