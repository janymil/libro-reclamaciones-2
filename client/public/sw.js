/**
 * Service worker (Phase 3.13 - PWA).
 *
 * Deliberately conservative so the app is installable and works offline for
 * the static shell, without ever caching personal data:
 *   - Static assets (same-origin GETs that are not /api/*): cache-first.
 *   - Everything else (all /api requests, other origins): network only.
 */

const CACHE_NAME = "librovirtual-shell-v1";
const SHELL_URLS = ["/", "/estado", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
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
  const request = event.request;

  // Never touch API traffic or non-GET requests: complaint data must always
  // come fresh from the server and never live in a cache.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
