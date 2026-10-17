import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, BookOpenCheck, ExternalLink, Mail, Phone } from 'lucide-react';
import { BrandMark } from '@/components/landing/brand';
import BackToTop from '@/components/layout/back-to-top';
import {
  LEGAL_DOCUMENTS,
  LEGAL_LAST_UPDATED,
  LIBRO_DE_RECLAMACIONES_PENDING,
  LIBRO_DE_RECLAMACIONES_URL,
  OPERATOR,
} from '@/lib/platform-legal';

/**
 * Molde de los documentos legales públicos (términos, privacidad, aviso legal).
 *
 * Los tres comparten estructura por una razón práctica y no solo estética: el
 * visitante tiene que poder leer el documento, ver quién lo presta y saltar al
 * documento hermano sin volver a la portada. Por eso el molde ya trae el
 * encabezado con la marca, la fecha de última revisión, la ficha del operador y
 * el índice de documentos; cada página solo aporta su título y sus secciones.
 *
 * Usa el tema editorial de la portada (`.landing-root` / `.landing-paper`) en
 * lugar del tema de la aplicación: son páginas de la web corporativa, no del
 * panel, y el contraste y la tipografía ya cumplen el nivel AA declarado en
 * /accesibilidad.
 */

interface LegalPageProps {
  /** Etiqueta corta en versalitas sobre el título, p. ej. "Legal". */
  eyebrow: string;
  title: string;
  /** Resumen de una o dos frases que explica el alcance del documento. */
  lead: string;
  children: ReactNode;
  testId: string;
  /**
   * La fecha de revisión solo tiene sentido en documentos legales, no en una
   * página de "nosotros": se puede ocultar explícitamente.
   */
  showLastUpdated?: boolean;
}

export function LegalPage({
  eyebrow,
  title,
  lead,
  children,
  testId,
  showLastUpdated = true,
}: LegalPageProps) {
  return (
    <div className="landing-root landing-paper min-h-screen" data-testid={testId}>
      <header className="border-b border-[#e3d9c6] bg-[#f7f2e8]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Ir a la página de inicio de LibroDigital.pe">
            <BrandMark />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Inicio
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#c02b0a]">{eyebrow}</p>
        <h1 className="mt-3 text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-[#5c5246]">{lead}</p>
        {showLastUpdated && (
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-[#5c5246]">
            Última actualización: {LEGAL_LAST_UPDATED}
          </p>
        )}

        <div className="mt-10 space-y-6">{children}</div>

        <OperatorCard />
        <LegalIndex />
      </main>

      <footer className="border-t border-[#e3d9c6] px-5 py-8 text-center text-xs text-[#5c5246] sm:px-8">
        <p translate="no">© 2026 LibroDigital.pe</p>
      </footer>

      {/* Documento largo: el visitante puede volver arriba sin recorrerlo entero. */}
      <BackToTop />
    </div>
  );
}

/** Bloque de una sección: título + párrafos y listas que aporte la página. */
export function LegalSection({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-[3px] border border-[#e3d9c6] bg-[#fdfaf3] p-6 sm:p-7"
      data-testid={testId}
    >
      <h2 className="font-display text-xl font-semibold tracking-tight text-[#1b1611]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#3f382f]">{children}</div>
    </section>
  );
}

/** Lista con viñetas dentro de una sección. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/** Ficha del prestador: quién responde por el servicio, con sus canales. */
function OperatorCard() {
  return (
    <section
      className="mt-12 rounded-[3px] border border-[#1b1611]/15 bg-[#fdfaf3] p-6 sm:p-7"
      aria-labelledby="prestador"
      data-testid="operator-identity"
    >
      <h2 id="prestador" className="font-mono text-xs uppercase tracking-[0.22em] text-[#5c5246]">
        Prestador del servicio
      </h2>
      <p className="mt-3 font-display text-lg font-semibold tracking-tight text-[#1b1611]">
        {OPERATOR.businessName} · RUC {OPERATOR.ruc}
      </p>
      <ul className="mt-4 space-y-2 text-sm text-[#3f382f]">
        {OPERATOR.address && <li>Domicilio: {OPERATOR.address}</li>}
        <li className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-[#c02b0a]" aria-hidden="true" />
          <a href={`tel:${OPERATOR.phoneHref}`} className="underline underline-offset-2">
            {OPERATOR.phone}
          </a>
        </li>
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#c02b0a]" aria-hidden="true" />
          <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2">
            {OPERATOR.email}
          </a>
        </li>
        <li className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-[#c02b0a]" aria-hidden="true" />
          <a
            href={`https://${OPERATOR.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {OPERATOR.website}
          </a>
        </li>
      </ul>
    </section>
  );
}

/** Índice de los demás documentos públicos + el Libro de Reclamaciones. */
function LegalIndex() {
  return (
    <nav aria-label="Otros documentos legales" className="mt-8 border-t border-[#e3d9c6] pt-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-[#5c5246]">
        Documentos y transparencia
      </h2>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {LEGAL_DOCUMENTS.map((document) => (
          <li key={document.href}>
            <Link
              href={document.href}
              data-testid={`footer-${document.testId}`}
              className="text-[#1b1611] underline underline-offset-2 transition-colors hover:text-[#c02b0a]"
            >
              {document.label}
            </Link>
          </li>
        ))}
        <li>
          <a
            href={LIBRO_DE_RECLAMACIONES_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-libro-reclamaciones"
            className="inline-flex items-center gap-1.5 text-[#1b1611] underline underline-offset-2 transition-colors hover:text-[#c02b0a]"
          >
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            Libro de Reclamaciones
            {LIBRO_DE_RECLAMACIONES_PENDING && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5246]">
                (enlace pronto)
              </span>
            )}
          </a>
        </li>
      </ul>
    </nav>
  );
}
