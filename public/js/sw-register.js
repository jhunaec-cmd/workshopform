// Registers the service worker (see /service-worker.js) so the app can be
// installed on a phone, tablet or PC home screen.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => console.warn("Service worker not registered:", err));
  });
}
