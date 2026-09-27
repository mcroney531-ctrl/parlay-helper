import type { CapturedIdea } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";
import { abandonTransaction } from "../transaction";
import { liveContextReadyDB } from "./liveContextRepository";

export async function putIdea(idea: CapturedIdea): Promise<void> {
  const db = await getDB();
  await db.put(STORES.ideas, idea);
}

export async function getIdea(id: string): Promise<CapturedIdea | undefined> {
  const db = await getDB();
  return db.get(STORES.ideas, id);
}

export async function getAllIdeas(): Promise<CapturedIdea[]> {
  const db = await getDB();
  return db.getAll(STORES.ideas);
}

export async function deleteIdea(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORES.ideas, id);
}

/**
 * Reads an idea and writes `change`'s result in ONE readwrite transaction over
 * ideas and liveContext, clearing every book's cached row for the idea in the
 * same transaction when `change` asks for it. Saving the edit and clearing
 * the cache together is what makes the refresh-write guard airtight (see
 * mergeLiveContextIfIdeaCurrent): with two transactions, a refresh write could
 * land between them, see the old idea, and leave the old price on the edited
 * one. `change` is synchronous and may throw to write nothing.
 */
export async function updateIdeaWithLiveContext(
  id: string,
  change: (existing: CapturedIdea | undefined) => { idea: CapturedIdea; clearLiveContext: boolean },
): Promise<CapturedIdea> {
  const db = await liveContextReadyDB();
  const tx = db.transaction([STORES.ideas, STORES.liveContext], "readwrite");
  try {
    const existing = await tx.objectStore(STORES.ideas).get(id);
    const { idea, clearLiveContext } = change(existing);
    await tx.objectStore(STORES.ideas).put(idea);
    if (clearLiveContext) {
      const liveContext = tx.objectStore(STORES.liveContext);
      const keys = await liveContext.index("by-ideaId").getAllKeys(id);
      for (const key of keys) await liveContext.delete(key);
    }
    await tx.done;
    return idea;
  } catch (error) {
    abandonTransaction(tx);
    throw error;
  }
}
