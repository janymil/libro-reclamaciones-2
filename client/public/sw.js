/**
 * Service worker (Phase 3.13 - PWA).
 *
 * Deliberately conservative so the app is installable and works offline for
 * the static shell, without ever caching personal data:
 *   - Documents (HTML navigations): NETWORK FIRST, the cache is only the offline
 *     fallback. The shell is what points at the hashed bundles, so serving a
 *     cached copy after a deploy is exactly how a customer ends up staring at
 *     last week's UI with no way to refresh out of it.
 *   - Static assets (same-origin GETs that are not /api/*): cache-first.
 *   - Everything else (all /api requests, other origins): network only.
 *
 * CACHE_NAME is versioned on purpose: bumping it makes the incoming worker drop
 * the previous cache in `activate`, and — if that cache was there — reload the
 * tabs that were still rendering from it, so the user does not have to know that
 * a hard refresh (or DevTools) was needed. `GET /reset.html` is the manual
 * escape hatch for a browser that is already stuck.
 */

const CACHE_NAME = "librodigital-shell-v2";
// `/` is NOT precached: it is served network-first (see below).
const SHELL_URLS = ["/estado", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Was this browser running on an older shell? (Its cache is about to go.)
      const hadStaleCache = keys.some((key) => key !== CACHE_NAME);

      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();

      // A tab rendered FROM the stale shell cannot show the new code until it
      // reloads, and the person looking at it has no reason to suspect that.
      // Reload those tabs once, for them. Only when there was something stale,
      // so this can never turn into a reload loop.
      if (hadStaleCache) {
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.all(
          clients.map((client) => client.navigate(client.url).catch(() => undefined)),
        );
      }
    })(),
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

  // HTML: the network decides what the app is; the cache only covers offline.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match(request)) ?? (await caches.match("/estado"));
          return cached ?? Response.error();
        }),
    );
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
