import { Link } from 'wouter';
import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import { OPERATOR, LIBRO_DE_RECLAMACIONES_URL } from '@/lib/platform-legal';
import { LEGAL_RESPONSE_TIME_BUSINESS_DAYS, CONTACT_INFO } from '@/lib/constants';
import { PLANS, TRIAL_DAYS, RETENTION_MONTHS, LAUNCH_OFFER_ANNUAL_BASICO } from '@shared/plans';
import { HOSTING_LOCATIONS } from '@shared/encargado';

/**
 * Términos y condiciones del servicio: el contrato con la empresa que contrata
 * el panel, no con el consumidor que reclama en el libro de esa empresa.
 *
 * Las cifras no se escriben a mano: salen de `@shared/plans`, el mismo catálogo
 * que usa el checkout, de modo que este documento no puede quedar prometiendo un
 * límite o un precio distinto al que el cliente ve al pagar.
 */
export default function TerminosPage() {
  const free = PLANS.gratis;
  const basic = PLANS.esencial;
  const pro = PLANS.profesional;
  const business = PLANS.corporativo;

  return (
    <LegalPage
      eyebrow="Legal"
      title="Términos y condiciones"
      lead="Estas son las condiciones bajo las cuales se presta el servicio LibroDigital.pe. Al crear una cuenta o pagar un plan, usted las acepta en nombre de su empresa."
      testId="terminos-page"
    >
      <LegalSection title="1. Identificación del prestador">
        <p>
          El servicio LibroDigital.pe es prestado por <strong>{OPERATOR.businessName}</strong>, RUC{' '}
          <strong>{OPERATOR.ruc}</strong>, con canales de atención publicados en el{' '}
          <Link href="/aviso-legal" className="underline underline-offset-2 text-[#c02b0a]">
            aviso legal
          </Link>
          .
        </p>
        <p>
          LibroDigital.pe es un servicio privado e independiente. No es un organismo del Estado, no
          pertenece a INDECOPI y no reemplaza asesoría legal ni contable. Las normas que gobiernan el
          Libro de Reclamaciones, con sus enlaces oficiales, están en el{' '}
          <Link href="/normativa" className="underline underline-offset-2 text-[#c02b0a]">
            marco normativo
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Objeto y aceptación">
        <p>
          El servicio consiste en una plataforma en línea para que su empresa registre su Libro de
          Reclamaciones virtual, lo publique (enlace, código QR, cartel o widget), reciba reclamos y
          quejas, y los responda dentro del plazo legal.
        </p>
        <p>
          Al registrarse, crear una empresa o contratar un plan, usted declara tener facultades para
          obligar a la empresa contratante y acepta estos términos, la{' '}
          <Link href="/privacidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de privacidad
          </Link>{' '}
          y la{' '}
          <Link href="/accesibilidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de cookies
          </Link>
          .
        </p>
      </LegalSection>
      <LegalSection title="3. Responsabilidad sobre su Libro de Reclamaciones">
        <p>
          El Libro de Reclamaciones es suyo y de su empresa: la plataforma es la herramienta, no el
          proveedor responsable ante el consumidor. Por eso le corresponde:
        </p>
        <LegalList
          items={[
            'Mantener actualizados el nombre, el RUC, el domicilio, los teléfonos y el correo de cada establecimiento.',
            'Publicar el aviso y el enlace del Libro en cada local y en cada canal de venta por Internet o plataforma de comercio electrónico (art. 151 del Código).',
            'Atender y dar respuesta por escrito a cada reclamo o queja en el plazo legal de 15 días hábiles improrrogables (Ley N.° 29571, arts. 24 y 152, modificados por la Ley N.° 31435).',
            `Conservar las hojas y su constancia durante ${RETENTION_MONTHS} meses y entregarlas a la autoridad cuando las requiera.`,
          ]}
        />
        <p>
          La plataforma no responde por reclamos no atendidos, por plazos vencidos sin respuesta ni
          por el contenido de las respuestas que usted apruebe o envíe.
        </p>
      </LegalSection>

      <LegalSection title="4. Cuenta, usuarios y seguridad">
        <LegalList
          items={[
            'Cada persona accede con su propia cuenta; las credenciales son personales e intransferibles.',
            'Usted es responsable de la veracidad de los datos de la empresa y de los usuarios que invite.',
            'Debe mantener la confidencialidad de sus contraseñas y avisarnos de inmediato ante cualquier uso no autorizado.',
            'Los roles y permisos se administran desde el panel y las acciones sensibles quedan registradas para auditoría.',
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Prueba gratuita, planes y precios">
        <p>
          Toda cuenta nueva comienza con {TRIAL_DAYS} días de prueba con las funciones del plan{' '}
          {pro.name}. Al terminar la prueba, la empresa pasa al plan {free.name} (
          {free.limits.complaintsTotal} reclamos en total) salvo que contrate un plan de pago.
        </p>
        <p>
          Los planes vigentes y sus precios en soles se publican en la portada, en la sección
          Precios. En resumen:
        </p>
        <LegalList
          items={[
            `${free.name}: sin costo, ${free.limits.complaintsTotal} reclamos en total, ${free.limits.establishments} local y ${free.limits.users} usuario.`,
            `${basic.name}: reclamos ilimitados, ${basic.limits.establishments} local y ${basic.limits.users} usuarios, con reportes y exportación para fiscalización.`,
            `${pro.name}: hasta ${pro.limits.establishments} locales, ${pro.limits.businesses} RUCs y ${pro.limits.users} usuarios, con redacción de respuestas por IA y widget web.`,
            `${business.name}: hasta ${business.limits.businesses} RUCs, locales y usuarios ilimitados, con API, webhooks y registro de auditoría.`,
          ]}
        />
        <p>
          Los precios se expresan en soles (PEN). El comprobante se emite por el importe efectivamente
          cobrado; si el precio incluye IGV, se indica en el checkout antes de pagar. El precio anual
          tiene descuento frente al pago mes a mes y es el precio recomendado del servicio.
        </p>
        <p>
          Las ofertas de lanzamiento (como el plan {basic.name} a S/{' '}
          {LAUNCH_OFFER_ANNUAL_BASICO} el primer año para los primeros clientes) y los descuentos por
          varios años prepagados se rigen por lo indicado en la portada al momento de la compra, y se
          mantienen durante el periodo ya pagado.
        </p>
      </LegalSection>
      <LegalSection title="6. Pagos, comprobantes y renovación">
        <LegalList
          items={[
            'Los medios habilitados se muestran al pagar: tarjeta, Yape, Plin o pago en efectivo a través de la pasarela, y también transferencia o Yape directo con validación de nuestro equipo.',
            'Con tarjeta el cobro puede ser automático y recurrente: la suscripción se renueva sola al inicio de cada periodo hasta que usted la cancele.',
            'Los pagos por transferencia, Yape o efectivo se activan cuando el pago es confirmado; para seguir el siguiente periodo, se emite un nuevo pago.',
            'Emitimos el comprobante electrónico a nombre de la empresa y del RUC declarados en el panel. Verifique esos datos antes de pagar: el comprobante no se puede reemitir con otro RUC.',
            'Si un cobro automático es rechazado, avisamos al correo del titular, la suscripción queda pausada y el servicio vuelve al plan gratuito si el pago no se regulariza.',
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Cambios de plan y cancelación">
        <LegalList
          items={[
            'Puede subir de plan en cualquier momento: las funciones nuevas se habilitan al confirmarse el pago del periodo.',
            'La baja de plan se aplica al final del periodo ya pagado; no hay reembolso proporcional por el tiempo no usado.',
            'Puede cancelar la renovación automática desde el panel o escribiendo a nuestro correo, sin penalidad ni trámites previos.',
            `Al cancelar, su cuenta queda en el plan ${free.name}. Los reclamos registrados se conservan ${RETENTION_MONTHS} meses y usted puede exportarlos (PDF y Excel) antes de irse.`,
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Cancelación, devoluciones y garantía">
        <p>
          Puede cancelar la renovación automática en cualquier momento desde el panel o escribiendo a{' '}
          {OPERATOR.email}, sin penalidad ni trámites previos. La baja del plan se aplica al final del
          periodo ya pagado.
        </p>
        <p>
          Si el servicio no funciona conforme a lo ofrecido, corregimos el defecto o devolvemos el
          importe del periodo no usado. Escríbanos a {OPERATOR.email} o llame al {OPERATOR.phone}
          indicando la empresa, el plan y el comprobante del pago.
        </p>
        <p>
          Nada en estos términos limita el derecho de reclamar ante INDECOPI ni de registrar un
          reclamo en el Libro de Reclamaciones de la plataforma. Si su contratación se realizó a
          distancia y la ley prevé un derecho de retractación para ese supuesto, se lo informaremos y
          lo aplicaremos en los plazos que correspondan.
        </p>
      </LegalSection>

      <LegalSection title="9. Uso aceptable">
        <LegalList
          items={[
            'No usar el servicio para fines ilícitos, ni para registrar reclamos falsos o suplantar a un consumidor.',
            'No vulnerar la seguridad de la plataforma ni intentar acceder a datos de otra empresa.',
            'No cargar virus, código malicioso ni contenidos que infrinjan derechos de terceros.',
            'No revender, sublicenciar ni copiar la plataforma o su software sin autorización escrita.',
          ]}
        />
        <p>
          El incumplimiento puede llevar a la suspensión de la cuenta, sin perjuicio de las acciones
          legales que correspondan.
        </p>
      </LegalSection>

      <LegalSection title="10. Disponibilidad, soporte y datos">
        <p>
          Trabajamos para mantener el servicio disponible de forma continua, con mantenimientos
          programados avisados con antelación. El estado del sistema es público en{' '}
          <Link href="/estado" className="underline underline-offset-2 text-[#c02b0a]">
            /estado
          </Link>
          . El soporte se atiende en días hábiles por correo a {OPERATOR.email} y por
          teléfono/WhatsApp al {OPERATOR.phone}.
        </p>
        <p>
          Los datos se respaldan periódicamente. Aun así, no garantizamos una disponibilidad
          ininterrumpida: las caídas de Internet, de la pasarela de pagos, del proveedor de nube o
          del proveedor de inteligencia artificial están fuera de nuestro control.
        </p>
      </LegalSection>

      <LegalSection title="11. Protección de datos personales">
        <p>
          Tratamos los datos de su empresa y de sus usuarios como responsable, y los datos de los
          consumidores que reclaman en los libros de nuestros clientes como encargado del
          tratamiento, por encargo de cada empresa. Las finalidades, los plazos y los canales para
          ejercer los derechos ARCO están en la{' '}
          <Link href="/privacidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de privacidad
          </Link>
          . El alcance de ese encargo, las medidas de seguridad y la devolución de los datos están
          regulados en la cláusula 12.
        </p>
      </LegalSection>
      <LegalSection title="12. Encargo de tratamiento de datos personales" testId="encargo-tratamiento">
        <p>
          Esta cláusula regula el tratamiento de los datos personales de los consumidores que reclaman
          en el Libro de su empresa (el «encargo»). <strong>Su empresa es la responsable</strong> del
          banco de datos: decide qué datos se recogen y con qué finalidad, y responde ante los
          titulares y ante la Autoridad Nacional de Protección de Datos Personales (ANPD).{' '}
          <strong>{OPERATOR.businessName}</strong> actúa únicamente como{' '}
          <strong>encargado del tratamiento</strong>, por cuenta e instrucción de su empresa.
        </p>

        <p className="mt-3 font-medium">Alcance e instrucciones</p>
        <LegalList
          items={[
            'Tratamos los datos solo para prestar el servicio: registrar, notificar, responder y conservar los reclamos, y exportarlos cuando usted o la autoridad competente lo requieran. Cualquier otra finalidad requiere su instrucción escrita.',
            'No usamos esos datos para publicidad propia, perfilado comercial ni cesión a terceros, y no los mezclamos con los de otras empresas.',
            'Las personas y los proveedores que intervienen en el tratamiento están sujetos a deber de confidencialidad.',
            'Si necesitamos tratar los datos para otra finalidad, se lo pedimos por escrito y no lo hacemos hasta tener su autorización.',
          ]}
        />

        <p className="mt-3 font-medium">Seguridad, alojamiento y subencargados</p>
        <LegalList
          items={[
            `Aplicamos las medidas descritas en la ficha del encargado: acceso por roles, cifrado en tránsito (TLS), cifrado en reposo de la base de datos (AES-256) y de los adjuntos de evidencia (AES-256-GCM), registro de auditoría y respaldos.`,
            `La base de datos se aloja en ${HOSTING_LOCATIONS[0].provider}, región ${HOSTING_LOCATIONS[0].region} (${HOSTING_LOCATIONS[0].country}), y los archivos adjuntos en ${HOSTING_LOCATIONS[1].provider} (${HOSTING_LOCATIONS[1].country}). Es una transferencia transfronteriza que usted declara al inscribir su banco de datos en el RNPD.`,
            'Los proveedores de alojamiento tratan los datos solo para alojarlos.',
            'Le notificamos sin dilación indebida cualquier incidente de seguridad que afecte a sus datos, con la información disponible para que usted cumpla sus obligaciones ante la ANPD y los titulares.',
            'Le asistimos para atender las solicitudes de acceso, rectificación, cancelación y oposición (ARCO) de los titulares, por los canales de la política de privacidad.',
          ]}
        />

        <p className="mt-3 font-medium">Devolución y conservación</p>
        <LegalList
          items={[
            'Puede exportar sus datos y los adjuntos desde el panel en cualquier momento; si lo necesita en otro formato, lo pedimos por correo.',
            `Al terminar el servicio se desactiva el acceso y los datos se conservan únicamente durante ${RETENTION_MONTHS} meses, el plazo que exige la normativa de consumo, junto con sus adjuntos. Vencido ese plazo se eliminan o se anonimizan.`,
            'Si antes de ese plazo usted solicita la baja definitiva de la cuenta, se aplica el procedimiento de eliminación y se borran los datos y adjuntos, sin perjuicio de las conservaciones que la ley imponga.',
          ]}
        />

        <p className="mt-3">
          <strong>Responsabilidad.</strong> Su empresa responde por la licitud del banco de datos y por
          su inscripción en el Registro Nacional de Protección de Datos Personales (RNPD). Nosotros
          respondemos por el tratamiento que realicemos fuera de sus instrucciones o sin las medidas de
          seguridad de esta cláusula. Esta cláusula no altera lo que la ley exige a cada parte.
        </p>
        <p>
          El detalle técnico del encargo (rol, alojamiento, medidas y datos para la declaración ante la
          ANPD) está en la{' '}
          <Link href="/encargado" className="underline underline-offset-2 text-[#c02b0a]">
            ficha del encargado
          </Link>
          ; las finalidades y los canales ARCO, en la{' '}
          <Link href="/privacidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="13. Propiedad intelectual">
        <p>
          La plataforma, su software, sus marcas y su documentación son de titularidad del prestador
          o de sus licenciantes. El contenido que usted carga (datos de la empresa, reclamos,
          respuestas, logotipos) sigue siendo suyo: solo nos autoriza a tratarlo para prestar el
          servicio.
        </p>
      </LegalSection>

      <LegalSection title="14. Responsabilidad">
        <p>
          La plataforma se presta como herramienta de gestión. No garantizamos un resultado
          administrativo o legal determinado, ni que la autoridad considere conforme su Libro: eso
          depende de cómo lo use y de las respuestas que envíe.
        </p>
        <p>
          En la medida permitida por ley, nuestra responsabilidad se limita al importe efectivamente
          pagado por los doce meses anteriores al hecho que la origine. Esta limitación no alcanza a
          los derechos que la ley reconoce de forma irrenunciable al consumidor.
        </p>
      </LegalSection>

      <LegalSection title="15. Suspensión y terminación">
        <LegalList
          items={[
            'Podemos suspender el servicio por falta de pago, por un uso que ponga en riesgo la plataforma o por requerimiento de autoridad competente.',
            'Usted puede dejar de usar el servicio y solicitar la eliminación de su cuenta cuando lo desee.',
            `Al terminar la relación, sus datos se conservan ${RETENTION_MONTHS} meses para cumplir con la normativa de consumo y luego se anonimizan.`,
          ]}
        />
      </LegalSection>

      <LegalSection title="16. Modificaciones">
        <p>
          Podemos actualizar estos términos para reflejar cambios del servicio o de la normativa.
          Publicamos la nueva versión en esta página con su fecha y avisamos al correo del titular
          con antelación razonable cuando el cambio sea relevante. El uso del servicio después de la
          fecha de vigencia implica su aceptación.
        </p>
      </LegalSection>

      <LegalSection title="17. Ley aplicable y reclamos">
        <p>
          Estos términos se rigen por la legislación peruana. Para cualquier discrepancia, puede
          escribirnos primero a {OPERATOR.email}: respondemos en un plazo no mayor a{' '}
          {LEGAL_RESPONSE_TIME_BUSINESS_DAYS} días hábiles.
        </p>
        <p>
          También puede registrar su reclamo en nuestro{' '}
          <a
            href={LIBRO_DE_RECLAMACIONES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-[#c02b0a]"
            data-testid="link-libro-reclamaciones"
          >
            Libro de Reclamaciones
          </a>{' '}
          o acudir a INDECOPI ({CONTACT_INFO.INDECOPI_EMAIL}, teléfono{' '}
          {CONTACT_INFO.INDECOPI_PHONE}, {CONTACT_INFO.INDECOPI_WEBSITE}). Nada de esta cláusula
          impide que un consumidor reclame ante la autoridad de consumo.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
