import type { Page } from "@playwright/test";

// Test data is written the way real users' data exists: in a SCHEMA v2
// database, created here with the raw IndexedDB API and a FROZEN copy of the
// v2 schema (never imported from the app, which only knows the latest one).
// The app then runs its own v2 -> v3 upgrade on first load, exactly as it did
// on Trevor's real data.

export type SeedIdea = {
  id: string;
  rawText: string;
  playerName?: string | null;
  playerId?: string | null;
  marketKey?: string | null;
  marketLabel?: string | null;
  selection?: string | null;
  lineAtCapture?: number | null;
  oddsAtCaptureAmerican?: number | null;
  /** A game: with league, market and a supported book, the leg can be refreshed. */
  eventId?: string | null;
};

export type SeedSlip = {
  id: string;
  name: string;
  sportsbook: string;
  ideaIds: string[];
  stakeCents?: number;
  /** ISO time; decides which draft is "most recently updated". */
  updatedAt: string;
};

export type Seed = { ideas: SeedIdea[]; slips: SeedSlip[] };

/** A structured, priced idea: it can be added to a slip and placed with an estimate. */
export function idea(id: string, playerName: string, overrides: Partial<SeedIdea> = {}): SeedIdea {
  return {
    id,
    rawText: `${playerName} over 63.5 receiving yards`,
    playerName,
    playerId: null,
    marketKey: "player_reception_yds",
    marketLabel: "Receiving Yards",
    selection: "over",
    lineAtCapture: 63.5,
    oddsAtCaptureAmerican: -110,
    ...overrides,
  };
}

/**
 * Opens the page on a same-origin static file (not an app route, so the app
 * doesn't open the database first), then writes the seed into a v2 database.
 * With `keepOpen`, the v2 connection stays open and ignores versionchange,
 * like a tab still running the pre-v3 app.
 */
export async function seedV2(page: Page, seed: Seed, { keepOpen = false } = {}): Promise<void> {
  await page.goto("/manifest.json");
  await page.evaluate(
    async ({ seed, keepOpen }) => {
      const iso = "2026-09-20T12:00:00.000Z";
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("parlay-helper", 2);
        request.onupgradeneeded = () => {
          const d = request.result;
          // Frozen v1 + v2 schema.
          const ideas = d.createObjectStore("ideas", { keyPath: "id" });
          ideas.createIndex("by-archivedAt", "archivedAt");
          ideas.createIndex("by-slateDate", "slateDate");
          ideas.createIndex("by-detailsStatus", "detailsStatus");
          const live = d.createObjectStore("liveContext", { keyPath: ["ideaId", "sportsbook"] });
          live.createIndex("by-ideaId", "ideaId");
          d.createObjectStore("candidates", { keyPath: "id" });
          const finalized = d.createObjectStore("finalized", { keyPath: "id" });
          finalized.createIndex("by-finalizedAt", "finalizedAt");
          d.createObjectStore("meta");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(["ideas", "candidates"], "readwrite");
      for (const i of seed.ideas) {
        tx.objectStore("ideas").put({
          id: i.id,
          rawText: i.rawText,
          detailsStatus: i.marketKey && i.selection ? "structured" : "needs_details",
          sport: null,
          league: "NFL",
          slateDate: null,
          playerId: i.playerId ?? null,
          playerName: i.playerName ?? null,
          team: null,
          opponent: null,
          eventId: i.eventId ?? null,
          marketKey: i.marketKey ?? null,
          marketLabel: i.marketLabel ?? null,
          selection: i.selection ?? null,
          lineAtCapture: i.lineAtCapture ?? null,
          oddsAtCaptureAmerican: i.oddsAtCaptureAmerican ?? null,
          sportsbookAtCapture: null,
          confidence: "unrated",
          note: "",
          createdAt: iso,
          updatedAt: iso,
          archivedAt: null,
        });
      }
      for (const s of seed.slips) {
        // A pre-v3 candidate: no status / placedAt / revision.
        tx.objectStore("candidates").put({
          id: s.id,
          name: s.name,
          sportsbook: s.sportsbook,
          ideaIds: s.ideaIds,
          stakeCents: s.stakeCents ?? 200,
          promoLabel: "",
          promoMaxStakeCents: null,
          createdAt: iso,
          updatedAt: s.updatedAt,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (keepOpen) {
        // Like the pre-v3 app: no versionchange handler, so it never steps aside.
        (window as unknown as { __oldConnection: IDBDatabase }).__oldConnection = db;
      } else {
        db.close();
      }
    },
    { seed, keepOpen },
  );
}
