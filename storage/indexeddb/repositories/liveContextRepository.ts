import type { LiveContext } from "@/domain/types";
import { canonicalSportsbookId } from "@/domain/sportsbook";
import { getDB, type ParlayHelperDB } from "../db";
import { STORES } from "../schema";
import type { IDBPDatabase } from "idb";

/** Single source of truth for the (ideaId, sportsbook) composite key shape used by callers that key their own lookup maps. */
export function liveContextKey(ideaId: string, sportsbook: string): string {
  return `${ideaId}::${storeBook(sportsbook)}`;
}

/** The book half of the IDB key: canonical, or the raw text only when it has no letters or digits at all. */
function storeBook(sportsbook: string): string {
  return canonicalSportsbookId(sportsbook) ?? sportsbook;
}

function isNewer(candidate: LiveContext, than: LiveContext): boolean {
  const a = candidate.oddsFetchedAt ?? "";
  const b = than.oddsFetchedAt ?? "";
  if (a !== b) return a > b;
  return candidate.fetchedAt > than.fetchedAt;
}

/**
 * Rows written before sportsbook identity was canonical are keyed by whatever
 * the user typed ("FanDuel", "Fan Duel"), so the same book can hold several
 * rows and a canonical lookup would miss them. This rewrites them once per
 * connection, in one transaction: rows for the same idea and canonical book
 * collapse into one (the most recent price fetch wins, whole row, never a
 * field merge) and the typed text moves to sportsbookLabel. Distinct books are
 * never merged. Idempotent; a database with nothing to rekey is untouched.
 */
async function rekeyLegacyRows(db: IDBPDatabase<ParlayHelperDB>): Promise<void> {
  const tx = db.transaction(STORES.liveContext, "readwrite");
  const store = tx.objectStore(STORES.liveContext);
  const rows = await store.getAll();

  const groups = new Map<string, LiveContext[]>();
  for (const row of rows) {
    const canonical = canonicalSportsbookId(row.sportsbook);
    if (canonical === null) continue;
    const key = `${row.ideaId}::${canonical}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  for (const [, group] of groups) {
    const canonical = canonicalSportsbookId(group[0].sportsbook) as string;
    if (group.every((row) => row.sportsbook === canonical)) continue;

    let winner = group[0];
    for (const row of group) {
      if (isNewer(row, winner) || (!isNewer(winner, row) && row.sportsbook === canonical)) winner = row;
    }
    // The winner's own typed text first; a losing row's text only when the winner has none
    // (a row that was already canonical), so the label never contradicts the row that won.
    const label =
      winner.sportsbookLabel ??
      (winner.sportsbook !== canonical ? winner.sportsbook : undefined) ??
      group.find((row) => row.sportsbookLabel)?.sportsbookLabel ??
      group.find((row) => row.sportsbook !== canonical)?.sportsbook;

    for (const row of group) await store.delete([row.ideaId, row.sportsbook]);
    await store.put({ ...winner, sportsbook: canonical, ...(label ? { sportsbookLabel: label } : {}) });
  }
  await tx.done;
}

const rekeyed = new WeakMap<object, Promise<void>>();

async function readyDB(): Promise<IDBPDatabase<ParlayHelperDB>> {
  const db = await getDB();
  let pending = rekeyed.get(db);
  if (!pending) {
    // Rekeying is cache maintenance: if it fails, reads and writes must still work.
    // Legacy rows are simply not found until the next connection retries it.
    pending = rekeyLegacyRows(db).catch((error) => {
      console.warn("Could not rekey legacy live-context rows; continuing without.", error);
    });
    rekeyed.set(db, pending);
  }
  await pending;
  return db;
}

/**
 * Always stored under the canonical book id. The text the caller passed is
 * kept as sportsbookLabel unless the caller already supplied a label.
 */
export async function putLiveContext(context: LiveContext): Promise<void> {
  const db = await readyDB();
  const canonical = canonicalSportsbookId(context.sportsbook);
  if (canonical === null) {
    await db.put(STORES.liveContext, context);
    return;
  }
  await db.put(STORES.liveContext, {
    ...context,
    sportsbook: canonical,
    sportsbookLabel: context.sportsbookLabel ?? (context.sportsbook.trim() || undefined),
  });
}

/** Scoped to one (idea, sportsbook) pair — a candidate's price/status never bleeds into another book's slip. Spelling variants of the same book resolve to the same row. */
export async function getLiveContext(ideaId: string, sportsbook: string): Promise<LiveContext | undefined> {
  const db = await readyDB();
  return db.get(STORES.liveContext, [ideaId, storeBook(sportsbook)]);
}

export async function getAllLiveContext(): Promise<LiveContext[]> {
  const db = await readyDB();
  return db.getAll(STORES.liveContext);
}

/** Removes every book's row for one idea, in one transaction. */
export async function deleteLiveContextForIdea(ideaId: string): Promise<void> {
  const db = await readyDB();
  const tx = db.transaction(STORES.liveContext, "readwrite");
  const keys = await tx.store.index("by-ideaId").getAllKeys(ideaId);
  for (const key of keys) await tx.store.delete(key);
  await tx.done;
}
