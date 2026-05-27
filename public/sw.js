/* CCMGC Ticketing — service worker minimal con fallback offline + cache de assets.
 *
 * Estrategias:
 *  - `install`: pre-cachea la página `/offline`.
 *  - Activos estáticos de Next.js (`/_next/static/`, `/icons/`, `/manifest…`):
 *    cache-first (los archivos están fingerprinted, son inmutables).
 *  - Navegaciones (HTML): network-first con fallback a `/offline` si la red
 *    falla.
 *  - Resto: pasa por la red sin tocar la cache.
 *
 * No interceptamos solicitudes a `/api/…` para evitar respuestas
 * desactualizadas en operaciones críticas (tickets, desvíos).
 */

const STATIC_CACHE = "ccmgc-static-v2";
const OFFLINE_CACHE = "ccmgc-offline-v2";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, OFFLINE_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Nunca cacheamos llamadas API: deben tener siempre datos frescos.
  if (url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, cloned));
            }
            return response;
          })
          .catch(() => caches.match(OFFLINE_URL) || Response.error());
      }),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached ?? Response.error();
      }),
    );
  }
});
