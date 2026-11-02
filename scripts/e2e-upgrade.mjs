// The two-build upgrade check: `npm run test:e2e:upgrade`.
//
// Builds the app twice with different build labels (so their client code,
// asset URLs and service-worker cache versions really differ), keeps each in
// its own dist dir under .e2e-upgrade/ along with the sw.js and
// precache-manifest.json its postbuild wrote, then runs
// e2e/upgrade/*.upgrade.ts, which serves build A, then build B, on the same
// origin. Opt-in rather than part of `npm run test:e2e`: two production
// builds roughly double the run time.
//
// Files a build rewrites in the working tree are put back afterwards: the
// generated public/sw.js and public/precache-manifest.json (gitignored, but
// a later `next start` would serve them), and tsconfig.json / next-env.d.ts,
// which `next build` may edit for a custom distDir.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = ".e2e-upgrade";
const GENERATED = ["sw.js", "precache-manifest.json"];
const RESTORE = [...GENERATED.map((f) => path.join("public", f)), "tsconfig.json", "next-env.d.ts"];

const saved = new Map(RESTORE.map((f) => [f, existsSync(f) ? readFileSync(f) : null]));

function run(command, env = {}) {
  console.log(`\n> ${command} ${JSON.stringify(env)}`);
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
}

let failed = false;
try {
  rmSync(OUT, { recursive: true, force: true });
  for (const label of ["a", "b"]) {
    run("npm run build", { PARLAY_DIST_DIR: `${OUT}/${label}`, NEXT_PUBLIC_APP_BUILD: `upgrade-${label}` });
    const publicCopy = path.join(OUT, `${label}-public`);
    mkdirSync(publicCopy, { recursive: true });
    for (const file of GENERATED) copyFileSync(path.join("public", file), path.join(publicCopy, file));
  }
  run("npx playwright test --config playwright.upgrade.config.ts");
} catch {
  failed = true;
} finally {
  for (const [file, content] of saved) {
    if (content === null) rmSync(file, { force: true });
    else writeFileSync(file, content);
  }
}
process.exit(failed ? 1 : 0);
