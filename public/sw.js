/*
 * Service worker pre Ski Club IS.
 *
 * BEZPEČNOSTNÉ PRAVIDLO: appka obsahuje rodné čísla, adresy a kontakty detí.
 * Preto sa do cache NIKDY neukladajú HTML stránky ani odpovede servera —
 * len nemenné statické súbory (build assety, ikony, manifest). Inak by
 * zostali osobné údaje v telefóne aj po odhlásení.
 */
// v2: zmena verzie zmaže starú cache, v ktorej mohli na localhoste uviaznuť
// nehashované vývojové súbory (pozri isImmutableAsset).
// v3: nové logo — ikony sú cache-first, bez zmeny verzie by telefóny držali staré.
// v4: nové ikony, rovnaký dôvod ako pri v3.
const CACHE = "app-static-v4";

/*
 * Vo vývoji (next dev na localhoste) nemajú súbory v /_next/static/ hash
 * v názve — „page.js“ je po každej zmene kódu stále „page.js“. Cache-first by
 * potom donekonečna podával starý JavaScript: stránka prišla nová zo servera,
 * ale komponenty v nej boli staré. Na localhoste preto necachujeme nič.
 */
const IS_DEV_HOST = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png", "/manifest.webmanifest"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Nemenné buildové súbory sa dajú cachovať bezpečne — v názve majú hash. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (!IS_DEV_HOST && isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Stránky idú vždy zo siete. Bez pripojenia ukážeme statickú offline hlášku.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

/* ---------- Push notifikácie ---------- */

self.addEventListener("push", (event) => {
  let payload = { title: "Ski Club IS", body: "Nová správa z klubu.", url: "/prehlad" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      lang: "sk",
      tag: payload.tag ?? "ski-club-is",
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? "/prehlad" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/prehlad";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Ak je appka otvorená, len ju prepneme na správnu stránku.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
