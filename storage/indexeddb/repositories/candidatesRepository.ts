import type { CandidateParlay } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";

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
