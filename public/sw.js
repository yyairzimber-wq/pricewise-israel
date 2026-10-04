/*
 * PriceWise service worker — makes the app installable and usable with a weak
 * or no connection (e.g. inside a supermarket).
 *
 *  - app shell (HTML):      network first, cached copy when offline
 *  - /assets/* (hashed):    cache first (the file name changes with every build)
 *  - price snapshot JSON:   stale-while-revalidate (instant, refreshed in the background)
 *  - OCR engine (jsdelivr): cache first
 *  - everything else (e.g. the POST to /api/recognize): untouched
 */
const VERSION = "v1";
const SHELL = `pw-shell-${VERSION}`;
const ASSETS = `pw-assets-${VERSION}`;
const DATA = `pw-data-${VERSION}`;
const MAX_DATA_ENTRIES = 600;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, DATA]);
      for (const key of await caches.keys()) if (key.startsWith("pw-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request)) || (await cache.match(new URL("./", self.registration.scope).href));
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        trim(cache, MAX_DATA_ENTRIES);
      }
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const res = await refresh;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL));
  } else if (sameOrigin && url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(event, request));
  } else if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(request, ASSETS));
  } else if (sameOrigin && (url.pathname.endsWith(".svg") || url.pathname.endsWith(".png") || url.pathname.endsWith(".webmanifest"))) {
    event.respondWith(networkFirst(request, SHELL));
  }
});
