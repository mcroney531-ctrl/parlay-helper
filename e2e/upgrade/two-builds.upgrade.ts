import { spawn, execSync, type ChildProcess } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// A real upgrade, from build A to build B (scripts/e2e-upgrade.mjs builds
// both). The waiting-worker policy, end to end:
// - B's worker installs and waits while a tab A's worker controls is open;
// - meanwhile that tab still loads A's own files offline, from A's cache;
// - once every old tab has closed, B's worker takes over and A's cache is gone.

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, ".e2e-upgrade");
const PORT = Number(process.env.E2E_UPGRADE_PORT ?? 3150);
const BASE = `http://localhost:${PORT}`;

type Label = "a" | "b";
const manifest = (label: Label): string[] => JSON.parse(readFileSync(path.join(OUT, `${label}-public`, "precache-manifest.json"), "utf8"));

let server: ChildProcess | null = null;

async function waitFor(check: () => Promise<boolean>, what: string, ms = 60_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}
const serverUp = () =>
  fetch(`${BASE}/manifest.json`)
    .then((r) => r.ok)
    .catch(() => false);

/** Serves one build on the shared origin: its dist dir, and the sw.js / precache manifest its postbuild wrote. */
async function startBuild(label: Label) {
  for (const file of ["sw.js", "precache-manifest.json"]) {
    copyFileSync(path.join(OUT, `${label}-public`, file), path.join(ROOT, "public", file));
  }
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "localhost"], {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, PARLAY_DIST_DIR: `.e2e-upgrade/${label}` },
  });
  await waitFor(serverUp, `build ${label} to serve`);
}

async function stopBuild() {
  if (!server?.pid) return;
  if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
  else server.kill();
  server = null;
  await waitFor(async () => !(await serverUp()), "the server to stop");
}

test.afterEach(async () => {
  await stopBuild();
});

const buildOf = (page: Page) => page.evaluate(() => document.documentElement.dataset.build ?? null);
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());
const hasWaiting = (page: Page) => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.waiting)));

/** Same-origin script and stylesheet URLs the current document loaded. */
const documentAssets = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet]")]
      .map((el) => new URL(el instanceof HTMLScriptElement ? el.src : el.href))
      .filter((url) => url.origin === location.origin)
      .map((url) => url.pathname + url.search),
  );

test("from build A to build B: B waits, A's tab still loads A's files offline, and B takes over once every A tab closes", async ({ context }) => {
  const [assetsA, assetsB] = [manifest("a"), manifest("b")];
  expect(assetsA.filter((url) => !assetsB.includes(url)).length).toBeGreaterThan(0); // the builds really differ

  // 1. Build A is live; a tab is controlled by A's worker.
  await startBuild("a");
  const old = await context.newPage();
  await old.goto("/ideas");
  await old.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await old.reload();
  await old.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => buildOf(old)).toBe("upgrade-a");
  const [cacheA] = await cacheNames(old);

  // 2. Build B is deployed. A's tab finds it: B installs and WAITS.
  await stopBuild();
  await startBuild("b");
  await old.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect(old.getByText("Update available.")).toBeVisible();
  expect(await hasWaiting(old)).toBe(true);
  const cacheB = (await cacheNames(old)).find((name) => name !== cacheA)!;
  expect(cacheB).toBeTruthy();

  // 3. Offline, A's tab still opens every screen from A's own files (A's worker, A's cache).
  const failedStatic: string[] = [];
  old.on("requestfailed", (r) => r.url().includes("/_next/static/") && failedStatic.push(r.url()));
  old.on("response", (r) => r.url().includes("/_next/static/") && r.status() >= 400 && failedStatic.push(`${r.status()} ${r.url()}`));
  await context.setOffline(true);
  for (const screen of ["/ideas", "/slip", "/history"]) {
    await old.goto(screen);
    await expect.poll(() => buildOf(old), { message: `${screen} hydrated as build A` }).toBe("upgrade-a");
    const assets = await documentAssets(old);
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.filter((url) => !assetsA.includes(url)), `${screen} loaded only build A's files`).toEqual([]);
  }
  expect(failedStatic).toEqual([]);
  expect(await hasWaiting(old)).toBe(true); // still waiting: an offline reload is not a takeover
  expect((await cacheNames(old)).sort()).toEqual([cacheA, cacheB].sort());
  await context.setOffline(false);

  // 4. Every A tab closes. B takes over, and A's cache is gone.
  await old.close();
  const fresh = await context.newPage();
  await fresh.goto("/ideas");
  await expect.poll(() => cacheNames(fresh), { timeout: 15_000 }).toEqual([cacheB]);
  expect(await hasWaiting(fresh)).toBe(false);
  await fresh.reload();
  await fresh.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect.poll(() => buildOf(fresh)).toBe("upgrade-b");
  await expect(fresh.getByText("Update available.")).toHaveCount(0);

  // And B's own files now load offline, from B's cache.
  await context.setOffline(true);
  await fresh.goto("/slip");
  await expect.poll(() => buildOf(fresh)).toBe("upgrade-b");
  expect((await documentAssets(fresh)).filter((url) => !assetsB.includes(url))).toEqual([]);
  await context.setOffline(false);
});
