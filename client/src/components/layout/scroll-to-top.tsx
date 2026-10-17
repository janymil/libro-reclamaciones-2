import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Reinicia el scroll al cambiar de página.
 *
 * La aplicación es una SPA: al navegar con `wouter` el documento no se vuelve a
 * cargar y el navegador conserva la posición en la que estaba el visitante. Por
 * eso, al abrir un documento legal desde el pie de la portada (que está al
 * final de una página larga), el visitante aterrizaba en la mitad del texto
 * nuevo. Aquí se devuelve el comportamiento esperado: cada ruta empieza arriba.
 *
 * Detalles deliberados:
 *  - `useLayoutEffect` y no `useEffect`: el salto ocurre antes del primer pintado,
 *    así no se ve un fotograma del documento nuevo a media altura.
 *  - El primer render no se toca: una recarga o un enlace directo conservan la
 *    posición que el navegador haya restaurado.
 *  - Si la ruta destino trae un ancla (`/#precios`), se respeta el ancla en lugar
 *    de forzar el inicio.
 *  - `scroll-behavior: smooth` es global (index.css, para los enlaces internos de
 *    la portada). Se desactiva solo durante el salto para que el cambio de página
 *    sea instantáneo y no una animación desde el pie de la página anterior.
 */
export default function ScrollToTop() {
  const [location] = useLocation();
  const previousLocation = useRef(location);

  useLayoutEffect(() => {
    if (previousLocation.current === location) {
      return;
    }
    previousLocation.current = location;

    const { hash } = window.location;
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousBehavior;
  }, [location]);

  return null;
}
