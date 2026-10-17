/**
 * Declaración de accesibilidad y política de cookies (Phase 3.13).
 * Standalone page (no auth), as WCAG 2.1 AA statements should be.
 */
import BackToTop from "@/components/layout/back-to-top";

export default function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-surface py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accesibilidad y cookies</h1>
          <p className="text-gray-600 mt-2">
            Compromiso de LibroDigital.pe con la accesibilidad digital y la transparencia sobre cookies.
          </p>
        </div>

        <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Declaración de accesibilidad</h2>
          <p className="text-gray-700">
            LibroDigital.pe se compromete a garantizar la accesibilidad de sus portales públicos y
            panel de gestión, de acuerdo con el <strong>WCAG 2.1 nivel AA</strong>. La accesibilidad
            es especialmente relevante aquí: todo consumidor tiene derecho a registrar una
            reclamación, sin importar cómo usa la web.
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Contenido estructurado con encabezados y regiones landmark navegables.</li>
            <li>Enlaces "saltar al contenido principal" en todas las páginas.</li>
            <li>Contrastes de color que cumplen el ratio 4.5:1 del nivel AA.</li>
            <li>Etiquetas asociadas a todos los campos de formulario y mensajes de error descriptivos.</li>
            <li>Funcionalidad operable por teclado, incluido el envío de reclamaciones.</li>
            <li>Imágenes y controles con nombres accesibles (aria-label cuando corresponde).</li>
          </ul>
          <p className="text-gray-700">
            Si encuentra alguna barrera de accesibilidad, escríbanos a{" "}
            <a href="mailto:hola@librodigital.pe" className="text-primary underline">
              hola@librodigital.pe
            </a>{" "}
            y la corregiremos con prioridad.
          </p>
        </section>

        <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Política de cookies</h2>
          <p className="text-gray-700">Utilizamos únicamente cookies esenciales:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>
              <strong>connect.sid</strong> — cookie de sesión necesaria para mantener su sesión
              iniciada en el panel de gestión. No se usa para publicidad ni seguimiento.
            </li>
          </ul>
          <p className="text-gray-700">
            El portal público de reclamaciones no requiere cookies. No utilizamos cookies de
            terceros, publicidad ni analítica con seguimiento. Su aceptación no es necesaria para
            el uso esencial del servicio (Ley N° 29733 y Directivas de la Autoridad Nacional de
            Protección de Datos Personales).
          </p>
        </section>

        <p className="text-center text-sm">
          <a href="/" className="text-primary hover:underline">Volver al inicio</a>
        </p>
      </div>
      <BackToTop />
    </div>
  );
}
