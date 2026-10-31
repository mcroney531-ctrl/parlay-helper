import type { NextConfig } from "next";
import routes from "./config/routes.json";

const nextConfig: NextConfig = {
  // The old screen names keep working forever (installed apps, bookmarks,
  // the manifest's old shortcuts): 308, query passed through. The service
  // worker answers the same aliases from config/routes.json for navigations,
  // so they also work offline.
  async redirects() {
    return Object.entries(routes.aliases).map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
