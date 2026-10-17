import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Botón flotante "volver arriba" de las páginas públicas.
 *
 * Los documentos legales, la portada y el libro público son páginas largas que
 * el visitante recorre sin una barra lateral que lo oriente. El botón aparece
 * solo cuando ya se desplazó lo suficiente (no estorba en el primer pantallazo)
 * y es un `<button>` real: se alcanza con Tab, responde a Enter/Espacio y tiene
 * nombre accesible, como el resto de controles del sitio.
 *
 * No se monta en el panel autenticado: allí la navegación lateral y la cabecera
 * fija ya ofrecen el camino de vuelta, y el espacio inferior derecho lo ocupa el
 * copiloto de cumplimiento.
 */
const SHOW_AFTER_PX = 400;

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX);

    // Comprueba el estado inicial: un enlace directo con ancla o una recarga
    // pueden abrir la página ya desplazada.
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) {
    return null;
  }

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Volver arriba"
      title="Volver arriba"
      data-testid="button-back-to-top"
      className="fixed bottom-28 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#1b1611]/15 bg-[#1b1611] text-[#f7f2e8] shadow-[0_10px_28px_-10px_rgba(27,22,17,0.65)] transition-colors hover:bg-[#c02b0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f2e8] sm:bottom-24 sm:right-6"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
