/*
  service-worker.js
  Runs in the background. Browsers need it before they offer "Install app".
  It also keeps a copy of the app's own files (HTML/CSS/JS/icons) so the
  screen can still open with a weak signal.

  Strategy: NETWORK FIRST. Always try the server for the newest files, and
  only use the saved copy if the network fails. This means app updates show
  up straight away - no "stuck on the old version" problem.
  Job data (/api/...) is never cached: it must always be live.
*/
const CACHE_NAME = "aec-workshop-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isOwnFile = url.origin === self.location.origin && !url.pathname.startsWith("/api/");
  if (event.request.method !== "GET" || !isOwnFile) return; // let the browser handle it normally

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
