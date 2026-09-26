import { openDB, type IDBPDatabase, type IDBPTransaction, type DBSchema, type StoreNames } from "idb";
import type { CandidateParlay, CapturedIdea, FinalizedParlay, LiveContext } from "@/domain/types";
import { DB_NAME, SCHEMA_VERSION, STORES } from "./schema";

export interface ParlayHelperDB extends DBSchema {
  ideas: {
    key: string;
    value: CapturedIdea;
    indexes: {
      "by-archivedAt": string;
      "by-slateDate": string;
      "by-detailsStatus": string;
    };
  };
  liveContext: {
    key: [string, string];
    value: LiveContext;
    indexes: {
      "by-ideaId": string;
    };
  };
  candidates: {
    key: string;
    value: CandidateParlay;
  };
  finalized: {
    key: string;
    value: FinalizedParlay;
    indexes: {
      "by-finalizedAt": string;
      "by-candidateId": string;
    };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

type UpgradeTransaction = IDBPTransaction<ParlayHelperDB, StoreNames<ParlayHelperDB>[], "versionchange">;

let dbPromise: Promise<IDBPDatabase<ParlayHelperDB>> | null = null;

function runMigrations(db: IDBPDatabase<ParlayHelperDB>, oldVersion: number, transaction: UpgradeTransaction): void {
  // v0 -> v1: initial schema.
  if (oldVersion < 1) {
    const ideas = db.createObjectStore(STORES.ideas, { keyPath: "id" });
    ideas.createIndex("by-archivedAt", "archivedAt");
    ideas.createIndex("by-slateDate", "slateDate");
    ideas.createIndex("by-detailsStatus", "detailsStatus");

    db.createObjectStore(STORES.liveContext, { keyPath: "ideaId" });

    db.createObjectStore(STORES.candidates, { keyPath: "id" });

    const finalized = db.createObjectStore(STORES.finalized, { keyPath: "id" });
    finalized.createIndex("by-finalizedAt", "finalizedAt");

    db.createObjectStore(STORES.meta);
  }

  // v1 -> v2: liveContext moves from keyed-by-ideaId to a compound
  // (ideaId, sportsbook) key. A single idea used in candidates on two
  // different books must never share one cached price/status record.
  // LiveContext is a refreshable cache, not user-authored data, so the
  // migration drops and recreates the store rather than trying to
  // reshape existing rows.
  if (oldVersion < 2) {
    db.deleteObjectStore(STORES.liveContext);
    const liveContext = db.createObjectStore(STORES.liveContext, { keyPath: ["ideaId", "sportsbook"] });
    liveContext.createIndex("by-ideaId", "ideaId");
  }

  // v2 -> v3: placed-state model. A candidate gains optional status /
  // placedAt / revision, and a finalized record an optional candidateId
  // naming the candidate it placed. No record is read or rewritten here:
  // candidates without a status are drafts, and records written before v3 keep
  // no candidateId, because which candidate they came from is never inferred.
  //
  // The one structural change is a UNIQUE index on finalized.candidateId, so
  // the store itself refuses a second record for the same candidate. Records
  // without the field are left out of the index, so existing History can't
  // violate it. A key of "" would be indexed like any other, so writers must
  // never store an empty candidateId.
  //
  // "The version the user saw" for placement is candidate.revision, an edit
  // counter, rather than updatedAt. updatedAt would work for a single user
  // editing by hand on one device, since two edits to the same slip in one
  // millisecond are practically impossible that way. But it is a wall-clock
  // value that also orders the most-recently-updated fallback, so a check built
  // on it would depend on the device clock. The counter is exact, costs one
  // optional field that reads as 0 on older candidates (so nothing is
  // rewritten here), and is incremented by the same writes that already bump
  // updatedAt.
  //
  // The index is added to an existing store, which is only possible through
  // the upgrade transaction; on a fresh install the store was created above
  // in this same transaction.
  if (oldVersion < 3) {
    transaction.objectStore(STORES.finalized).createIndex("by-candidateId", "candidateId", { unique: true });
  }

  // Future migrations append additional `if (oldVersion < N)` blocks here,
  // each one only ever moving forward from whatever the previous version left behind.
}

/**
 * Something the user has to act on before storage can work: another tab is
 * holding an older version open (the upgrade is waiting), this tab's
 * connection was closed so a newer version could open, or storage is from a
 * newer version of the app than this one.
 */
export type DatabaseNotice =
  | { kind: "upgrade-blocked"; message: string }
  | { kind: "upgrade-unblocked" }
  | { kind: "closed-for-newer-version"; message: string };

export const UPGRADE_BLOCKED_MESSAGE =
  "Parlay Helper was updated. Close any other Parlay Helper tabs or windows to finish updating your saved data.";
export const CLOSED_FOR_NEWER_VERSION_MESSAGE =
  "Parlay Helper was updated in another tab or window. Reload this page to keep using it.";

/** Storage belongs to a newer version of the app than the one running (IndexedDB's VersionError). */
export class DatabaseVersionError extends Error {
  constructor() {
    super("Your saved data is from a newer version of Parlay Helper. Reload the page to get the latest version.");
    this.name = "DatabaseVersionError";
  }
}

const listeners = new Set<(notice: DatabaseNotice) => void>();

export function subscribeToDatabaseNotices(listener: (notice: DatabaseNotice) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(notice: DatabaseNotice): void {
  for (const listener of listeners) listener(notice);
}

export function getDB(): Promise<IDBPDatabase<ParlayHelperDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    let wasBlocked = false;
    const opening = openDB<ParlayHelperDB>(DB_NAME, SCHEMA_VERSION, {
      upgrade: (db, oldVersion, _newVersion, transaction) => runMigrations(db, oldVersion, transaction),
      // An older connection elsewhere hasn't closed. The open stays pending
      // until it does; say so instead of sitting on "Loading".
      blocked: () => {
        wasBlocked = true;
        notify({ kind: "upgrade-blocked", message: UPGRADE_BLOCKED_MESSAGE });
      },
      // A newer version is waiting on this connection: step aside so its
      // upgrade can run, and have this tab reload rather than keep using a
      // schema it no longer matches.
      blocking: (_currentVersion, _blockedVersion, event) => {
        (event.target as IDBDatabase).close();
        if (dbPromise === opening) dbPromise = null;
        notify({ kind: "closed-for-newer-version", message: CLOSED_FOR_NEWER_VERSION_MESSAGE });
      },
      terminated: () => {
        if (dbPromise === opening) dbPromise = null;
      },
    }).then(
      (db) => {
        if (wasBlocked) notify({ kind: "upgrade-unblocked" });
        return db;
      },
      (error: unknown) => {
        // Don't memoize a failure: a later call gets a fresh attempt.
        if (dbPromise === opening) dbPromise = null;
        if (error instanceof DOMException && error.name === "VersionError") throw new DatabaseVersionError();
        throw error;
      },
    );
    dbPromise = opening;
  }
  return dbPromise;
}

// Test-only escape hatch: lets tests point the repository layer at a fresh
// fake-indexeddb instance instead of the memoized singleton.
export function __setDBForTests(db: IDBPDatabase<ParlayHelperDB> | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}
