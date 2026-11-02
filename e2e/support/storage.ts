import type { Page } from "@playwright/test";

// Changes made to the app's stored data the way ANOTHER TAB would make them:
// straight to IndexedDB, with this page's in-memory data left as it was.

type Change =
  | { kind: "deleteIdea"; id: string }
  | { kind: "clearPrice"; id: string }
  | { kind: "captureAndAdd"; slipId: string; copyOf: string; id: string; playerName: string };

async function changeElsewhere(page: Page, change: Change) {
  await page.evaluate(async (change) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("parlay-helper");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const run = (stores: string[], body: (tx: IDBTransaction) => void) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores, "readwrite");
        body(tx);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    const now = new Date().toISOString();

    if (change.kind === "deleteIdea") {
      await run(["ideas"], (tx) => tx.objectStore("ideas").delete(change.id));
    } else if (change.kind === "clearPrice") {
      await run(["ideas"], (tx) => {
        const store = tx.objectStore("ideas");
        const get = store.get(change.id);
        get.onsuccess = () => store.put({ ...get.result, oddsAtCaptureAmerican: null, sportsbookAtCapture: null });
      });
    } else {
      // As the app does it: the idea is saved first, then the slip names it (a separate write).
      await run(["ideas"], (tx) => {
        const store = tx.objectStore("ideas");
        const get = store.get(change.copyOf);
        get.onsuccess = () =>
          store.put({
            ...get.result,
            id: change.id,
            playerName: change.playerName,
            rawText: `${change.playerName} over 63.5 receiving yards`,
            createdAt: now,
            updatedAt: now,
          });
      });
      await run(["candidates"], (tx) => {
        const store = tx.objectStore("candidates");
        const get = store.get(change.slipId);
        get.onsuccess = () =>
          store.put({ ...get.result, ideaIds: [...get.result.ideaIds, change.id], updatedAt: now, revision: (get.result.revision ?? 0) + 1 });
      });
    }
    db.close();
  }, change);
}

/** Another tab deletes an idea. */
export const deleteIdeaElsewhere = (page: Page, id: string) => changeElsewhere(page, { kind: "deleteIdea", id });

/** Another tab removes an idea's capture price (with no live price, its leg is then unpriced). */
export const clearIdeaPriceElsewhere = (page: Page, id: string) => changeElsewhere(page, { kind: "clearPrice", id });

/** Another tab captures a new idea (a copy of `copyOf` for `playerName`) and adds it to a slip. */
export const captureAndAddElsewhere = (page: Page, change: { slipId: string; copyOf: string; id: string; playerName: string }) =>
  changeElsewhere(page, { kind: "captureAndAdd", ...change });

/** An idea exactly as stored in IndexedDB (not as the page shows it). */
export async function storedIdea(page: Page, id: string): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("parlay-helper");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const get = db.transaction(["ideas"], "readonly").objectStore("ideas").get(id);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return result;
  }, id);
}
