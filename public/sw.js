/* WaktuSolat service worker — optional offline support for displays.
 * - Hashed Next.js assets: cache-first (immutable).
 * - Display pages + /api/display payloads: network-first, cached fallback.
 * - Published media (Supabase public URLs): cache-first; pruned to the
 *   set the page reports as current, so caches don't grow unbounded.
 * Admin pages and all other API routes are never cached.
 */
const VERSION = "v1";
const SHELL = `ws-shell-${VERSION}`;
const MEDIA = `ws-media-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (!key.endsWith(VERSION)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const isMedia = (url) => url.pathname.includes("/storage/v1/object/public/waktusolat-media/");
const isPrivate = (url) => /^\/(admin|master|login|register|permohonan|auth)(\/|$)/.test(url.pathname);

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.headers.has("range")) return; // let video range requests hit the network

  if (url.origin === self.location.origin) {
    if (isPrivate(url)) return;
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(req, SHELL));
    } else if (url.pathname.startsWith("/api/display/") && !url.pathname.endsWith("/heartbeat")) {
      event.respondWith(networkFirst(req, SHELL));
    } else if (req.mode === "navigate" && /^\/[a-z0-9-]{3,60}$/.test(url.pathname)) {
      event.respondWith(networkFirst(req, SHELL));
    }
    return;
  }
  if (isMedia(url)) event.respondWith(cacheFirst(req, MEDIA));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "keep-media" || !Array.isArray(data.urls)) return;
  const keep = new Set(data.urls.map((u) => u.split("?")[0]));
  event.waitUntil((async () => {
    const cache = await caches.open(MEDIA);
    for (const req of await cache.keys()) {
      if (!keep.has(req.url.split("?")[0])) await cache.delete(req);
    }
  })());
});
