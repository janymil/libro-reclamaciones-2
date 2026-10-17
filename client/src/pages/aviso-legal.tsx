import { Link } from 'wouter';
import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import {
  LIBRO_DE_RECLAMACIONES_PENDING,
  LIBRO_DE_RECLAMACIONES_URL,
  OPERATOR,
} from '@/lib/platform-legal';
import { CONTACT_INFO } from '@/lib/constants';

/**
 * Aviso legal: la ficha del prestador y las reglas de uso del sitio.
 *
 * Es la página que responde la pregunta "¿quién está detrás de esta web?" sin
 * obligar al visitante a leer los términos completos, y por eso concentra los
 * datos de identificación (nombre del negocio, RUC, contacto y domicilio cuando
 * se publique) que exige el art. 2.1 del Código de Protección y Defensa del
 * Consumidor para la contratación a distancia.
 */
export default function AvisoLegalPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Aviso legal"
      lead="Quién presta el servicio LibroDigital.pe, con qué datos se identifica y bajo qué reglas se puede usar este sitio web."
      testId="aviso-legal-page"
    >
      <LegalSection title="1. Datos del prestador">
        <p>
          El titular y operador de este sitio web es <strong>{OPERATOR.businessName}</strong>, RUC{' '}
          <strong>{OPERATOR.ruc}</strong>.
        </p>
        <LegalList
          items={[
            <>
              Correo electrónico:{' '}
              <a
                href={`mailto:${OPERATOR.email}`}
                className="underline underline-offset-2 text-[#c02b0a]"
              >
                {OPERATOR.email}
              </a>
            </>,
            <>
              Teléfono / WhatsApp:{' '}
              <a href={`tel:${OPERATOR.phoneHref}`} className="underline underline-offset-2 text-[#c02b0a]">
                {OPERATOR.phone}
              </a>
            </>,
            <>Sitio web: {OPERATOR.website}</>,
            ...(OPERATOR.address ? [<>Domicilio: {OPERATOR.address}</>] : []),
          ]}
        />
        <p>
          Estos datos identifican al proveedor del servicio y son el canal para consultas, soporte y
          reclamos.
        </p>
      </LegalSection>

      <LegalSection title="2. Naturaleza del servicio">
        <p>
          LibroDigital.pe es una plataforma privada de software como servicio (SaaS) que ayuda a las
          empresas peruanas a gestionar su Libro de Reclamaciones. No es un organismo del Estado, no
          pertenece a INDECOPI y no emite actos administrativos ni resoluciones.
        </p>
        <p>
          Los textos normativos que publicamos (Ley N.° 29571, DS 011-2011-PCM, DS 101-2022-PCM, Ley
          N.° 29733 y su Reglamento) se citan con fines informativos. No constituyen asesoría legal:
          para una decisión jurídica concreta, consulte a un abogado.
        </p>
      </LegalSection>

      <LegalSection title="3. Uso de este sitio">
        <LegalList
          items={[
            'La información de la web es de carácter general y puede actualizarse sin aviso previo.',
            'Los precios y las funciones descritas se rigen por los términos y condiciones vigentes al momento de la compra.',
            'Debe usar el sitio de buena fe: no se permite intentar vulnerar su seguridad, interferir con su funcionamiento ni extraer datos de forma masiva.',
            'El acceso al panel requiere una cuenta; el portal de reclamaciones de cada empresa es público y no requiere registro.',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Propiedad intelectual">
        <p>
          El nombre LibroDigital.pe, su logotipo, el diseño del sitio, los textos, el software y las
          bases de datos son de titularidad del prestador o de sus licenciantes y están protegidos
          por la normativa de propiedad intelectual e industrial. Se permite citar el contenido con
          mención de la fuente; no se permite reproducirlo con fines comerciales sin autorización
          escrita.
        </p>
      </LegalSection>

      <LegalSection title="5. Enlaces a sitios de terceros">
        <p>
          La web incluye enlaces a sitios oficiales (por ejemplo, INDECOPI o el Ministerio de
          Justicia) y a servicios de terceros. No controlamos su contenido ni sus políticas, y no
          respondemos por ellos: su uso se rige por sus propias condiciones.
        </p>
      </LegalSection>
      <LegalSection title="6. Protección de datos personales">
        <p>
          El tratamiento de datos personales se describe en la{' '}
          <Link href="/privacidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de privacidad
          </Link>{' '}
          y en la{' '}
          <Link href="/accesibilidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de cookies
          </Link>
          . Si usted es consumidor de una empresa que usa la plataforma, sus datos son tratados por
          esa empresa como responsable, y la política aplicable es la de su Libro de Reclamaciones.
        </p>
      </LegalSection>

      <LegalSection title="7. Libro de Reclamaciones de la plataforma">
        <p>
          Conforme al artículo 150 del Código de Protección y Defensa del Consumidor (Ley N.° 29571,
          modificado por la Ley N.° 32495), también nosotros contamos con un Libro de Reclamaciones a
          disposición de nuestros clientes:
        </p>
        <p>
          <a
            href={LIBRO_DE_RECLAMACIONES_URL}
            className="inline-flex items-center gap-1.5 font-semibold text-[#c02b0a] underline underline-offset-2"
            data-testid="link-libro-reclamaciones"
          >
            Libro de Reclamaciones virtual de {OPERATOR.businessName}
          </a>
          {LIBRO_DE_RECLAMACIONES_PENDING && (
            <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5c5246]">
              (enlace disponible próximamente)
            </span>
          )}
        </p>
        <p>
          También puede registrar su reclamo escribiendo a {OPERATOR.email} o llamando al{' '}
          {OPERATOR.phone}: le entregaremos la constancia de recepción y la respuesta por escrito en
          un plazo no mayor a 15 días hábiles.
        </p>
        <p>
          Si no quedara conforme con nuestra respuesta, puede acudir a INDECOPI:{' '}
          {CONTACT_INFO.INDECOPI_EMAIL}, teléfono {CONTACT_INFO.INDECOPI_PHONE}, o{' '}
          {CONTACT_INFO.INDECOPI_WEBSITE}. Presentar un reclamo no limita otras vías de solución ni es
          condición previa para denunciar ante la autoridad competente.
        </p>
      </LegalSection>

      <LegalSection title="8. Responsabilidad y ley aplicable">
        <p>
          El sitio se ofrece tal como está disponible. Procuramos que la información sea exacta y
          esté actualizada, pero no garantizamos la ausencia de errores ni la disponibilidad
          ininterrumpida del servicio; el estado técnico se publica en{' '}
          <Link href="/estado" className="underline underline-offset-2 text-[#c02b0a]">
            /estado
          </Link>
          .
        </p>
        <p>
          Este aviso se rige por la legislación peruana. Las condiciones del servicio, los pagos y la
          cancelación están en los{' '}
          <Link href="/terminos" className="underline underline-offset-2 text-[#c02b0a]">
            términos y condiciones
          </Link>
          . Cualquier consulta sobre este aviso: {OPERATOR.email}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
