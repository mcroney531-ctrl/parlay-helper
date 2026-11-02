import { defineConfig, devices } from "@playwright/test";

// The two-build upgrade check, run by scripts/e2e-upgrade.mjs (npm run
// test:e2e:upgrade), which makes the two builds first. There is no webServer:
// the test itself starts build A, then build B, on this one port, because a
// service worker update only happens on the same origin.
const UPGRADE_PORT = Number(process.env.E2E_UPGRADE_PORT ?? 3150);

export default defineConfig({
  testDir: "./e2e/upgrade",
  testMatch: "**/*.upgrade.ts",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${UPGRADE_PORT}`,
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
