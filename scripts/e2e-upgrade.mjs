// The two-build upgrade check: `npm run test:e2e:upgrade`.
//
// Builds the app twice with different build labels (so their client code,
// asset URLs and service-worker cache versions really differ), keeps each in
// its own dist dir under .e2e-upgrade/ along with the sw.js and
// precache-manifest.json its postbuild wrote, then runs
// e2e/upgrade/*.upgrade.ts, which serves build A, then build B, on the same
// origin. A separate command because it makes two production builds; it is
// REQUIRED before merges (see the README's scripts section).
//
// KILL-SAFE (B's review of 9a333b2, R2). A build with a custom distDir
// rewrites files in the working tree: next build adds .e2e-upgrade/* paths
// to tsconfig.json's include (and reformats it) and points next-env.d.ts at
// the build's types; postbuild rewrites public/sw.js and
// public/precache-manifest.json. They are put back from sources that a
// killed run can't have dirtied, never from a snapshot taken at start:
//   - tsconfig.json from git (HEAD);
//   - next-env.d.ts by pointing it back at .next;
//   - sw.js / precache-manifest.json regenerated from the normal .next
//     build, or removed if there is none (any build or dev start makes them).
// Cleanup runs at START (healing a run that was hard-killed, e.g. taskkill
// /F, where nothing can run), at the end, and on SIGINT/SIGTERM/SIGHUP.
// A tsconfig.json with changes of the user's own is never overwritten: the
// run refuses to start instead.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = ".e2e-upgrade";
const GENERATED = ["sw.js", "precache-manifest.json"];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

/** tsconfig.json as parsed, with any include entries a custom-distDir build added removed. */
function withoutUpgradeIncludes(json) {
  const config = JSON.parse(json);
  if (Array.isArray(config.include)) config.include = config.include.filter((entry) => !String(entry).startsWith(`${OUT}/`));
  return JSON.stringify(config);
}

/**
 * Puts tsconfig.json back to HEAD when its only difference is what an upgrade
 * build adds; throws when it holds other uncommitted changes.
 */
function restoreTsconfig() {
  const head = git("show", "HEAD:tsconfig.json");
  const current = readFileSync("tsconfig.json", "utf8");
  const sameAsHead = current.replace(/\r\n/g, "\n") === head.replace(/\r\n/g, "\n");
  if (!sameAsHead) {
    let ours;
    try {
      ours = withoutUpgradeIncludes(current) === withoutUpgradeIncludes(head);
    } catch {
      ours = false;
    }
    if (!ours) {
      throw new Error("tsconfig.json has uncommitted changes of its own. Commit or revert them, then run this again.");
    }
  }
  // A checkout, not a write of HEAD's bytes: it also restores the line
  // endings git expects in this checkout (core.autocrlf).
  git("checkout", "--", "tsconfig.json");
  if (!sameAsHead) console.log("Restored tsconfig.json from git.");
}

function restoreNextEnv() {
  if (!existsSync("next-env.d.ts")) return;
  const current = readFileSync("next-env.d.ts", "utf8");
  const restored = current.replace(new RegExp(`\\./${OUT.replace(".", "\\.")}/[^/]+/`, "g"), "./.next/");
  if (restored !== current) writeFileSync("next-env.d.ts", restored);
}

function restoreGenerated() {
  if (existsSync(path.join(".next", "server", "app", "ideas.html"))) {
    const env = { ...process.env };
    delete env.PARLAY_DIST_DIR;
    execFileSync(process.execPath, ["scripts/generate-app-shell.mjs"], { stdio: "ignore", env });
  } else {
    for (const file of GENERATED) rmSync(path.join("public", file), { force: true });
  }
}

function cleanup() {
  restoreTsconfig();
  restoreNextEnv();
  restoreGenerated();
}

let child = null;
function killChild() {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  } catch {
    // already gone
  }
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    console.error(`\n${signal}: stopping and cleaning up.`);
    killChild();
    try {
      cleanup();
    } finally {
      process.exit(130);
    }
  });
}

function run(command, args, env = {}) {
  console.log(`\n> ${command} ${args.join(" ")} ${JSON.stringify(env)}`);
  return new Promise((resolve, reject) => {
    // One command line through the shell (npm and npx are .cmd files on Windows); every argument here is a plain word.
    child = spawn([command, ...args].join(" "), { stdio: "inherit", env: { ...process.env, ...env }, shell: true });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });
}

let failed = false;
let started = false;
try {
  cleanup(); // heal a run that was killed before it could clean up
  started = true;
  rmSync(OUT, { recursive: true, force: true });
  for (const label of ["a", "b"]) {
    await run("npm", ["run", "build"], { PARLAY_DIST_DIR: `${OUT}/${label}`, NEXT_PUBLIC_APP_BUILD: `upgrade-${label}` });
    const publicCopy = path.join(OUT, `${label}-public`);
    mkdirSync(publicCopy, { recursive: true });
    for (const file of GENERATED) copyFileSync(path.join("public", file), path.join(publicCopy, file));
  }
  await run("npx", ["playwright", "test", "--config", "playwright.upgrade.config.ts"]);
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (started && !stopping) cleanup();
}
process.exit(failed ? 1 : 0);
