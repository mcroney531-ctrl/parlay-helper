import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A build with a custom distDir (the two-build upgrade check) adds its own
// .e2e-upgrade/* paths to tsconfig.json's include. scripts/e2e-upgrade.mjs
// puts the file back from git, and this check catches a dirty copy before
// it's committed (B's review of 9a333b2, R2).

describe("tsconfig.json", () => {
  const config = JSON.parse(readFileSync(path.resolve(__dirname, "..", "..", "tsconfig.json"), "utf8"));

  it("never includes the upgrade check's builds", () => {
    expect((config.include as string[]).filter((entry) => entry.includes(".e2e-upgrade"))).toEqual([]);
  });

  it("excludes them, so the **/*.ts include doesn't pull their generated types into tsc", () => {
    expect(config.exclude).toContain(".e2e-upgrade");
  });
});
