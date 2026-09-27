import { expect, test, type Page, type Route } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER } from "./support/flows";

// Phase 3 chunk 2 (same-identity refresh ordering), in a real browser: two
// tabs refresh the same slip; the one that STARTED first answers LAST. Its
// older price must not overwrite the newer one. Covered at unit level too; this
// adds what fake-indexeddb can't show: truly concurrent fetches from two pages,
// and real IndexedDB transactions, which commit early if anything but an
// IndexedDB request is awaited inside them.

function oddsBody(route: Route, priceAmerican: number) {
  const legs = (route.request().postDataJSON() as { legs: { ideaId: string }[] }).legs;
  return {
    results: [
      {
        eventId: "evt-1",
        ideaIds: legs.map((leg) => leg.ideaId),
        status: "ok",
        fetchedAt: new Date().toISOString(),
        warning: null,
        outcomes: [{ marketKey: "player_reception_yds", name: "Over", description: "Puka Nacua", point: 63.5, priceAmerican }],
      },
    ],
  };
}

async function storedOdds(page: Page): Promise<number | null | undefined> {
  return page.evaluate(
    () =>
      new Promise<number | null | undefined>((resolve, reject) => {
        const open = indexedDB.open("parlay-helper");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction("liveContext").objectStore("liveContext").getAll();
          read.onsuccess = () => {
            resolve((read.result as { ideaId: string; currentOddsAmerican: number | null }[]).find((r) => r.ideaId === "i1")?.currentOddsAmerican);
            open.result.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

test("two tabs refresh the same slip; the refresh that started first but answers last doesn't overwrite the newer price", async ({
  context,
}) => {
  const tabA = await context.newPage();
  await seedV2(tabA, {
    ideas: [idea("i1", "Puka Nacua", { eventId: "evt-1" })],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });

  // Tab A's odds request is held until released; tab B's is answered at once.
  let releaseA!: () => void;
  const aReleased = new Promise<void>((resolve) => (releaseA = resolve));
  let aRequested!: () => void;
  const aInFlight = new Promise<void>((resolve) => (aRequested = resolve));
  await tabA.route("**/api/odds", async (route) => {
    aRequested();
    await aReleased;
    await route.fulfill({ json: oddsBody(route, -110) });
  });
  await tabA.goto("/builder");

  const tabB = await context.newPage();
  await tabB.route("**/api/odds", (route) => route.fulfill({ json: oddsBody(route, -150) }));
  await tabB.goto("/builder");

  const refreshA = tabA.getByRole("button", { name: /Refresh odds & status|Refreshing/ });
  const refreshB = tabB.getByRole("button", { name: /Refresh odds & status|Refreshing/ });

  await refreshA.click(); // A starts first...
  await aInFlight;
  await refreshB.click(); // ...B starts later and finishes first.
  await expect(refreshB).toHaveText("Refresh odds & status");
  expect(await storedOdds(tabB)).toBe(-150);

  releaseA(); // A's older answer arrives last.
  await expect(refreshA).toHaveText("Refresh odds & status");

  expect(await storedOdds(tabA)).toBe(-150);
});
