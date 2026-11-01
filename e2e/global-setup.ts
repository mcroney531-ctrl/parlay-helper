import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// service-worker.e2e.ts "deploys" a new version by rewriting public/sw.js's
// cache name with a "-next" suffix and restores it when the test ends. A run
// killed mid-test leaves it rewritten. A fresh build regenerates the file, but
// E2E_REUSE_SERVER=1 skips the build, so put the cache name back here.
export default function globalSetup() {
  const swPath = path.resolve(__dirname, "..", "public", "sw.js");
  if (!existsSync(swPath)) return;
  const source = readFileSync(swPath, "utf8");
  const restored = source.replace(/(const CACHE_NAME = "parlay-helper-shell-[^"]*?)(?:-next)+"/, '$1"');
  if (restored !== source) writeFileSync(swPath, restored);
}
