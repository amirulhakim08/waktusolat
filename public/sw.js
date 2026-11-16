/* WaktuSolat service worker — offline support for TV displays.
 *
 * Goal: a display that has loaded once keeps working when the internet
 * drops, including after a browser reload or a TV/Raspberry Pi restart.
 *
 * - App shell: the display page itself plus every same-origin asset it used
 *   (JS/CSS chunks, icons) is precached on request from the page, so a
 *   reload works offline even if those assets were downloaded before this
 *   worker took control.
 * - /api/display/* payloads: network-first, cached fallback.
 * - Published media (Supabase public URLs): ALL items of the current
 *   playlist are downloaded in the background (not only those already
 *   shown) and served cache-first; media no longer published is pruned so
 *   the cache does not grow without bound.
 * Admin pages and all other API routes are never cached.
 */
const VERSION = "v2";
const SHELL = `ws-shell-${VERSION}`;
const MEDIA = `ws-media-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("ws-") && !key.endsWith(VERSION)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const isMedia = (url) => url.pathname.includes("/storage/v1/object/public/waktusolat-media/");
const isPrivate = (url) => /^\/(admin|master|login|register|permohonan|auth)(\/|$)/.test(url.pathname);
const isDisplayPage = (url) => /^\/[a-z0-9-]{3,60}\/?$/.test(url.pathname);
const isShellAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.png";

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      // Tell the page this came from the offline cache, not the network.
      const headers = new Headers(hit.headers);
      headers.set("x-ws-offline-cache", "1");
      return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
    }
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
  if (req.headers.has("range")) return; // video range requests go to the network

  if (url.origin === self.location.origin) {
    if (isPrivate(url)) return;
    if (isShellAsset(url)) {
      event.respondWith(cacheFirst(req, SHELL));
    } else if (url.pathname.startsWith("/api/display/") && !url.pathname.endsWith("/heartbeat")) {
      event.respondWith(networkFirst(req, SHELL));
    } else if (req.mode === "navigate" && isDisplayPage(url)) {
      event.respondWith(networkFirst(req, SHELL));
    }
    return;
  }
  if (isMedia(url)) event.respondWith(cacheFirst(req, MEDIA));
});

/** Download into a cache, skipping what is already there; never throws. */
async function store(cacheName, urls, init) {
  const cache = await caches.open(cacheName);
  let stored = 0;
  for (const u of urls) {
    try {
      if (await cache.match(u, { ignoreSearch: true })) continue;
      const res = await fetch(u, init);
      if (res.ok && res.type !== "opaque") {
        await cache.put(u, res);
        stored++;
      }
    } catch { /* offline or evicted: try again next time */ }
  }
  return stored;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (!Array.isArray(data.urls)) return;

  if (data.type === "precache-shell") {
    // Same-origin display page + assets only; never private routes.
    const urls = data.urls.filter((u) => {
      try {
        const url = new URL(u, self.location.origin);
        return url.origin === self.location.origin && !isPrivate(url) && (isShellAsset(url) || isDisplayPage(url));
      } catch { return false; }
    });
    event.waitUntil(store(SHELL, urls, { credentials: "same-origin" }));
  }

  if (data.type === "keep-media") {
    const keep = new Set(data.urls.map((u) => u.split("?")[0]));
    event.waitUntil((async () => {
      const cache = await caches.open(MEDIA);
      for (const req of await cache.keys()) {
        if (!keep.has(req.url.split("?")[0])) await cache.delete(req);
      }
      // Fetch every published item now, not only those already shown.
      await store(MEDIA, data.urls.filter((u) => isMedia(new URL(u))), { mode: "cors", credentials: "omit" });
    })());
  }
});
