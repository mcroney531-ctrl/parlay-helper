import type { NextConfig } from "next";
import routes from "./config/routes.json";

const nextConfig: NextConfig = {
  // Only the two-build upgrade check (scripts/e2e-upgrade.mjs) sets this, to
  // keep an old and a new build side by side. Everything else uses .next.
  distDir: process.env.PARLAY_DIST_DIR || ".next",
  // The old screen names keep working forever (installed apps, bookmarks,
  // the manifest's old shortcuts): 308, query passed through. The service
  // worker answers the same aliases from config/routes.json for navigations,
  // so they also work offline.
  async redirects() {
    return Object.entries(routes.aliases).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
