import type { CandidateParlay } from "@/domain/types";
import { DEFAULT_STAKE_CENTS } from "@/domain/types";
import {
  deleteCandidate as deleteCandidateFromStore,
  getAllCandidates,
  getCandidate,
  putCandidate,
  updateCandidate,
} from "@/storage/indexeddb/repositories/candidatesRepository";
import { candidateRevision, isPlaced } from "./candidateState";
import { CandidateNotFoundError, CandidatePlacedError } from "./errors";
import { recordOwnRevision, trackOwnEdit } from "./ownEdits";

function newId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function createCandidate(name: string, sportsbook: string): Promise<CandidateParlay> {
  const timestamp = nowISO();
  const candidate: CandidateParlay = {
    id: newId(),
    name: name.trim() || "Untitled candidate",
    sportsbook,
    ideaIds: [],
    stakeCents: DEFAULT_STAKE_CENTS,
    promoLabel: "",
    promoMaxStakeCents: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    // Written explicitly so that a missing status/revision only ever means a
    // candidate saved before schema v3.
    status: "draft",
    revision: 0,
  };
  await putCandidate(candidate);
  return candidate;
}

export async function cloneCandidate(id: string, newName?: string): Promise<CandidateParlay> {
  const source = await getCandidate(id);
  if (!source) {
    throw new CandidateNotFoundError(id);
  }
  const timestamp = nowISO();
  // Copy the slip's contents but none of its placement state: a clone of a
  // placed slip is a brand-new draft, and the source is left untouched.
  const clone: CandidateParlay = {
    ...source,
    id: newId(),
    name: newName?.trim() || `${source.name} (copy)`,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "draft",
    revision: 0,
  };
  delete clone.placedAt;
  await putCandidate(clone);
  return clone;
}

/**
 * The one way a draft candidate is edited (INV-2). In a single transaction:
 * the candidate must exist (CandidateNotFoundError) and must not be placed
 * (CandidatePlacedError); `edit` then returns the changed fields, or null when
 * the edit changes nothing, in which case nothing is written and the revision
 * stays put, so a no-op (re-saving the same stake on blur) can't make a
 * pending placement look stale. A real change bumps both updatedAt and the
 * revision placement compares against (INV-6).
 *
 * Each edit is registered with ownEdits as soon as it starts, and the revision
 * it produced is recorded once it commits, so a placement started from this
 * tab waits for it and counts it as seen (see ownEdits.ts).
 */
function editDraft(
  id: string,
  edit: (existing: CandidateParlay) => Partial<CandidateParlay> | null,
): Promise<CandidateParlay> {
  return trackOwnEdit(
    id,
    (async () => {
      // Set inside the transaction when a change is written: the revision it was made from.
      const write: { from?: number } = {};
      const result = await updateCandidate(id, (existing) => {
        if (!existing) throw new CandidateNotFoundError(id);
        if (isPlaced(existing)) throw new CandidatePlacedError(id);
        const changes = edit(existing);
        if (!changes) return null;
        const from = candidateRevision(existing);
        write.from = from;
        return { ...existing, ...changes, updatedAt: nowISO(), revision: from + 1 };
      });
      // Only reached once the transaction has committed.
      if (write.from !== undefined) recordOwnRevision(id, write.from, write.from + 1);
      // editDraft throws rather than write nothing for a missing candidate, so a result is always there.
      return result as CandidateParlay;
    })(),
  );
}

export async function renameCandidate(id: string, name: string): Promise<CandidateParlay> {
  return editDraft(id, (existing) => {
    const next = name.trim() || existing.name;
    return next === existing.name ? null : { name: next };
  });
}

export async function setCandidateSportsbook(id: string, sportsbook: string): Promise<CandidateParlay> {
  return editDraft(id, (existing) => (sportsbook === existing.sportsbook ? null : { sportsbook }));
}

export async function setCandidateStake(id: string, stakeCents: number): Promise<CandidateParlay> {
  return editDraft(id, (existing) => {
    const next = Math.max(0, Math.round(stakeCents));
    return next === existing.stakeCents ? null : { stakeCents: next };
  });
}

export async function setCandidatePromo(
  id: string,
  promoLabel: string,
  promoMaxStakeCents: number | null,
): Promise<CandidateParlay> {
  return editDraft(id, (existing) =>
    promoLabel === existing.promoLabel && promoMaxStakeCents === existing.promoMaxStakeCents
      ? null
      : { promoLabel, promoMaxStakeCents },
  );
}

export async function addLegToCandidate(candidateId: string, ideaId: string): Promise<CandidateParlay> {
  return editDraft(candidateId, (existing) =>
    existing.ideaIds.includes(ideaId) ? null : { ideaIds: [...existing.ideaIds, ideaId] },
  );
}

export async function removeLegFromCandidate(candidateId: string, ideaId: string): Promise<CandidateParlay> {
  return editDraft(candidateId, (existing) =>
    existing.ideaIds.includes(ideaId) ? { ideaIds: existing.ideaIds.filter((id) => id !== ideaId) } : null,
  );
}

/**
 * Allowed on a draft or a placed candidate (INV-15). Only the candidates store
 * is touched: the History record of a placed slip is kept, and from then on
 * renders like a legacy record.
 */
export async function deleteCandidate(id: string): Promise<void> {
  await deleteCandidateFromStore(id);
}

export async function listCandidates(): Promise<CandidateParlay[]> {
  const all = await getAllCandidates();
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export { getCandidate };
