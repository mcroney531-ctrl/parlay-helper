import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

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
