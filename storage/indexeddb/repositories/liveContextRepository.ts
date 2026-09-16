import type { LiveContext } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";

export async function putLiveContext(context: LiveContext): Promise<void> {
  const db = await getDB();
  await db.put(STORES.liveContext, context);
}

export async function getLiveContext(ideaId: string): Promise<LiveContext | undefined> {
  const db = await getDB();
  return db.get(STORES.liveContext, ideaId);
}

export async function getAllLiveContext(): Promise<LiveContext[]> {
  const db = await getDB();
  return db.getAll(STORES.liveContext);
}
