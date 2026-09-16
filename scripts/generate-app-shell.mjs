// Regenerates the two files the service worker needs:
//   - public/precache-manifest.json — the real list of URLs to precache
//   - public/sw.js                  — scripts/sw-template.js with its
//                                      __CACHE_VERSION__ placeholder filled
//                                      in from a hash of that list
// Both are gitignored build artifacts. Run via `npm run build` (postbuild,
// full asset list read from this build's own rendered HTML) or `npm run dev`
// (predev, a minimal-but-valid dev list — `next dev` has no prerendered
// HTML to read chunk URLs out of).
//
// Baking a content hash into sw.js's own source is what makes cache
// invalidation across deploys actually work: the browser only starts the
// install/activate cycle for a NEW service worker when its script bytes
// differ, and CACHE_NAME differing is what makes activate's "delete every
// other cache" cleanup below (in the template) meaningfully fire.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROUTES = ["capture", "bucket", "builder", "history"];
const NEXT_DIR = path.resolve(process.cwd(), ".next");
const MANIFEST_PATH = path.resolve(process.cwd(), "public", "precache-manifest.json");
const SW_TEMPLATE_PATH = path.resolve(process.cwd(), "scripts", "sw-template.js");
const SW_OUTPUT_PATH = path.resolve(process.cwd(), "public", "sw.js");

const ASSET_ATTR_RE = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
const isDev = process.argv.includes("--dev");

async function collectAssetsForRoute(route) {
  const htmlPath = path.join(NEXT_DIR, "server", "app", `${route}.html`);
  const html = await readFile(htmlPath, "utf8");
  const urls = new Set();
  for (const match of html.matchAll(ASSET_ATTR_RE)) {
    urls.add(match[1]);
  }
  return urls;
}

async function buildManifest() {
  const urls = new Set(ROUTES.map((r) => `/${r}`));
  urls.add("/manifest.json");

  if (isDev) {
    // next dev doesn't prerender static HTML to read real chunk URLs out
    // of — a minimal document-only list is the honest dev-mode ceiling.
    return [...urls].sort();
  }

  for (const route of ROUTES) {
    const assets = await collectAssetsForRoute(route);
    for (const url of assets) urls.add(url);
  }
  return [...urls].sort();
}

function hashOf(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 12);
}

async function main() {
  const manifest = await buildManifest();
  const version = isDev ? `dev-${hashOf(manifest)}` : hashOf(manifest);

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  const template = await readFile(SW_TEMPLATE_PATH, "utf8");
  if (!template.includes("__CACHE_VERSION__")) {
    throw new Error("sw-template.js is missing the __CACHE_VERSION__ placeholder");
  }
  const swSource = template.replaceAll("__CACHE_VERSION__", version);
  await writeFile(SW_OUTPUT_PATH, swSource);

  console.log(
    `Wrote ${manifest.length} precache URLs (version ${version}) to ${path.relative(process.cwd(), MANIFEST_PATH)} and ${path.relative(process.cwd(), SW_OUTPUT_PATH)}`,
  );
}

main().catch((err) => {
  console.error("Failed to generate app shell (precache manifest / service worker):", err);
  process.exit(1);
});
