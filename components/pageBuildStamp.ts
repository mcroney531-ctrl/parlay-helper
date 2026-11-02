"use client";

import { useEffect } from "react";

/**
 * Stamps which build THIS SCREEN's code came from on <html data-page-build>,
 * next to the layout's <html data-build>. Each page calls it with
 * process.env.NEXT_PUBLIC_APP_BUILD written in the page module itself, so the
 * label is inlined into every screen's own chunk: two builds with different
 * labels then differ in each screen's code, which the two-build upgrade check
 * (scripts/e2e-upgrade.mjs) needs to show an old tab really loading its old
 * screens offline. Also a diagnostic: which build is this screen running?
 */
export function usePageBuildStamp(label: string | undefined) {
  useEffect(() => {
    document.documentElement.dataset.pageBuild = label || "local";
  }, [label]);
}
