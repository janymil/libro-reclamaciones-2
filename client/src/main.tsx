import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA (Phase 3.13): register the service worker in production builds only,
// so development hot-reload is never served from a stale cache.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] service worker registration failed:", error);
    });
  });
}
