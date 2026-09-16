// Runs after `next build`. The app shell's service worker needs to precache
// the *actual* JS/CSS/font assets each top-level route depends on, not just
// the route's HTML document — Turbopack gives each route its own chunk set
// beyond the shared root bundle, so a hardcoded list drifts from reality on
// every build. Next already renders each static route's real HTML output to
// .next/server/app/<route>.html; we read the same asset URLs straight out of
// that (no guessing at Turbopack's internal manifest format).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROUTES = ["capture", "bucket", "builder", "history"];
const NEXT_DIR = path.resolve(process.cwd(), ".next");
const OUTPUT_PATH = path.resolve(process.cwd(), "public", "precache-manifest.json");

const ASSET_ATTR_RE = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;

async function collectAssetsForRoute(route) {
  const htmlPath = path.join(NEXT_DIR, "server", "app", `${route}.html`);
  const html = await readFile(htmlPath, "utf8");
  const urls = new Set();
  for (const match of html.matchAll(ASSET_ATTR_RE)) {
    urls.add(match[1]);
  }
  return urls;
}

async function main() {
  const urls = new Set(ROUTES.map((r) => `/${r}`));
  urls.add("/manifest.json");

  for (const route of ROUTES) {
    const assets = await collectAssetsForRoute(route);
    for (const url of assets) urls.add(url);
  }

  const manifest = [...urls].sort();
  await writeFile(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${manifest.length} precache URLs to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error("Failed to generate precache manifest:", err);
  process.exit(1);
});
