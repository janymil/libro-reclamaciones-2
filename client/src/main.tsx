import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA (Phase 3.13).
//
// Production registers the service worker so the app is installable and the
// shell survives offline. Development registers nothing - hot reload must never
// come from a cache - but it DOES clean up: a worker left behind by a
// production build served on this same origin (very easy to hit on
// localhost:5000 after `npm run build && npm start`) would otherwise keep
// answering navigations with the old shell while the dev server serves the new
// code, which looks exactly like "my changes are not being applied".
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("[pwa] service worker registration failed:", error);
      });
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        if (registrations.length === 0) return;
        console.warn(`[dev] removing ${registrations.length} service worker(s) left by a production build`);
        return Promise.all(registrations.map((registration) => registration.unregister()));
      })
      .catch(() => undefined);

    // The caches it filled outlive the registration, so they go too.
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  }
}
