import { getDB } from "../db";
import { STORES } from "../schema";

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORES.meta, key) as Promise<T | undefined>;
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORES.meta, value, key);
}
