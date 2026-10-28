/* Jatayu service worker.
 *
 * Strategy:
 *   - page navigations: network first, cache as fallback, so an online user
 *     always gets the newest build (a stale cache here once cost us a day)
 *   - same-origin assets: cache first, refresh in the background
 *   - cross-origin API calls: never cached, never intercepted
 */
const CACHE = "jatayu-v1";
const SHELL = ["./", "./jatayu.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API calls go straight to the network

  const isPage = req.mode === "navigate" || url.pathname.endsWith("jatayu.html") || url.pathname.endsWith("/");
  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./jatayu.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((res) => caches.open(CACHE).then((c) => c.put(req, res))).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
