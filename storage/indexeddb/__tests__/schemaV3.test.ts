import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { deleteDB, openDB, type IDBPDatabase } from "idb";
import {
  CLOSED_FOR_NEWER_VERSION_MESSAGE,
  DatabaseVersionError,
  UPGRADE_BLOCKED_MESSAGE,
  __setDBForTests,
  getDB,
  nextDatabaseNotice,
  subscribeToDatabaseNotices,
  type DatabaseNotice,
} from "../db";
import { DB_NAME, SCHEMA_VERSION, STORES } from "../schema";
import { listFinalizedParlays } from "@/domain/history/finalizeService";
import { candidateRevision, candidateStatus, isPlaced } from "@/domain/candidates/candidateState";
import type { CandidateParlay, FinalizedParlay } from "@/domain/types";

let unsubscribe: (() => void) | null = null;

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  __setDBForTests(null);
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

// A frozen copy of the schema as versions 1 and 2 of the app created it, so
// upgrades are tested from the real older shapes rather than from whatever
// today's migration code would produce.
async function openLegacy(version: 1 | 2): Promise<IDBPDatabase> {
  return openDB(DB_NAME, version, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const ideas = db.createObjectStore("ideas", { keyPath: "id" });
        ideas.createIndex("by-archivedAt", "archivedAt");
        ideas.createIndex("by-slateDate", "slateDate");
        ideas.createIndex("by-detailsStatus", "detailsStatus");
        db.createObjectStore("liveContext", { keyPath: "ideaId" });
        db.createObjectStore("candidates", { keyPath: "id" });
        const finalized = db.createObjectStore("finalized", { keyPath: "id" });
        finalized.createIndex("by-finalizedAt", "finalizedAt");
        db.createObjectStore("meta");
      }
      if (version >= 2 && oldVersion < 2) {
        db.deleteObjectStore("liveContext");
        const liveContext = db.createObjectStore("liveContext", { keyPath: ["ideaId", "sportsbook"] });
        liveContext.createIndex("by-ideaId", "ideaId");
      }
    },
  });
}

const legacyCandidate: CandidateParlay = {
  id: "cand-legacy",
  name: "Sunday Core",
  sportsbook: "FanDuel",
  ideaIds: ["idea-1"],
  stakeCents: 500,
  promoLabel: "",
  promoMaxStakeCents: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
};

function legacyFinalized(id: string, finalizedAt: string, withPlayerId: boolean): FinalizedParlay {
  return {
    id,
    candidateName: "Sunday Core",
    sportsbook: "FanDuel",
    legSnapshots: [
      {
        ideaId: "idea-1",
        ...(withPlayerId ? { playerId: "p-1" } : {}),
        playerName: "Puka Nacua",
        team: null,
        opponent: null,
        eventId: "evt-1",
        marketLabel: "Receiving Yards",
        selection: "over",
        lineAtCapture: 63.5,
        oddsAtCaptureAmerican: -110,
        lineAtFinalize: 64.5,
        oddsAtFinalizeAmerican: -115,
        sportsbookAtCapture: "FanDuel",
      },
    ],
    stakeCents: 500,
    estimatedOddsAmerican: -115,
    estimatedPayoutCents: 935,
    actualSportsbookOddsAmerican: null,
    actualSportsbookPayoutCents: null,
    promoLabel: "",
    promoMaxStakeCents: null,
    sportsbookBetId: "",
    note: "",
    finalizedAt,
  };
}

async function seedV2(): Promise<Record<string, unknown[]>> {
  const db = await openLegacy(2);
  const seeded = {
    ideas: [{ id: "idea-1", rawText: "Puka o63.5", detailsStatus: "structured", archivedAt: null, slateDate: null }],
    candidates: [legacyCandidate],
    // Two pre-v3 records: neither has candidateId, and one predates playerId.
    finalized: [legacyFinalized("fin-old", "2026-09-03T12:00:00.000Z", false), legacyFinalized("fin-newer", "2026-09-04T12:00:00.000Z", true)],
    liveContext: [{ ideaId: "idea-1", sportsbook: "fanduel", currentOddsAmerican: -115 }],
  };
  for (const [store, rows] of Object.entries(seeded)) for (const row of rows) await db.put(store as never, row as never);
  await db.put("meta" as never, "remembered" as never, "some-key" as never);
  db.close();
  return seeded;
}

/** Stores, key paths and indexes, so two databases can be compared schema-for-schema. */
function describeSchema(db: IDBPDatabase): unknown {
  const tx = db.transaction([...db.objectStoreNames], "readonly");
  return [...db.objectStoreNames].sort().map((name) => {
    const store = tx.objectStore(name);
    return {
      name,
      keyPath: store.keyPath,
      indexes: [...store.indexNames].sort().map((indexName) => {
        const index = store.index(indexName);
        return { indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
      }),
    };
  });
}

describe("schema v3 migration", () => {
  it("is version 3 and adds a unique by-candidateId index to finalized", async () => {
    const db = await getDB();
    expect(SCHEMA_VERSION).toBe(3);
    expect(db.version).toBe(3);
    const index = db.transaction(STORES.finalized).store.index("by-candidateId");
    expect(index.keyPath).toBe("candidateId");
    expect(index.unique).toBe(true);
  });

  it("upgrades a v2 database without losing or changing any record (INV-9)", async () => {
    const seeded = await seedV2();
    const db = await getDB();

    expect(db.version).toBe(3);
    // getAll returns rows in key order, so compare against the seeded rows in that order.
    const byKey = (row: unknown) => JSON.stringify((row as { id?: string; ideaId?: string }).id ?? (row as { ideaId: string }).ideaId);
    for (const [store, rows] of Object.entries(seeded)) {
      const expected = [...rows].sort((a, b) => byKey(a).localeCompare(byKey(b)));
      expect(await db.getAll(store as never)).toEqual(expected);
    }
    expect(await db.get(STORES.meta, "some-key")).toBe("remembered");
  });

  it("leaves pre-v3 History unlinked and readable exactly as before (INV-8)", async () => {
    await seedV2();
    const history = await listFinalizedParlays();

    expect(history.map((record) => record.id)).toEqual(["fin-newer", "fin-old"]);
    for (const record of history) expect("candidateId" in record).toBe(false);
    expect("playerId" in history[1].legSnapshots[0]).toBe(false);
    expect(history).toEqual([
      legacyFinalized("fin-newer", "2026-09-04T12:00:00.000Z", true),
      legacyFinalized("fin-old", "2026-09-03T12:00:00.000Z", false),
    ]);
  });

  it("reads a candidate saved before v3 as a draft at revision 0 (INV-1)", async () => {
    await seedV2();
    const db = await getDB();
    const candidate = (await db.get(STORES.candidates, "cand-legacy")) as CandidateParlay;

    expect("status" in candidate).toBe(false);
    expect(candidateStatus(candidate)).toBe("draft");
    expect(isPlaced(candidate)).toBe(false);
    expect(candidateRevision(candidate)).toBe(0);
    expect(candidateStatus({ ...candidate, status: "placed" })).toBe("placed");
    expect(candidateRevision({ ...candidate, revision: 4 })).toBe(4);
  });

  it("ends in the same schema from a fresh install, from v1 and from v2 (INV-9)", async () => {
    const fresh = describeSchema((await getDB()) as unknown as IDBPDatabase);

    for (const version of [1, 2] as const) {
      (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
      __setDBForTests(null);
      (await openLegacy(version)).close();
      expect(describeSchema((await getDB()) as unknown as IDBPDatabase)).toEqual(fresh);
    }
  });
});

describe("unique by-candidateId index (re-confirming B's probe on a migrated database)", () => {
  async function migrated() {
    await seedV2();
    return getDB();
  }

  it("skips records with no candidateId or a null one, so legacy History can't collide", async () => {
    const db = await migrated();
    await db.put(STORES.finalized, { ...legacyFinalized("fin-null-1", "2026-09-05T12:00:00.000Z", true), candidateId: null } as never);
    await db.put(STORES.finalized, { ...legacyFinalized("fin-null-2", "2026-09-06T12:00:00.000Z", true), candidateId: null } as never);

    expect(await db.getAll(STORES.finalized)).toHaveLength(4);
    expect(await db.getAllFromIndex(STORES.finalized, "by-candidateId")).toEqual([]);
  });

  it("indexes an empty string like any key, so a second '' is rejected (writers must never store '')", async () => {
    const db = await migrated();
    await db.put(STORES.finalized, { ...legacyFinalized("fin-empty-1", "2026-09-05T12:00:00.000Z", true), candidateId: "" });

    await expect(
      db.put(STORES.finalized, { ...legacyFinalized("fin-empty-2", "2026-09-06T12:00:00.000Z", true), candidateId: "" }),
    ).rejects.toMatchObject({ name: "ConstraintError" });
  });

  it("rejects a second record for the same candidate and aborts the whole transaction (INV-3, INV-5)", async () => {
    const db = await migrated();
    await db.put(STORES.finalized, { ...legacyFinalized("fin-a", "2026-09-05T12:00:00.000Z", true), candidateId: "cand-1" });

    const tx = db.transaction([STORES.finalized, STORES.candidates], "readwrite");
    const earlierWrite = tx.objectStore(STORES.candidates).put({ ...legacyCandidate, id: "cand-written-first" });
    const duplicate = tx.objectStore(STORES.finalized).put({ ...legacyFinalized("fin-b", "2026-09-06T12:00:00.000Z", true), candidateId: "cand-1" });
    await expect(duplicate).rejects.toMatchObject({ name: "ConstraintError" });
    await earlierWrite.catch(() => undefined);
    await expect(tx.done).rejects.toBeTruthy();

    expect(await db.get(STORES.candidates, "cand-written-first")).toBeUndefined();
    expect(await db.get(STORES.finalized, "fin-b")).toBeUndefined();
    expect((await db.getAllFromIndex(STORES.finalized, "by-candidateId", "cand-1")).map((r) => r.id)).toEqual(["fin-a"]);
  });
});

describe("the upgrade never hangs (INV-14)", () => {
  function collectNotices(): DatabaseNotice[] {
    const notices: DatabaseNotice[] = [];
    unsubscribe = subscribeToDatabaseNotices((notice) => notices.push(notice));
    return notices;
  }

  async function until(check: () => boolean, what: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  it("says why when an older tab (running the pre-v3 code, which has no handlers) blocks the upgrade, then finishes once it closes", async () => {
    await seedV2();
    const oldTab = await openLegacy(2); // like a v2 tab that never closes on its own
    const notices = collectNotices();

    let opened = false;
    const opening = getDB().then((db) => {
      opened = true;
      return db;
    });
    await until(() => notices.length > 0, "the blocked notice");

    expect(notices).toEqual([{ kind: "upgrade-blocked", message: UPGRADE_BLOCKED_MESSAGE }]);
    expect(opened).toBe(false);

    oldTab.close();
    const db = await opening;
    expect(db.version).toBe(3);
    expect(notices.at(-1)).toEqual({ kind: "upgrade-unblocked" });
    expect(await db.get(STORES.candidates, "cand-legacy")).toEqual(legacyCandidate);
  });

  it("closes this tab's connection when a newer version opens, and says to reload", async () => {
    await getDB();
    const notices = collectNotices();

    const newer = await openDB(DB_NAME, SCHEMA_VERSION + 1); // resolves only if our connection stepped aside

    expect(newer.version).toBe(SCHEMA_VERSION + 1);
    expect(notices).toEqual([{ kind: "closed-for-newer-version", message: CLOSED_FOR_NEWER_VERSION_MESSAGE }]);
    newer.close();
  });

  it("surfaces a database from a newer app version as a readable error instead of swallowing it, and retries on the next call", async () => {
    (await openDB(DB_NAME, SCHEMA_VERSION + 1)).close();

    await expect(getDB()).rejects.toBeInstanceOf(DatabaseVersionError);

    // Not memoized: once the cause is gone, the next call makes a fresh
    // attempt and succeeds instead of returning the old rejection.
    await deleteDB(DB_NAME);
    expect((await getDB()).version).toBe(SCHEMA_VERSION);
  });
});

describe("upgrade notices only clear when the problem is resolved", () => {
  const blocked: DatabaseNotice = { kind: "upgrade-blocked", message: UPGRADE_BLOCKED_MESSAGE };
  const closed: DatabaseNotice = { kind: "closed-for-newer-version", message: CLOSED_FOR_NEWER_VERSION_MESSAGE };

  it("shows the blocked message until the upgrade goes through", () => {
    expect(nextDatabaseNotice(null, blocked)).toBe(UPGRADE_BLOCKED_MESSAGE);
    expect(nextDatabaseNotice(UPGRADE_BLOCKED_MESSAGE, { kind: "upgrade-unblocked" })).toBeNull();
  });

  it("keeps the closed-for-newer-version message even if an unblocked notice arrives", () => {
    expect(nextDatabaseNotice(null, closed)).toBe(CLOSED_FOR_NEWER_VERSION_MESSAGE);
    expect(nextDatabaseNotice(CLOSED_FOR_NEWER_VERSION_MESSAGE, { kind: "upgrade-unblocked" })).toBe(CLOSED_FOR_NEWER_VERSION_MESSAGE);
    expect(nextDatabaseNotice(null, { kind: "upgrade-unblocked" })).toBeNull();
  });
});
