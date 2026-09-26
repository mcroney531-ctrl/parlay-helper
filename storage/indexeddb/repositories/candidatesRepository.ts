import type { CandidateParlay } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";
import { abandonTransaction } from "../transaction";

export async function putCandidate(candidate: CandidateParlay): Promise<void> {
  const db = await getDB();
  await db.put(STORES.candidates, candidate);
}

export async function getCandidate(id: string): Promise<CandidateParlay | undefined> {
  const db = await getDB();
  return db.get(STORES.candidates, id);
}

export async function getAllCandidates(): Promise<CandidateParlay[]> {
  const db = await getDB();
  return db.getAll(STORES.candidates);
}

export async function deleteCandidate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORES.candidates, id);
}

/**
 * Reads one candidate and writes the result of `change` in a single readwrite
 * transaction, so a check made on what was read (e.g. "not placed") can't be
 * overtaken by another write before this one lands. `change` is synchronous
 * on purpose: in a browser, awaiting anything other than an IndexedDB request
 * inside a transaction commits it early. It returns the record to write, or
 * null to write nothing; if it throws, nothing is written and the error is
 * rethrown. Resolves to the written record, or to the unchanged one on null.
 */
export async function updateCandidate(
  id: string,
  change: (existing: CandidateParlay | undefined) => CandidateParlay | null,
): Promise<CandidateParlay | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORES.candidates, "readwrite");
  try {
    const existing = await tx.store.get(id);
    const next = change(existing);
    if (next) await tx.store.put(next);
    await tx.done;
    return next ?? existing;
  } catch (error) {
    abandonTransaction(tx);
    throw error;
  }
}
