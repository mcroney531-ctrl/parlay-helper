import type { CapturedIdea, LiveContext } from "@/domain/types";
import { canonicalSportsbookId } from "@/domain/sportsbook";
import { getDB, type ParlayHelperDB } from "../db";
import { STORES } from "../schema";
import { abandonTransaction } from "../transaction";
import type { IDBPDatabase } from "idb";

/** Single source of truth for the (ideaId, sportsbook) composite key shape used by callers that key their own lookup maps. */
export function liveContextKey(ideaId: string, sportsbook: string): string {
  return `${ideaId}::${storeBook(sportsbook)}`;
}

/** The IDB key a row for (idea, sportsbook) is stored under, for reads inside a caller's own transaction. */
export function liveContextStoreKey(ideaId: string, sportsbook: string): [string, string] {
  return [ideaId, storeBook(sportsbook)];
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

/**
 * getDB, once this connection's legacy rekey has run. Exported for code that
 * reads live context inside its own transaction (placement): the rekey is its
 * own transaction and has to finish before that one starts.
 */
export async function liveContextReadyDB(): Promise<IDBPDatabase<ParlayHelperDB>> {
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
  const db = await liveContextReadyDB();
  await db.put(STORES.liveContext, toStored(context));
}

/** The row as stored: under the canonical book id, keeping the caller's text as sportsbookLabel. */
function toStored(context: LiveContext): LiveContext {
  const canonical = canonicalSportsbookId(context.sportsbook);
  if (canonical === null) return context;
  return {
    ...context,
    sportsbook: canonical,
    sportsbookLabel: context.sportsbookLabel ?? (context.sportsbook.trim() || undefined),
  };
}

/**
 * One refresh write: which half of the row it writes, the attempt it came from
 * (allocateRefreshAttempt, taken when the attempt started), and whether it is
 * a market OBSERVATION. A successful fetch and a genuine not_found (the book
 * doesn't list the market) are observations; a provider/network/transport
 * error observed nothing about the market and is not.
 */
export type RefreshAttempt = { source: "odds" | "playerStatus"; seq: number; observation: boolean };

/**
 * written: the result was stored. idea-changed: the idea's price identity
 * changed, or it was deleted, since the request (INV-13). superseded: a newer
 * market observation (from a refresh that started later) is already stored
 * for this half of the row.
 */
export type RefreshWriteOutcome = "written" | "idea-changed" | "superseded";

/**
 * Writes one refresh result for (idea, sportsbook) in ONE readwrite
 * transaction over ideas and liveContext, and only if:
 * - the idea is still the one it was fetched for (`stillCurrent`; INV-13),
 *   else nothing is written ("idea-changed"); and
 * - the row doesn't already hold a NEWER market observation for this half
 *   (odds or player status): the observation stamp (oddsAttempt /
 *   playerStatusAttempt) names the attempt whose observation is stored, and if
 *   it is later than this attempt nothing is written ("superseded"). This
 *   holds for every write, so a stale error can't crowd out a fresh price
 *   either.
 * Otherwise the row becomes `build(existing)`. Only an OBSERVATION advances
 * this half's stamp to this attempt; a non-observation (an error: warnings
 * only) is written without touching it, so it can never block an older
 * attempt's real observation that arrives after it. The other half's stamp is
 * always kept as it was.
 *
 * The invariant (Phase 3 chunk 2, as corrected): for the same idea identity,
 * an older market observation never overwrites a newer market observation.
 * Attempts that fail before observing market state don't take part in the
 * ordering, because the absence of knowledge shouldn't outrank a real
 * observation.
 *
 * Because the idea edit (updateIdeaWithLiveContext) is also one transaction
 * over both stores, the two can't interleave, and because the attempt check
 * and the write share this transaction, two refreshes' writes can't interleave
 * either. `stillCurrent` and `build` are synchronous on purpose: awaiting
 * anything but an IndexedDB request inside the transaction would commit it
 * early.
 */
export async function mergeLiveContextIfIdeaCurrent(
  ideaId: string,
  sportsbook: string,
  attempt: RefreshAttempt,
  stillCurrent: (idea: CapturedIdea | undefined) => boolean,
  build: (existing: LiveContext | undefined) => LiveContext,
): Promise<RefreshWriteOutcome> {
  const db = await liveContextReadyDB();
  const tx = db.transaction([STORES.ideas, STORES.liveContext], "readwrite");
  try {
    const idea = await tx.objectStore(STORES.ideas).get(ideaId);
    if (!stillCurrent(idea)) {
      await tx.done;
      return "idea-changed";
    }
    const store = tx.objectStore(STORES.liveContext);
    const existing = await store.get(liveContextStoreKey(ideaId, sportsbook));
    const stampField = attempt.source === "odds" ? "oddsAttempt" : "playerStatusAttempt";
    // A row written before attempts were stamped reads as 0: older than any attempt.
    if ((existing?.[stampField] ?? 0) > attempt.seq) {
      await tx.done;
      return "superseded";
    }
    const next: LiveContext = { ...build(existing) };
    // The stamps are kept here, not left to `build`, so no caller can drop them.
    if (existing?.oddsAttempt !== undefined) next.oddsAttempt = existing.oddsAttempt;
    if (existing?.playerStatusAttempt !== undefined) next.playerStatusAttempt = existing.playerStatusAttempt;
    if (attempt.observation) next[stampField] = attempt.seq;
    await store.put(toStored(next));
    await tx.done;
    return "written";
  } catch (error) {
    abandonTransaction(tx);
    throw error;
  }
}

/** Scoped to one (idea, sportsbook) pair — a candidate's price/status never bleeds into another book's slip. Spelling variants of the same book resolve to the same row. */
export async function getLiveContext(ideaId: string, sportsbook: string): Promise<LiveContext | undefined> {
  const db = await liveContextReadyDB();
  return db.get(STORES.liveContext, liveContextStoreKey(ideaId, sportsbook));
}

export async function getAllLiveContext(): Promise<LiveContext[]> {
  const db = await liveContextReadyDB();
  return db.getAll(STORES.liveContext);
}
