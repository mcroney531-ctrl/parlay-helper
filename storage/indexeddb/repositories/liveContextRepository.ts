import type { LiveContext } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";

/** Single source of truth for the (ideaId, sportsbook) composite key shape used by callers that key their own lookup maps. */
export function liveContextKey(ideaId: string, sportsbook: string): string {
  return `${ideaId}::${sportsbook}`;
}

export async function putLiveContext(context: LiveContext): Promise<void> {
  const db = await getDB();
  await db.put(STORES.liveContext, context);
}

/** Scoped to one (idea, sportsbook) pair — a candidate's price/status never bleeds into another book's slip. */
export async function getLiveContext(ideaId: string, sportsbook: string): Promise<LiveContext | undefined> {
  const db = await getDB();
  return db.get(STORES.liveContext, [ideaId, sportsbook]);
}

export async function getAllLiveContext(): Promise<LiveContext[]> {
  const db = await getDB();
  return db.getAll(STORES.liveContext);
}
