// App-shell service worker. Caches same-origin navigation/static assets so
// the installed app can open offline. Never intercepts /api/* — those calls
// carry no secrets client-side, but their freshness semantics are owned by
// the app's own IndexedDB caching layer, not the browser cache.

const CACHE_NAME = "parlay-helper-shell-v1";
const OFFLINE_URL = "/capture";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.json"]))
      .then(() => self.skipWaiting()),
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
