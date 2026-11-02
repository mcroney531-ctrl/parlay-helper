import type { CandidateParlay } from "@/domain/types";

/** Add mode's slip that's gone: placed (named), or deleted. */
export type StaleAdd = { slipId: string; placedName: string | null };

/** The one line shown when add mode's slip is gone, and where the cards add now. */
export function staleAddText(stale: StaleAdd, current: CandidateParlay | null): string {
  const gone = stale.placedName ? `${stale.placedName} was placed.` : "The slip you were adding to was deleted.";
  return current ? `${gone} You're adding to ${current.name}.` : `${gone} Pick a slip when you add.`;
}

export function StaleAddNote({ stale, current }: { stale: StaleAdd; current: CandidateParlay | null }) {
  return (
    <p role="status" className="rounded-[var(--radius-control)] px-4 py-3 text-sm" style={{ background: "var(--color-info-bg)", color: "var(--color-info)" }}>
      {staleAddText(stale, current)}
    </p>
  );
}
