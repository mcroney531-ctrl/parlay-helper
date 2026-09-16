// App-shell service worker. Caches same-origin navigation/static assets so
// the installed app can open offline. Never intercepts /api/* — those calls
// carry no secrets client-side, but their freshness semantics are owned by
// the app's own IndexedDB caching layer, not the browser cache.

const CACHE_NAME = "parlay-helper-shell-v3";
const OFFLINE_URL = "/capture";
// Minimal fallback if the generated manifest can't be fetched (e.g. this
// exact build never ran the postbuild step). The real list — every route's
// actual JS/CSS/font chunks, not just its HTML document — comes from
// precache-manifest.json, written by scripts/generate-precache-manifest.mjs
// straight out of this build's own output, so it can't drift from what a
// route actually needs to render offline.
const FALLBACK_APP_SHELL_URLS = ["/capture", "/bucket", "/builder", "/history", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const manifestResponse = await fetch("/precache-manifest.json");
        if (!manifestResponse.ok) throw new Error("manifest not found");
        const urls = await manifestResponse.json();
        await cache.addAll(urls);
      } catch {
        await cache.addAll(FALLBACK_APP_SHELL_URLS);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offlineShell = await cache.match(OFFLINE_URL);
          if (offlineShell) return offlineShell;
        }
        throw new Error("offline and not cached");
      }
    })(),
  );
});
