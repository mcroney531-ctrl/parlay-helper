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
