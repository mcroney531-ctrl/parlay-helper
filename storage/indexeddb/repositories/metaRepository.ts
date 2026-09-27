import { getDB } from "../db";
import { STORES } from "../schema";
import { abandonTransaction } from "../transaction";

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORES.meta, key) as Promise<T | undefined>;
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORES.meta, value, key);
}

const REFRESH_ATTEMPT_KEY = "refreshAttemptSeq";

/**
 * The next refresh-attempt number: strictly greater than every number handed
 * out before, in this tab or any other (the read and the increment are one
 * readwrite transaction on the shared database, so two tabs can't get the same
 * number). A refresh takes one when it starts, before its request goes out, so
 * the numbers order attempts by when they started, whatever order their
 * responses arrive in.
 */
export async function allocateRefreshAttempt(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(STORES.meta, "readwrite");
  try {
    const current = (await tx.store.get(REFRESH_ATTEMPT_KEY)) as number | undefined;
    const next = (typeof current === "number" && Number.isFinite(current) ? current : 0) + 1;
    await tx.store.put(next, REFRESH_ATTEMPT_KEY);
    await tx.done;
    return next;
  } catch (error) {
    abandonTransaction(tx);
    throw error;
  }
}
