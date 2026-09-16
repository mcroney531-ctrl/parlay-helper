"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline shell is a progressive enhancement; capture/build still
      // work without it as long as IndexedDB is available.
    });
  }, []);

  return null;
}
