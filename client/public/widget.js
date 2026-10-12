/**
 * Embeddable intake widget (Phase 3.12).
 *
 * Usage: paste this before </body> on any online store:
 *
 *   <script src="https://APP_HOST/widget.js" data-slug="company-slug" defer></script>
 *
 * Renders a floating button that opens the public Libro de Reclamaciones in a
 * framed modal, so consumers can file complaints without leaving the store.
 * Vanilla JS on purpose: no framework, no build step, ~1 KB.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    return;
  }

  var slug = script.getAttribute("data-slug");
  if (!slug) {
    console.error("[librovirtual-widget] falta el atributo data-slug");
    return;
  }

  var src = script.src.replace(/\/widget\.js.*$/, "");
  var embedUrl = src + "/libro/" + encodeURIComponent(slug) + "?embed=1";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Libro de Reclamaciones");
  button.textContent = "Libro de Reclamaciones";
  button.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
    "background:#3b82f6;color:#fff;border:none;border-radius:999px;" +
    "padding:12px 20px;font:600 14px/1 -apple-system,'Segoe UI',Roboto,sans-serif;" +
    "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);";

  var backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.6);" +
    "display:none;align-items:center;justify-content:center;padding:16px;";

  var frame = document.createElement("iframe");
  frame.src = embedUrl;
  frame.title = "Libro de Reclamaciones";
  frame.style.cssText =
    "width:100%;max-width:720px;height:90%;max-height:860px;border:none;" +
    "border-radius:12px;background:#fff;";

  var close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Cerrar");
  close.textContent = "\u00d7";
  close.style.cssText =
    "position:absolute;top:8px;right:12px;background:none;border:none;" +
    "color:#fff;font-size:28px;cursor:pointer;";

  backdrop.appendChild(close);
  backdrop.appendChild(frame);

  function openWidget() {
    backdrop.style.display = "flex";
    close.focus();
  }

  function closeWidget() {
    backdrop.style.display = "none";
    button.focus();
  }

  button.addEventListener("click", openWidget);
  close.addEventListener("click", closeWidget);
  backdrop.addEventListener("click", function (event) {
    if (event.target === backdrop) {
      closeWidget();
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && backdrop.style.display === "flex") {
      closeWidget();
    }
  });

  function mount() {
    document.body.appendChild(button);
    document.body.appendChild(backdrop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
