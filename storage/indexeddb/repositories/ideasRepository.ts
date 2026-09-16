import type { CapturedIdea } from "@/domain/types";
import { getDB } from "../db";
import { STORES } from "../schema";

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
