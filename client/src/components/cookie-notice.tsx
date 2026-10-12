import { useEffect, useState } from "react";
import { Link } from "wouter";

/**
 * Cookie notice (Phase 3.13): the app only uses an essential session cookie,
 * so this is an informative banner (no consent needed for strictly necessary
 * cookies under the Peruvian data protection framework). Dismissable and
 * remembered in localStorage.
 */
export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem("cookie-notice-dismissed") !== "1");
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 bg-gray-900 text-white px-4 py-3"
      role="region"
      aria-label="Aviso de cookies"
      data-testid="cookie-notice"
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center gap-3">
        <p className="text-sm flex-1">
          Usamos una cookie esencial de sesión para mantener su sesión iniciada. Sin publicidad ni
          seguimiento. Más información en{" "}
          <Link href="/accesibilidad" className="underline">
            nuestra política
          </Link>
          .
        </p>
        <button
          type="button"
          className="bg-white text-gray-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-100"
          onClick={() => {
            localStorage.setItem("cookie-notice-dismissed", "1");
            setVisible(false);
          }}
          data-testid="button-dismiss-cookies"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
