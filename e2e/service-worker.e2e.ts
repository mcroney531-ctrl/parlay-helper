import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { idea, seedV2 } from "./support/seed";
import { EARLIER } from "./support/flows";

// The real service worker in the production build: the "Update available"
// prompt (Trevor's 3c decision) and the old screen names offline. Every other
// check blocks service workers; these need them.
test.use({ serviceWorkers: "allow" });

/** Loads the app and waits until its page is controlled by the worker (no clients.claim, so that takes a reload). */
async function openControlled(page: Page) {
  await page.goto("/ideas");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

// The served worker script (a gitignored build artifact). Playwright can't
// route a worker's own script fetch, so a "deploy" rewrites this file for the
// length of the test; checks run one at a time (playwright.config workers: 1).
const SW_PATH = path.resolve(__dirname, "..", "public", "sw.js");

test("a new version waits, the prompt offers it, and Reload applies it", async ({ page }) => {
  await openControlled(page);
  const [v1] = await cacheNames(page);
  expect(v1).toMatch(/^parlay-helper-shell-/);

  // "Deploy" a new version: same worker, a different cache version stamped in.
  const original = readFileSync(SW_PATH, "utf8");
  const v2 = `${v1}-next`;
  writeFileSync(SW_PATH, original.replace(v1, v2));
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    await expect(page.getByText("Update available.")).toBeVisible();
    // Waiting, not taking over: the old worker still controls the page and its cache is intact.
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.waiting !== null))).toBe(true);
    expect((await cacheNames(page)).sort()).toEqual([v1, v2].sort());

    await page.evaluate(() => ((window as unknown as { beforeReload: boolean }).beforeReload = true));
    await page.getByRole("button", { name: "Reload" }).click();

    // A new document, controlled by the new worker, which deleted the old cache.
    await page.waitForFunction(() => !(window as unknown as { beforeReload?: boolean }).beforeReload);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect.poll(() => cacheNames(page)).toEqual([v2]);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.waiting === null))).toBe(true);
    await expect(page.getByText("Update available.")).toHaveCount(0);
  } finally {
    // Restored only now: a navigation's update check against the old script would install it again.
    writeFileSync(SW_PATH, original);
  }
});

/** Marks the current document, to tell a full page load (marker gone) from a client-side navigation (marker kept). */
const markDocument = (page: Page) => page.evaluate(() => ((window as unknown as { sameDocument: boolean }).sameDocument = true));
const sameDocument = (page: Page) => page.evaluate(() => Boolean((window as unknown as { sameDocument?: boolean }).sameDocument));

test("after another tab applies the update, this tab says so and its next navigation is a full page load", async ({ page, context }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await openControlled(page);
  const [v1] = await cacheNames(page);
  // Two more tabs on the old version: one leaves by a link, one by a button that navigates in code.
  const byLink = await context.newPage();
  await byLink.goto("/slip");
  const byButton = await context.newPage();
  await byButton.goto("/slip");
  for (const tab of [byLink, byButton]) await tab.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const original = readFileSync(SW_PATH, "utf8");
  writeFileSync(SW_PATH, original.replace(v1, `${v1}-next`));
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    for (const tab of [page, byLink, byButton]) await expect(tab.getByText("Update available.")).toBeVisible();
    await page.getByRole("button", { name: "Reload" }).click();

    for (const tab of [byLink, byButton]) {
      await expect(tab.getByText("The app was updated in another tab. Reload to keep using it.")).toBeVisible();
      await markDocument(tab);
    }

    await byLink.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "History" }).click();
    await expect(byLink).toHaveURL(/\/history$/);
    expect(await sameDocument(byLink)).toBe(false);

    await byButton.getByRole("button", { name: "Add ideas" }).first().click();
    await expect(byButton).toHaveURL(/\/ideas\?add=s1$/);
    expect(await sameDocument(byButton)).toBe(false);
    await expect(byButton.getByRole("status").filter({ hasText: "Adding to Sunday Core" })).toBeVisible();
  } finally {
    writeFileSync(SW_PATH, original);
  }
});

/** Records app-router RSC fetches (client-side navigations) made by a tab. */
function watchRsc(tab: Page) {
  const seen: string[] = [];
  tab.on("request", (r) => {
    if (r.headers()["rsc"] === "1" || r.url().includes("_rsc=")) seen.push(r.url());
  });
  return seen;
}

test("in full-page-load mode, Back loads a new document, within the tab's history and across a full load", async ({ page, context }) => {
  await seedV2(page, {
    ideas: [idea("i1", "Puka Nacua")],
    slips: [{ id: "s1", name: "Sunday Core", sportsbook: "FanDuel", ideaIds: ["i1"], updatedAt: EARLIER }],
  });
  await openControlled(page);
  const [v1] = await cacheNames(page);
  const nav = (tab: Page) => tab.getByRole("navigation", { name: "Primary" });

  // "within": an old tab that moved /ideas -> /slip client-side BEFORE the update.
  const within = await context.newPage();
  await within.goto("/ideas");
  await within.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await markDocument(within);
  await nav(within).getByRole("link", { name: "Slip" }).click();
  await expect(within).toHaveURL(/\/slip$/);
  expect(await sameDocument(within)).toBe(true); // a client-side navigation, as intended outside the mode

  // "across": an old tab that will leave by a full load in the mode, then come Back.
  const across = await context.newPage();
  await across.goto("/slip");
  await across.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Notes whether the browser restored this document from the back/forward cache.
  await across.evaluate(() =>
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) sessionStorage.setItem("restoredFromBfcache", "yes");
    }),
  );

  const original = readFileSync(SW_PATH, "utf8");
  writeFileSync(SW_PATH, original.replace(v1, `${v1}-next`));
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    for (const tab of [page, within, across]) await expect(tab.getByText("Update available.")).toBeVisible();
    await page.getByRole("button", { name: "Reload" }).click();
    for (const tab of [within, across]) {
      await expect(tab.getByText("The app was updated in another tab. Reload to keep using it.")).toBeVisible();
      await markDocument(tab);
    }

    // Back within the tab's own history: a new document, and no client-side (RSC) traversal at all.
    const rsc = watchRsc(within);
    await within.goBack();
    await expect(within).toHaveURL(/\/ideas$/);
    await expect(nav(within).getByRole("link", { name: "Ideas" })).toHaveAttribute("aria-current", "page");
    expect(await sameDocument(within)).toBe(false);
    expect(rsc).toEqual([]);

    // Back across a full load: never the old document again, from the back/forward cache or otherwise.
    await nav(across).getByRole("link", { name: "History" }).click();
    await expect(across).toHaveURL(/\/history$/);
    await across.goBack();
    await expect(across).toHaveURL(/\/slip$/);
    await expect(nav(across).getByRole("link", { name: "Slip" })).toHaveAttribute("aria-current", "page");
    expect(await sameDocument(across)).toBe(false);
    await expect(across.getByText("The app was updated in another tab.")).toHaveCount(0);
    test.info().annotations.push({
      type: "bfcache",
      description: (await across.evaluate(() => sessionStorage.getItem("restoredFromBfcache"))) ?? "not restored from bfcache",
    });
  } finally {
    writeFileSync(SW_PATH, original);
  }
});

test("offline, an old screen name opens its new screen with the query kept", async ({ page, context }) => {
  await openControlled(page);
  await context.setOffline(true);

  await page.goto("/capture?from=shortcut");
  await expect(page).toHaveURL(/\/ideas\?from=shortcut$/);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Ideas" })).toHaveAttribute("aria-current", "page");

  await page.goto("/builder?from=old");
  await expect(page).toHaveURL(/\/slip\?from=old$/);
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Slip" })).toHaveAttribute("aria-current", "page");
});

test("offline, an unknown path opens the Ideas screen, and it works", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openControlled(page);
  await context.setOffline(true);

  await page.goto("/whatever?x=1");
  await expect(page).toHaveURL(/\/whatever\?x=1$/); // served in place, not redirected
  await expect(page.getByRole("heading", { name: "IDEAS" })).toBeVisible();
  await expect(page.getByText("No ideas yet.")).toBeVisible(); // hydrated: the list loaded from storage

  // Working, not just painted: saving an idea goes through the app's own code and storage.
  await page.getByLabel("Save the thought before it disappears.").fill("Offline idea");
  await page.getByRole("button", { name: "Save idea" }).click();
  await expect(page.getByText("Saved to Ideas.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Offline idea" })).toBeVisible();
  expect(errors).toEqual([]);
});
