import { Link } from 'wouter';
import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import { OPERATOR } from '@/lib/platform-legal';
import {
  ENCARGADO_DECLARATION_HINTS,
  ENCARGADO_LIMITS,
  ENCARGADO_SECURITY,
  HOSTING_LOCATIONS,
} from '@shared/encargado';
import { RNPD_PROCEDURE_URL, SIPDP_URL } from '@shared/rnpd';
import { RETENTION_MONTHS } from '@shared/plans';

/**
 * Ficha del encargado del tratamiento.
 *
 * Existe por una razón concreta: cuando una empresa inscribe su banco de datos
 * en el RNPD, la ficha del SIPDP le pregunta si el tratamiento lo hace un
 * encargado y si hay flujo transfronterizo. Sin esta página el cliente tendría
 * que preguntarnos por correo y esperar; con ella, copia los datos y termina.
 *
 * No sustituye un contrato de encargo: lo resume en el mismo lenguaje del
 * Reglamento (DS N.° 016-2024-JUS).
 */
export default function EncargadoPage() {
  return (
    <LegalPage
      eyebrow="Datos personales"
      title="Ficha del encargado del tratamiento"
      lead="Qué datos trata LibroDigital por cuenta de tu empresa, dónde se alojan y qué debes declarar al inscribir tu banco de datos en el RNPD."
      testId="encargado-page"
    >
      <LegalSection title="1. Quién es quién">
        <p>
          La <strong>empresa</strong> que usa LibroDigital es la <strong>responsable</strong> (titular del
          banco de datos): decide qué datos se recogen, con qué finalidad y por cuánto tiempo, y responde
          ante la Autoridad Nacional de Protección de Datos Personales.
        </p>
        <p>
          <strong>{OPERATOR.businessName}</strong> (RUC {OPERATOR.ruc}), que opera LibroDigital.pe, es el{' '}
          <strong>encargado del tratamiento</strong>: aloja y trata esos datos únicamente por cuenta e
          instrucción de la empresa, para que el Libro de Reclamaciones funcione.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos y para qué">
        <p>
          El encargado trata los datos que el consumidor declara en el Libro (nombre, documento, domicilio,
          teléfono, correo y detalle del reclamo), los adjuntos de evidencia y los datos de la cuenta de la
          empresa. La finalidad es una sola: registrar, notificar, responder y conservar los reclamos, y
          permitir la exportación para una fiscalización.
        </p>
        <p>
          No se usan para publicidad, perfilado comercial ni para ninguna finalidad propia del encargado.
        </p>
      </LegalSection>

      <LegalSection title="3. Dónde se alojan los datos" testId="encargado-hosting">
        <ul className="mt-2 space-y-3">
          {HOSTING_LOCATIONS.map((location) => (
            <li key={location.what} className="border-l-2 border-[#e3d9c6] pl-4">
              <p className="font-medium text-[#1b1611]">{location.what}</p>
              <p className="text-sm">{location.provider}</p>
              {(location.region || location.country) && (
                <p className="text-sm">
                  {[location.region, location.country].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5c5246]">
                {location.abroad ? 'Flujo transfronterizo: sí' : 'Flujo transfronterizo: no'}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          Todo se aloja fuera del Perú: la base de datos en Brasil y los adjuntos de las reclamaciones en
          Estados Unidos. Por eso, al inscribir tu banco de datos, la ficha del SIPDP te pedirá declarar
          el flujo transfronterizo y los países de destino.
        </p>
      </LegalSection>

      <LegalSection title="4. Medidas de seguridad">
        <LegalList items={ENCARGADO_SECURITY} />
        <p className="mt-3">
          Los datos se conservan {RETENTION_MONTHS} meses desde el registro y después se eliminan. Si la
          empresa termina el servicio, sus datos y adjuntos se eliminan conforme al procedimiento de baja.
        </p>
      </LegalSection>

      <LegalSection title="5. Límites del encargado">
        <LegalList items={ENCARGADO_LIMITS} />
      </LegalSection>

      <LegalSection title="6. Qué declarar al inscribir tu banco de datos">
        <LegalList items={ENCARGADO_DECLARATION_HINTS} />
        <p className="mt-3">
          Datos del encargado para el formulario: <strong>{OPERATOR.businessName}</strong>, RUC{' '}
          <strong>{OPERATOR.ruc}</strong>, correo <strong>{OPERATOR.email}</strong>.
        </p>
        <p>
          <a
            href={RNPD_PROCEDURE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#c02b0a] underline underline-offset-2"
          >
            Ficha oficial del trámite
          </a>{' '}
          ·{' '}
          <a
            href={SIPDP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#c02b0a] underline underline-offset-2"
          >
            SIPDP
          </a>{' '}
          ·{' '}
          <Link href="/normativa" className="text-[#c02b0a] underline underline-offset-2">
            Marco normativo
          </Link>
        </p>
      </LegalSection>

      <LegalSection title="7. Contacto y derechos ARCO">
        <p>
          Para ejercer los derechos de acceso, rectificación, cancelación u oposición, o para reportar un
          incidente de seguridad, escribe a{' '}
          <a
            href={`mailto:${OPERATOR.email}`}
            className="text-[#c02b0a] underline underline-offset-2"
          >
            {OPERATOR.email}
          </a>
          . Si el dato está en el Libro de una empresa, la solicitud se atiende junto con esa empresa, que
          es la responsable.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
