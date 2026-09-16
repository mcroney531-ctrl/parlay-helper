import { openDB, type IDBPDatabase, type DBSchema } from "idb";
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
    key: string;
    value: LiveContext;
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
    };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<ParlayHelperDB>> | null = null;

function runMigrations(db: IDBPDatabase<ParlayHelperDB>, oldVersion: number): void {
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

  // Future migrations append additional `if (oldVersion < N)` blocks here,
  // each one only ever moving forward from whatever the previous version left behind.
}

export function getDB(): Promise<IDBPDatabase<ParlayHelperDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB<ParlayHelperDB>(DB_NAME, SCHEMA_VERSION, {
      upgrade: runMigrations,
    });
  }
  return dbPromise;
}

// Test-only escape hatch: lets tests point the repository layer at a fresh
// fake-indexeddb instance instead of the memoized singleton.
export function __setDBForTests(db: IDBPDatabase<ParlayHelperDB> | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}
