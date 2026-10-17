import { Link } from 'wouter';
import { BookOpenCheck, Mail, MessageCircle } from 'lucide-react';

import { LegalPage, LegalList, LegalSection } from '@/components/legal/legal-page';
import ContactForm from '@/components/legal/contact-form';
import {
  LIBRO_DE_RECLAMACIONES_PENDING,
  LIBRO_DE_RECLAMACIONES_URL,
  OPERATOR,
} from '@/lib/platform-legal';

/**
 * "Nosotros y contacto": una sola página para lo que un visitante quiere saber
 * antes de confiar en el servicio y para escribirnos.
 *
 * Dos reglas de redacción, por pedido expreso del negocio:
 *   * no se habla de desarrollo de software ni de código: el visitante compra
 *     un Libro de Reclamaciones gestionado, no un proyecto de programación;
 *   * no se inventan datos de la empresa (dirección, mapa, tamaño del equipo,
 *     clientes atendidos). Solo lo verificable: qué hace el servicio, cómo se
 *     trata la información y cómo se responde.
 *
 * Y una regla legal: este formulario NO es el Libro de Reclamaciones. Se dice de
 * forma visible, con el enlace al libro, porque un consumidor que escribe aquí
 * no está ejerciendo el derecho del art. 150 del Código.
 */
export default function ContactoPage() {
  return (
    <LegalPage
      eyebrow="Nosotros"
      title="Quiénes somos y cómo escribirnos"
      lead="LibroDigital.pe es un emprendimiento peruano dedicado a un solo problema: que ninguna empresa pierda una oportunidad ni reciba una multa por cómo lleva su Libro de Reclamaciones."
      testId="contacto-page"
      showLastUpdated={false}
    >
      <LegalSection title="Qué hacemos">
        <p>
          Damos a las empresas peruanas un Libro de Reclamaciones virtual listo para usar: se publica
          con un enlace y un código QR, el consumidor registra su reclamo o queja desde el celular y
          recibe su constancia al instante.
        </p>
        <p>
          Del otro lado, la empresa ve cada caso en un panel ordenado: qué tipo de reclamo es, quién
          debe atenderlo, cuántos días hábiles quedan y qué respuesta se envió. El objetivo es simple:
          que responder a tiempo sea lo normal y no una carrera contra el calendario.
        </p>
        <LegalList
          items={[
            <>
              <strong>Un libro por local,</strong> con su propio enlace y QR, más el aviso imprimible
              para caja o mostrador.
            </>,
            <>
              <strong>Constancia inmediata</strong> para el consumidor, con el detalle de lo que
              registró y la fecha de presentación.
            </>,
            <>
              <strong>Control del plazo de 15 días hábiles,</strong> con alertas antes de que venza y
              el cómputo con los feriados del Perú.
            </>,
            <>
              <strong>Respuestas y reportes</strong> para responder por escrito y llegar a una
              fiscalización con el expediente en orden.
            </>,
          ]}
        />
      </LegalSection>
      <LegalSection title="Por qué existe">
        <p>
          Durante años el Libro de Reclamaciones fue un cuaderno en el mostrador: hojas que se
          pierden, letra que nadie entiende, reclamos que se conocen cuando ya venció el plazo. Con
          15 días hábiles improrrogables para responder, ese cuaderno es un riesgo para cualquier
          negocio, grande o pequeño.
        </p>
        <p>
          LibroDigital.pe nació para cerrar esa brecha sin complicar al negocio: lo que antes era un
          formato impreso y una carpeta, hoy es un enlace que el cliente puede abrir desde su celular
          y un panel que no deja vencer un caso en silencio.
        </p>
      </LegalSection>

      <LegalSection title="Cómo trabajamos">
        <LegalList
          items={[
            <>
              <strong>Hecho en Perú,</strong> para empresas peruanas, con el calendario de feriados
              del país y la normativa nacional como referencia.
            </>,
            <>
              <strong>Soporte en español,</strong> por correo o WhatsApp, atendido por personas.
            </>,
            <>
              <strong>Los datos son de cada empresa.</strong> Cada cuenta ve solo su libro; el
              consumidor decide qué información deja y para qué, y puede ejercer sus derechos.
            </>,
            <>
              <strong>Transparencia.</strong> Publicamos el estado del servicio, el marco normativo y
              los documentos legales; si algo no funciona, lo decimos.
            </>,
          ]}
        />
        <p>
          LibroDigital.pe es un servicio privado e independiente: no somos INDECOPI, no somos un
          organismo del Estado y no certificamos libros de reclamaciones. Facilitamos el cumplimiento;
          la responsabilidad ante el consumidor sigue siendo de cada proveedor.
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/normativa" className="text-[#c02b0a] underline underline-offset-2">
            Ver el marco normativo
          </Link>
          <Link href="/estado" className="text-[#c02b0a] underline underline-offset-2">
            Ver el estado del servicio
          </Link>
        </p>
      </LegalSection>
      <LegalSection title="Escríbanos">
        <p>
          ¿Tiene una duda, quiere ver el panel funcionando o necesita ayuda con su cuenta? Elija el
          canal que le resulte más cómodo. Le respondemos en días hábiles.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`mailto:${OPERATOR.email}`}
            className="flex items-start gap-3 rounded-[3px] border border-[#e3d9c6] bg-white/60 p-4 transition-colors hover:border-[#c02b0a]"
          >
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#c02b0a]" aria-hidden="true" />
            <span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#5c5246]">
                Correo
              </span>
              <span className="block text-sm font-medium text-[#1b1611]">{OPERATOR.email}</span>
            </span>
          </a>
          <a
            href={`tel:${OPERATOR.phoneHref}`}
            className="flex items-start gap-3 rounded-[3px] border border-[#e3d9c6] bg-white/60 p-4 transition-colors hover:border-[#c02b0a]"
          >
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#c02b0a]" aria-hidden="true" />
            <span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#5c5246]">
                Teléfono / WhatsApp
              </span>
              <span className="block text-sm font-medium text-[#1b1611]">{OPERATOR.phone}</span>
            </span>
          </a>
        </div>

        {/* Aviso legal: el formulario no sustituye al Libro de Reclamaciones. */}
        <div className="mt-2 flex items-start gap-3 rounded-[3px] border border-[#1b1611]/15 bg-[#fdfaf3] p-4">
          <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#c02b0a]" aria-hidden="true" />
          <p className="text-sm">
            <strong>Este formulario no es el Libro de Reclamaciones.</strong> Si quiere registrar un
            reclamo o una queja formal sobre el servicio, use{' '}
            <a
              href={LIBRO_DE_RECLAMACIONES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-[#c02b0a]"
              data-testid="link-libro-reclamaciones">
              nuestro Libro de Reclamaciones
            </a>
            {LIBRO_DE_RECLAMACIONES_PENDING && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5246]">
                {' '}
                (enlace disponible próximamente; mientras tanto, escríbanos al correo)
              </span>
            )}
            . Así queda constancia con número correlativo y se activa el plazo legal de respuesta.
          </p>
        </div>

        <ContactForm />
      </LegalSection>
    </LegalPage>
  );
}
