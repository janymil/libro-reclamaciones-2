import { ExternalLink, Landmark, TriangleAlert } from 'lucide-react';
import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import {
  FINE_CAPS,
  LEGAL_NORMS,
  PENDING_BOOK_REGULATION,
  UIT_2026,
  UIT_2026_NORM,
} from '@/lib/legal-norms';
import { RETENTION_MONTHS, TRIAL_DAYS } from '@shared/plans';

/**
 * Marco normativo del Libro de Reclamaciones.
 *
 * Esta página responde una pregunta concreta: "¿qué normas me obligan y dónde
 * las leo?". Por eso cada entrada dice qué artículo se aplica, qué hace la
 * plataforma al respecto y enlaza el documento oficial. No es asesoría legal y
 * así se declara.
 */
export default function NormativaPage() {
  const soles = (uit: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })
      .format(uit * UIT_2026);

  return (
    <LegalPage
      eyebrow="Normativa"
      title="Marco legal del Libro de Reclamaciones"
      lead="Las ocho normas vigentes que gobiernan el Libro de Reclamaciones en el Perú, qué artículo se aplica en cada caso y el enlace al documento oficial. Esta página es informativa y no reemplaza asesoría legal."
      testId="normativa-page"
    >
      <LegalSection title="1. Normas aplicables">
        <p>
          Todas las normas de esta lista están vigentes y se verificaron contra el repositorio
          oficial del Estado. Las que tienen enlace directo abren el texto publicado por INDECOPI,
          la PCM o la Autoridad Nacional de Protección de Datos Personales.
        </p>
        <ul className="mt-2 space-y-5">
          {LEGAL_NORMS.map((norm, index) => (
            <li key={norm.id} data-testid={`norm-${norm.id}`} className="border-l-2 border-[#e3d9c6] pl-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#5c5246]">
                {String(index + 1).padStart(2, '0')} · {norm.published}
              </p>
              <p className="mt-1 font-display text-base font-semibold text-[#1b1611]">{norm.label}</p>
              <p className="mt-1">{norm.summary}</p>
              <p className="mt-1 font-mono text-xs text-[#5c5246]">{norm.articles}</p>
              <a
                href={norm.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#c02b0a] underline underline-offset-2"
              >
                {norm.hrefLabel}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="2. Qué hace la plataforma con cada norma">
        <LegalList
          items={[
            <>
              <strong>Plazo de 15 días hábiles improrrogables</strong> (art. 152 del Código, modificado
              por la Ley N.° 31435): la plataforma calcula la fecha límite con el calendario de
              feriados peruanos y alerta antes del vencimiento. No existe prórroga legal.
            </>,
            <>
              <strong>Libro virtual y constancia</strong> (Reglamento, DS N.° 011-2011-PCM y sus
              modificatorias): el formulario replica los campos del Anexo I vigente y entrega al
              consumidor la constancia de recepción descargable.
            </>,
            <>
              <strong>Aviso obligatorio</strong> (Anexo II, con las medidas del DS N.° 006-2014-PCM):
              se genera el cartel A4 imprimible con el texto normado, y el enlace o widget para
              publicarlo en la web o en una plataforma de comercio electrónico (art. 151 del Código).
            </>,
            <>
              <strong>Conservación por 2 años</strong> (Reglamento): la plataforma conserva cada
              registro {RETENTION_MONTHS} meses y permite exportarlo para la fiscalización.
            </>,
            <>
              <strong>Datos personales</strong> (Ley N.° 29733 y DS N.° 016-2024-JUS): consentimiento
              informado en el formulario, acceso restringido por empresa, registro de auditoría y
              canales para ejercer los derechos ARCO.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Multas: topes por gravedad (art. 110)">
        <p>
          El Código fija topes en UIT según la gravedad de la infracción. La multa concreta se calcula
          con los factores del propio artículo 110, así que el tope no es el monto que se paga en
          todos los casos:
        </p>
        <LegalList
          items={FINE_CAPS.map(
            (cap) =>
              `${cap.label}: hasta ${cap.uit} UIT (${soles(cap.uit)} con la UIT 2026 de ${soles(UIT_2026)}).`,
          )}
        />
        <p>
          Valor de la UIT aplicable:{' '}
          <a
            href={UIT_2026_NORM.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-[#c02b0a]"
          >
            {UIT_2026_NORM.label}
          </a>
          .
        </p>
      </LegalSection>
      <LegalSection title="4. Norma en trámite: no la aplique todavía" testId="pending-norm">
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#c02b0a]" aria-hidden="true" />
          <span>
            <strong>{PENDING_BOOK_REGULATION.label}</strong> — {PENDING_BOOK_REGULATION.published}.
          </span>
        </p>
        <p>{PENDING_BOOK_REGULATION.summary}</p>
        <a
          href={PENDING_BOOK_REGULATION.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[#c02b0a] underline underline-offset-2"
        >
          Ver la resolución que publica el proyecto
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <p>
          Mientras no se publique el Decreto Supremo, sigue vigente el Reglamento aprobado por DS N.°
          011-2011-PCM con las modificaciones de 2014 y 2022.
        </p>
      </LegalSection>

      <LegalSection title="5. Cómo leer esta página">
        <p className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-[#c02b0a]" aria-hidden="true" />
          <span>
            Los resúmenes son informativos y no sustituyen el texto oficial ni la asesoría de un
            abogado. Si una norma cambia, el texto publicado en gob.pe prevalece sobre esta página;
            escriba a nuestro correo si detecta un enlace desactualizado y lo corregimos.
          </span>
        </p>
        <p>
          El listado de normas que el cliente debe cumplir no depende del plan contratado: la
          obligación es del proveedor y la plataforma solo la facilita. El servicio incluye{' '}
          {TRIAL_DAYS} días de prueba y no exime de ninguna de estas obligaciones.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
