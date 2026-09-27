import type { CandidateParlay, CandidateStatus } from "@/domain/types";

// The one place that interprets a candidate's schema-v3 fields. Candidates
// saved before v3 have none of them, so every reader goes through here rather
// than reading the optional fields directly.

/** A candidate with no status (everything saved before v3) is a draft. */
export function candidateStatus(candidate: CandidateParlay): CandidateStatus {
  return candidate.status ?? "draft";
}

export function isPlaced(candidate: CandidateParlay): boolean {
  return candidateStatus(candidate) === "placed";
}

/** The edit counter placement compares against; a candidate saved before v3 is at 0. */
export function candidateRevision(candidate: CandidateParlay): number {
  return candidate.revision ?? 0;
}
