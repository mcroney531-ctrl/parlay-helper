import { defineConfig, devices } from "@playwright/test";

// Browser checks against the PRODUCTION build (next build + next start), as
// the Next testing guide recommends, and because the app's upgrade and
// storage behaviour is what's under test. The server runs on its own port so
// it can never touch the IndexedDB data of the app at localhost:3000 (browser
// storage is per origin, and each test also gets a fresh browser context).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // *.e2e.ts, so Vitest's default *.test / *.spec globs never pick these up.
  testMatch: "**/*.e2e.ts",
  // ONE worker, deliberately. With two, the local production server
  // intermittently left a page's whole first burst of static assets (fonts,
  // CSS, JS chunks) pending, so its navigation never fired `load` and timed
  // out; a probe showed up to 4 of 6 concurrent loads stalling, with the
  // server bound to localhost or 127.0.0.1 and with a warm-up pass first.
  // With one worker it never stalled (the suite still runs in well under a
  // minute). Revisit before raising this.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // A persistent HTML report (never auto-opened) plus a video of any failing test,
  // so a rare flake leaves evidence behind (B, Phase 3 chunk 2 review).
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    // Service workers would serve cached pages and hide network routes from
    // page.route; the SW lifecycle is not what these checks cover.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Always a fresh production build unless E2E_REUSE_SERVER=1: a stale
    // server from another checkout would make a regression check meaningless.
    command: `npm run build && npx next start -p ${PORT} -H localhost`,
    url: BASE_URL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 300_000,
  },
});
