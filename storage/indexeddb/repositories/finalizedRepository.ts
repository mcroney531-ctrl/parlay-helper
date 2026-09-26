import type { FinalizedParlay } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";

export async function putFinalizedParlay(parlay: FinalizedParlay): Promise<void> {
  const db = await getDB();
  await db.put(STORES.finalized, parlay);
}

export async function getAllFinalizedParlays(): Promise<FinalizedParlay[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORES.finalized, "by-finalizedAt");
  return all.reverse();
}

export async function getFinalizedParlay(id: string): Promise<FinalizedParlay | undefined> {
  const db = await getDB();
  return db.get(STORES.finalized, id);
}

/** The id of the finalized record that placed this candidate, if any (records from before v3 name none). */
export async function getFinalizedIdForCandidate(candidateId: string): Promise<string | undefined> {
  const db = await getDB();
  return db.getKeyFromIndex(STORES.finalized, "by-candidateId", candidateId);
}
