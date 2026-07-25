/* CCMGC Ticketing — service worker minimal con fallback offline.

 *

 * Estrategias:

 *  - `install`: pre-cachea la página `/offline`.

 *  - `/_next/static/*`: NO interceptamos — Next ya los sirve con hash

 *    inmutable; cachearlos aquí provocaba HTML/404 servido como JS tras

 *    un despliegue (MIME text/html en chunks).

 *  - Iconos / manifest: cache-first (assets pequeños y estables).

 *  - Navegaciones (HTML): network-first con fallback a `/offline`.

 *  - Resto: pasa por la red sin tocar la cache.

 *

 * No interceptamos solicitudes a `/api/…` para evitar respuestas

 * desactualizadas en operaciones críticas (tickets, desvíos).

 */



const STATIC_CACHE = "ccmgc-static-v7";

const OFFLINE_CACHE = "ccmgc-offline-v7";

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



/** Solo assets públicos pequeños; nunca chunks de Next. */

function isSwCachedAsset(url) {

  return (

    url.pathname.startsWith("/icons/") ||

    url.pathname === "/manifest.webmanifest" ||

    url.pathname === "/favicon.ico"

  );

}



self.addEventListener("push", (event) => {

  let payload = { title: "CCMGC Ticketing", body: "Nueva notificación", url: "/bandeja", tag: "ccmgc" };

  try {

    if (event.data) payload = { ...payload, ...event.data.json() };

  } catch {

    /* ignore */

  }

  event.waitUntil(

    self.registration.showNotification(payload.title, {

      body: payload.body,

      tag: payload.tag,

      data: { url: payload.url },

      icon: "/icons/icon-192.png",

    }),

  );

});



self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  const url = event.notification.data?.url || "/bandeja";

  event.waitUntil(

    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {

      for (const client of clients) {

        if ("focus" in client) {

          client.navigate(url);

          return client.focus();

        }

      }

      return self.clients.openWindow(url);

    }),

  );

});



self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);



  if (url.pathname.startsWith("/api/")) return;



  // Chunks y CSS de Next: dejar pasar al navegador (evita MIME/HTML tras deploy).

  if (url.pathname.startsWith("/_next/")) return;



  if (isSwCachedAsset(url)) {

    event.respondWith(

      caches.match(event.request).then((cached) => {

        if (cached) return cached;

        return fetch(event.request).then((response) => {

          if (response.ok) {

            const cloned = response.clone();

            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, cloned));

          }

          return response;

        });

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


