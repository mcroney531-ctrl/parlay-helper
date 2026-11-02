import type { Page } from "@playwright/test";

// Changes made to the app's stored data the way ANOTHER TAB would make them:
// straight to IndexedDB, with this page's in-memory data left as it was.

async function withIdeas(page: Page, change: { kind: "delete"; id: string } | { kind: "clearPrice"; id: string }) {
  await page.evaluate(async (change) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("parlay-helper");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("ideas", "readwrite");
      const store = tx.objectStore("ideas");
      if (change.kind === "delete") {
        store.delete(change.id);
      } else {
        const get = store.get(change.id);
        get.onsuccess = () => store.put({ ...get.result, oddsAtCaptureAmerican: null, sportsbookAtCapture: null });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, change);
}

/** Another tab deletes an idea. */
export const deleteIdeaElsewhere = (page: Page, id: string) => withIdeas(page, { kind: "delete", id });

/** Another tab removes an idea's capture price (with no live price, its leg is then unpriced). */
export const clearIdeaPriceElsewhere = (page: Page, id: string) => withIdeas(page, { kind: "clearPrice", id });
