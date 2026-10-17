import { Link } from 'wouter';
import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import { OPERATOR } from '@/lib/platform-legal';
import { RETENTION_MONTHS } from '@shared/plans';

/**
 * Política de privacidad de la plataforma (Ley N.° 29733 y su Reglamento,
 * DS N.° 016-2024-JUS).
 *
 * Ojo con la distinción que hace el punto 3: esta política es la de
 * LibroDigital.pe como proveedor del servicio. La política de los datos que un
 * consumidor deja en el Libro de Reclamaciones de una empresa cliente es la de
 * esa empresa y se sirve en `/libro/:slug/politica-de-privacidad`
 * (@shared/privacy-policy). No son el mismo documento y por eso se enlazan.
 */
export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidad"
      lead="Cómo tratamos los datos personales en LibroDigital.pe: qué recogemos, para qué, con quién los compartimos, cuánto tiempo los conservamos y cómo ejercer sus derechos."
      testId="privacidad-page"
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          El responsable del tratamiento de los datos personales descritos en esta política es{' '}
          <strong>{OPERATOR.businessName}</strong>, RUC <strong>{OPERATOR.ruc}</strong>, operador de
          la plataforma LibroDigital.pe. Sus canales oficiales son el correo{' '}
          <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2 text-[#c02b0a]">
            {OPERATOR.email}
          </a>{' '}
          y el teléfono/WhatsApp {OPERATOR.phone}.
        </p>
        <p>
          Si usted es consumidor de una empresa que usa LibroDigital.pe, el responsable de sus datos
          es esa empresa: vea la{' '}
          <strong>política de privacidad de su Libro de Reclamaciones</strong>, enlazada desde el
          propio formulario donde usted registró el reclamo.
        </p>
      </LegalSection>

      <LegalSection title="2. Marco normativo">
        <p>
          Tratamos los datos personales conforme a la Ley N.° 29733, Ley de Protección de Datos
          Personales, y su Reglamento aprobado por DS N.° 016-2024-JUS (publicado el 30 de noviembre
          de 2024). Aplicamos los principios de legalidad, consentimiento, finalidad, proporcionalidad,
          calidad, seguridad y disposición de recurso.
        </p>
      </LegalSection>

      <LegalSection title="3. Nuestro doble papel: responsable y encargado">
        <LegalList
          items={[
            <>
              <strong>Somos responsables</strong> de los datos de las personas que contratan el
              servicio: cuentas del panel, usuarios invitados, datos de facturación y de contacto de
              la empresa cliente.
            </>,
            <>
              <strong>Somos encargados</strong> de los datos de los consumidores que registran
              reclamos en el Libro de Reclamaciones de una empresa cliente. Esos datos son del banco
              de datos de esa empresa y los tratamos únicamente por su encargo y para dar el
              servicio: atender el reclamo, emitir la constancia, calcular el plazo legal y enviar
              las notificaciones. No los usamos para fines propios ni los vendemos.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Datos que tratamos">
        <p>De las personas usuarias del panel:</p>
        <LegalList
          items={[
            'Nombres y apellidos, cargo, correo electrónico, teléfono y, cuando corresponde, número de documento.',
            'Credenciales de acceso (guardadas con hash, nunca en texto plano) y registro de accesos.',
            'Datos de la empresa: nombre, RUC, domicilio, establecimientos, datos de contacto y logotipo.',
            'Datos de facturación y de los pagos: plan, importe, comprobante y referencia de la operación.',
          ]}
        />
        <p>De los consumidores que reclaman en el libro de una empresa cliente:</p>
        <LegalList
          items={[
            'Los campos de la Hoja de Reclamación del Anexo 1: nombre, tipo y número de documento, domicilio, correo, teléfono, identificación del bien o servicio, detalle del reclamo y archivos de sustento que el consumidor adjunte.',
            'Datos del padre, madre o representante cuando el consumidor es menor de edad.',
            'La constancia de recepción y la respuesta que la empresa cliente registre.',
          ]}
        />
        <p>Y de toda visita a la web, datos técnicos mínimos:</p>
        <LegalList
          items={[
            'Dirección IP, fecha y hora de la conexión y navegador, para la seguridad del servicio y la prevención de abuso.',
            'Una cookie esencial de sesión cuando se inicia sesión en el panel; el portal público de reclamaciones no requiere cookies.',
          ]}
        />
      </LegalSection>
      <LegalSection title="5. Finalidades y base legal">
        <LegalList
          items={[
            'Prestar el servicio contratado: crear la cuenta, publicar el libro, recibir reclamos, emitir constancias, controlar plazos y enviar notificaciones (ejecución del contrato).',
            'Emitir comprobantes y cumplir obligaciones tributarias y de consumo (obligación legal).',
            'Atender consultas, reclamos y pedidos de soporte (ejecución del contrato e interés legítimo).',
            'Proteger la plataforma: autenticación, control de accesos, prevención de fraude y de abuso, y respaldo de la información (interés legítimo).',
            'Mejorar el producto con información agregada y anonimizada, que ya no permite identificar a ninguna persona (interés legítimo).',
            'Enviar comunicaciones comerciales sobre el servicio, solo si usted las autorizó y siempre con opción de darse de baja (consentimiento).',
            'Usar funciones de inteligencia artificial para clasificar el reclamo y redactar una propuesta de respuesta: el texto siempre pasa por revisión de la empresa antes de enviarse (ejecución del contrato).',
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Con quién compartimos los datos">
        <p>
          No vendemos datos personales. Los compartimos solo con proveedores que nos ayudan a operar
          el servicio, bajo contrato de encargo y con acceso limitado a lo necesario:
        </p>
        <LegalList
          items={[
            'Alojamiento, base de datos y respaldo: proveedores de infraestructura en la nube.',
            'Correo transaccional: envío de constancias, respuestas y avisos de vencimiento.',
            'Inteligencia artificial: procesamiento del texto del reclamo para clasificarlo y proponer una respuesta.',
            'Mensajería por WhatsApp, cuando la empresa cliente activa ese canal y el consumidor lo usa.',
            'Pasarela de pagos y entidades financieras, para cobrar el plan contratado.',
            'Autoridades competentes, cuando exista un requerimiento legal debidamente formulado.',
          ]}
        />
        <p>
          Algunos de esos proveedores están fuera del Perú. Esas transferencias internacionales se
          realizan a países con nivel adecuado de protección o bajo cláusulas contractuales que
          obligan al proveedor a tratar los datos con el mismo estándar de esta política, conforme al
          Reglamento de la Ley N.° 29733.
        </p>
      </LegalSection>

      <LegalSection title="7. Plazo de conservación">
        <LegalList
          items={[
            `Reclamos y quejas: ${RETENTION_MONTHS} meses desde su registro, plazo durante el cual el Libro debe estar a disposición de la autoridad de consumo. Cumplido el plazo, los datos personales se anonimizan automáticamente y los archivos adjuntos se eliminan.`,
            'Datos de la cuenta y de la empresa: mientras la cuenta esté activa y, después de su cierre, durante los plazos legales aplicables.',
            'Comprobantes y documentación contable: el plazo que exige la normativa tributaria.',
            'Registros de acceso y de seguridad: el tiempo necesario para investigar incidentes y demostrar el cumplimiento.',
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Sus derechos (ARCO y demás)">
        <p>
          Usted puede ejercer sus derechos de acceso, rectificación, cancelación y oposición, así como
          revocar su consentimiento, sin costo y en cualquier momento, escribiendo a{' '}
          <a href={`mailto:${OPERATOR.email}`} className="underline underline-offset-2 text-[#c02b0a]">
            {OPERATOR.email}
          </a>{' '}
          o llamando al {OPERATOR.phone}. Indique su nombre, el derecho que desea ejercer y el dato
          concreto al que se refiere; podemos pedirle una verificación razonable de identidad.
        </p>
        <p>
          Respondemos dentro de los plazos del Reglamento. Si no atendemos su pedido, puede acudir a
          la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y
          Derechos Humanos.
        </p>
        <p>
          Si usted es consumidor de una empresa cliente, dirija su pedido a esa empresa, que es la
          responsable de sus datos; si nos lo envía a nosotros, lo derivamos a ella y le avisamos.
        </p>
      </LegalSection>
      <LegalSection title="9. Seguridad de la información">
        <LegalList
          items={[
            'Cifrado del tráfico con HTTPS y contraseñas almacenadas con hash.',
            'Acceso a los datos restringido por empresa: cada cliente solo ve su propio libro.',
            'Registro de auditoría de las acciones sensibles dentro del panel.',
            'Respaldos periódicos y procedimientos de restauración probados.',
            'Si ocurre un incidente de seguridad que afecte datos personales, lo evaluamos y notificamos a la autoridad y a los afectados cuando corresponda.',
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Cookies">
        <p>
          Usamos una única cookie esencial de sesión (`connect.sid`) para mantener el inicio de
          sesión en el panel. No usamos cookies publicitarias ni de seguimiento de terceros, y el
          portal público de reclamaciones funciona sin cookies. El detalle está en la{' '}
          <Link href="/accesibilidad" className="underline underline-offset-2 text-[#c02b0a]">
            política de cookies y accesibilidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="11. Menores de edad">
        <p>
          El servicio está dirigido a empresas y a personas mayores de edad. Los datos de un menor
          solo se tratan cuando aparecen en una reclamación, con la intervención de su padre, madre o
          representante, y con la misma finalidad y plazo que el resto del libro.
        </p>
      </LegalSection>

      <LegalSection title="12. Cambios y contacto">
        <p>
          Podemos actualizar esta política para reflejar cambios del servicio o de la normativa.
          Publicamos la versión vigente en esta página, con la fecha de la última actualización, y
          avisamos por correo al titular de la cuenta cuando el cambio sea sustancial. Para cualquier
          consulta sobre privacidad: {OPERATOR.email}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
