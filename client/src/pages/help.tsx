import type { ReactNode } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Help center for the paid integration features.
 *
 * Each section explains what the feature is, why it matters, the exact setup
 * steps and a direct link to the screen where it is configured. This is the
 * "manual" the customer reads; the technical API contract lives at
 * /integraciones/api.
 */

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#c02b0a] text-xs font-semibold text-white">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function SettingLinks({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-1">{children}</div>;
}

export default function HelpPage() {
  return (
    <AppLayout
      title="Ayuda y guías"
      subtitle="Cómo conectar su Libro con su CRM, su tienda y su correo"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>¿Qué necesita configurar?</CardTitle>
            <CardDescription>
              Estas guías cubren las funciones que van más allá del formulario público. Cada sección
              termina con un enlace directo a la pantalla correspondiente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="#api"><Button variant="outline" size="sm">API para CRM/ERP</Button></a>
            <a href="#webhooks"><Button variant="outline" size="sm">Webhooks</Button></a>
            <a href="#remitente-propio"><Button variant="outline" size="sm">Remitente propio</Button></a>
            <a href="#enlace-widget"><Button variant="outline" size="sm">Enlace y widget</Button></a>
            <Link href="/integraciones">
              <Button variant="outline" size="sm">Ir a Integraciones</Button>
            </Link>
            <Link href="/personalizacion">
              <Button variant="outline" size="sm">Ir a Personalización</Button>
            </Link>
          </CardContent>
        </Card>

        <Card id="api" className="scroll-mt-24">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>API para su CRM/ERP</CardTitle>
              <Badge className="bg-[#fdf0ec] text-[#c02b0a]">Plan Empresarial</Badge>
            </div>
            <CardDescription>
              Permite que su propio sistema cree, consulte y gestione reclamaciones sin entrar al
              panel. Los datos siguen viviendo en LibroDigital.pe: correlativo, plazo legal,
              constancia PDF, correos y retención de 2 años.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div>
              <p className="font-medium text-gray-900">Por qué le conviene</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>El reclamo nace en el mismo sistema donde está el pedido o el cliente: no se digita dos veces.</li>
                <li>Su equipo responde, cambia estados y adjunta evidencias desde su CRM.</li>
                <li>El plazo de 15 días hábiles y el correlativo quedan bajo control automático.</li>
                <li>Un solo libro para todas las sucursales, con historial y auditoría.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900">Paso a paso</p>
              <ol className="mt-2 space-y-2">
                <Step number={1}>
                  Active el plan <strong>Empresarial</strong> en{" "}
                  <Link href="/plan" className="text-[#c02b0a] underline">Plan y Cuotas</Link>.
                </Step>
                <Step number={2}>
                  Entre a{" "}
                  <Link href="/integraciones" className="text-[#c02b0a] underline">
                    Integraciones → Claves de API
                  </Link>{" "}
                  con un usuario administrador y cree una clave. Cópiela en ese momento: no se
                  vuelve a mostrar.
                </Step>
                <Step number={3}>
                  Consulte <code className="rounded bg-gray-100 px-1">GET /api/v1/establishments</code>{" "}
                  para obtener el <code className="rounded bg-gray-100 px-1">establishmentId</code>{" "}
                  del local.
                </Step>
                <Step number={4}>
                  Pruebe <code className="rounded bg-gray-100 px-1">GET /api/v1/ping</code> y luego
                  cree un reclamo de prueba en un local de prueba.
                </Step>
                <Step number={5}>
                  Implemente la integración en el <strong>servidor</strong> de su CRM/ERP. Nunca
                  ponga la clave en el navegador ni en una app móvil.
                </Step>
                <Step number={6}>
                  Si sospecha una filtración, use el botón de rotar: la clave anterior deja de
                  funcionar de inmediato.
                </Step>
              </ol>
            </div>

            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-900">
              <strong>Importante:</strong> para un formulario público en su web use el widget o el
              enlace, no la API. Una clave dentro del frontend queda visible para cualquier
              visitante.
            </div>

            <SettingLinks>
              <Link href="/plan"><Button className="btn-primary" size="sm">Ver planes</Button></Link>
              <Link href="/integraciones"><Button variant="outline" size="sm">Crear clave de API</Button></Link>
              <Link href="/integraciones/api"><Button variant="outline" size="sm">Documentación técnica</Button></Link>
            </SettingLinks>
          </CardContent>
        </Card>


        <Card id="webhooks" className="scroll-mt-24">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Webhooks a su sistema</CardTitle>
              <Badge className="bg-[#fdf0ec] text-[#c02b0a]">Plan Empresarial</Badge>
            </div>
            <CardDescription>
              LibroDigital.pe envía un POST a una URL suya cada vez que ocurre un evento. Su sistema
              se entera sin consultar el panel ni esperar un correo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div>
              <p className="font-medium text-gray-900">Por qué le conviene</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>El reclamo entra a su sistema en segundos: se crea el ticket o se avisa al área responsable.</li>
                <li>Puede actualizar el CRM cuando el reclamo cambia de estado o se responde.</li>
                <li>Firma HMAC-SHA256 para comprobar que el evento viene de nosotros.</li>
                <li>Reintentos automáticos y registro de entregas: no depende de una persona.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900">Eventos disponibles</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-800">complaint.created</Badge>
                <Badge className="bg-gray-100 text-gray-800">complaint.updated</Badge>
                <Badge className="bg-gray-100 text-gray-800">complaint.responded</Badge>
              </div>
            </div>

            <div>
              <p className="font-medium text-gray-900">Paso a paso</p>
              <ol className="mt-2 space-y-2">
                <Step number={1}>
                  Active el plan <strong>Empresarial</strong> en{" "}
                  <Link href="/plan" className="text-[#c02b0a] underline">Plan y Cuotas</Link>.
                </Step>
                <Step number={2}>
                  Prepare un endpoint <strong>HTTPS público</strong> en su sistema (por ejemplo{" "}
                  <code className="rounded bg-gray-100 px-1">https://crm.miempresa.pe/webhooks/reclamos</code>).
                </Step>
                <Step number={3}>
                  En{" "}
                  <Link href="/integraciones" className="text-[#c02b0a] underline">
                    Integraciones → Webhooks
                  </Link>
                  , pegue la URL, elija los eventos y pulse <strong>Añadir webhook</strong>.
                </Step>
                <Step number={4}>
                  Copie el secreto de firma que aparece una sola vez y guárdelo en su gestor de
                  secretos.
                </Step>
                <Step number={5}>
                  Verifique <code className="rounded bg-gray-100 px-1">X-LibroDigital-Signature</code>{" "}
                  sobre el cuerpo crudo con HMAC-SHA256 antes de procesar el evento.
                </Step>
                <Step number={6}>
                  Responda <code className="rounded bg-gray-100 px-1">2xx</code> rápido. Si su sistema
                  falla, reintentamos hasta 5 veces (1 min, 5 min, 30 min, 2 h) y la entrega queda
                  visible en Integraciones para reintentarla a mano.
                </Step>
                <Step number={7}>
                  Si no quiere recibir datos personales del consumidor, desactive{" "}
                  <strong>Datos del consumidor</strong>: el evento solo trae identificadores y su
                  sistema consulta el detalle por la API.
                </Step>
              </ol>
            </div>

            <div className="rounded-lg border border-[#e3d9c6] bg-[#fdfaf3] p-3">
              <strong>Recomendación:</strong> haga la integración idempotente usando{" "}
              <code className="rounded bg-gray-100 px-1">event</code> +{" "}
              <code className="rounded bg-gray-100 px-1">data.id</code>, y use también la API para
              reconciliar eventos perdidos.
            </div>

            <SettingLinks>
              <Link href="/plan"><Button className="btn-primary" size="sm">Ver planes</Button></Link>
              <Link href="/integraciones"><Button variant="outline" size="sm">Configurar webhook</Button></Link>
              <Link href="/integraciones/api"><Button variant="outline" size="sm">Ver firma y ejemplos</Button></Link>
            </SettingLinks>
          </CardContent>
        </Card>


        <Card id="remitente-propio" className="scroll-mt-24">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Remitente propio</CardTitle>
              <Badge className="bg-[#fdf0ec] text-[#c02b0a]">Plan Pro o superior</Badge>
            </div>
            <CardDescription>
              Sí, es una función real: sus correos de confirmación y de respuesta pueden salir desde
              una dirección de su propio dominio, por ejemplo{" "}
              <code className="rounded bg-gray-100 px-1">reclamos@miempresa.pe</code>. No es
              automático: requiere verificar el dominio con nuestro servicio de correo y habilitarlo
              de nuestro lado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div>
              <p className="font-medium text-gray-900">Cómo funciona</p>
              <ol className="mt-2 space-y-2">
                <Step number={1}>
                  En <Link href="/personalizacion" className="text-[#c02b0a] underline">Personalización → Remitente propio</Link>{" "}
                  escribe la dirección que quiere usar. Se guarda en su configuración.
                </Step>
                <Step number={2}>
                  La dirección solo se usa si el <strong>dominio</strong> figura entre los que
                  tenemos habilitados para enviar. Hoy esa lista contiene únicamente{" "}
                  <code className="rounded bg-gray-100 px-1">librodigital.pe</code> y los dominios
                  que hayamos verificado para clientes.
                </Step>
                <Step number={3}>
                  Si el dominio no está autorizado, el correo <strong>sigue saliendo</strong> desde
                  nuestra dirección, pero con el <strong>nombre visible</strong> de su empresa y con
                  las <strong>respuestas</strong> dirigidas a su correo. No se pierde ningún reclamo.
                </Step>
                <Step number={4}>
                  Cuando el dominio queda verificado, los correos salen desde su dirección y la
                  pantalla muestra el estado <strong>Personalizado</strong>.
                </Step>
              </ol>
            </div>

            <div>
              <p className="font-medium text-gray-900">Estados que puede ver</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2">Qué significa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 pr-3"><Badge className="bg-gray-100 text-gray-700">Plataforma</Badge></td>
                      <td className="py-2">No configuró dirección propia; se envía desde LibroDigital.pe con su nombre visible.</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-3"><Badge className="bg-green-100 text-green-800">Personalizado</Badge></td>
                      <td className="py-2">El dominio está verificado y la dirección se usa como remitente.</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-3"><Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge></td>
                      <td className="py-2">Configuró una dirección, pero su dominio aún no está autorizado. Se usa el remitente de la plataforma.</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3"><Badge className="bg-red-100 text-red-800">Inválido</Badge></td>
                      <td className="py-2">La dirección no tiene un formato válido; corríjala en Personalización.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>


            <div>
              <p className="font-medium text-gray-900">Cómo habilitarlo (proceso asistido)</p>
              <ol className="mt-2 space-y-2">
                <Step number={1}>
                  Verifique que su plan sea <strong>Pro o Empresarial</strong> y que su usuario sea
                  administrador.
                </Step>
                <Step number={2}>
                  Elija un buzón real de su dominio, por ejemplo{" "}
                  <code className="rounded bg-gray-100 px-1">reclamos@miempresa.pe</code>. No sirve una
                  dirección de Gmail, Hotmail/Outlook ni de un dominio que no controle.
                </Step>
                <Step number={3}>
                  Escríbanos desde el botón <strong>Solicitar verificación</strong> de
                  Personalización (o a <a href="mailto:hola@librodigital.pe" className="text-[#c02b0a] underline">hola@librodigital.pe</a>)
                  con: empresa, RUC, dominio y dirección que quiere usar.
                </Step>
                <Step number={4}>
                  Nuestro equipo agrega el dominio en nuestro servicio de correo y le envía
                  los valores exactos de los registros DNS.
                </Step>
                <Step number={5}>
                  Usted (o quien administre su DNS) publica los registros. Normalmente son:
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li>Un registro <strong>TXT SPF</strong> que autoriza a nuestro servicio de correo.</li>
                    <li>Un registro <strong>TXT DKIM</strong> con el selector que le indiquemos.</li>
                    <li>Opcional pero recomendado: un <strong>TXT DMARC</strong> en modo monitoreo.</li>
                  </ul>
                  Use los valores que le entreguemos: copiarlos de Internet puede dejar el dominio sin autorización.
                </Step>
                <Step number={6}>
                  Esperamos la propagación del DNS (puede tardar hasta 48 h, a veces minutos) y
                  verificamos que SPF y DKIM respondan.
                </Step>
                <Step number={7}>
                  Habilitamos el dominio en nuestra configuración de envío. Desde ese momento la
                  dirección se usa y el estado pasa a <strong>Personalizado</strong>.
                </Step>
                <Step number={8}>
                  Haga una prueba real: cree un reclamo de prueba y revise la cabecera{" "}
                  <code className="rounded bg-gray-100 px-1">From</code> y{" "}
                  <code className="rounded bg-gray-100 px-1">Reply-To</code> en el correo recibido.
                </Step>
              </ol>
            </div>

            <div className="rounded-lg border border-[#e3d9c6] bg-[#fdfaf3] p-3">
              <p className="font-medium text-gray-900">Qué no cambia y qué sí</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li><strong>Nombre visible:</strong> se configura en “Correo que recibe su cliente” y no necesita verificación.</li>
                <li><strong>Correo para respuestas:</strong> también es inmediato; las respuestas del consumidor llegan ahí.</li>
                <li><strong>Dirección remitente propia:</strong> es la única parte que requiere el dominio verificado.</li>
                <li><strong>Constancia y textos:</strong> no dependen del remitente; se generan igual.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900">Problemas frecuentes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li><strong>Sigue en “Pendiente”:</strong> faltan los registros DNS, no se han propagado o el dominio aún no fue habilitado por nosotros.</li>
                <li><strong>El correo llega a spam:</strong> revise SPF, DKIM y DMARC; no publique dos registros SPF distintos.</li>
                <li><strong>Cambió su servicio de correo:</strong> avísenos; los registros y la autorización deben actualizarse.</li>
                <li><strong>Dirección inválida:</strong> use solo letras, números, punto, guion y guion bajo antes de la @; sin espacios.</li>
              </ul>
            </div>

            <SettingLinks>
              <Link href="/personalizacion"><Button className="btn-primary" size="sm">Ir a Personalización</Button></Link>
              <Link href="/plan"><Button variant="outline" size="sm">Ver planes</Button></Link>
              <a href="mailto:hola@librodigital.pe?subject=Solicitud%20de%20verificaci%C3%B3n%20de%20dominio%20remitente&body=Hola%2C%20quiero%20usar%20mi%20propio%20dominio%20como%20remitente.%20Mi%20empresa%20es%3A%20%0AMi%20dominio%20es%3A%20%0ALa%20direcci%C3%B3n%20que%20quiero%20usar%20es%3A%20">
                <Button variant="outline" size="sm">Solicitar verificación</Button>
              </a>
            </SettingLinks>
          </CardContent>
        </Card>


        <Card id="enlace-widget" className="scroll-mt-24">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Enlace y widget</CardTitle>
              <Badge className="bg-[#fdf0ec] text-[#c02b0a]">Widget desde Pro</Badge>
            </div>
            <CardDescription>
              La forma más simple de poner el Libro en su web o en su bio de redes, sin exponer
              credenciales de API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Enlace:</strong> disponible en todos los planes; se copia desde Integraciones y se puede usar en WhatsApp, Instagram, correos o la web.</li>
              <li><strong>Widget:</strong> un botón flotante que abre el formulario oficial dentro de su tienda o web (Shopify, WooCommerce, WordPress).</li>
              <li>El formulario, la constancia y los correos quedan igual que en el Libro público; no necesita servidor propio.</li>
            </ul>
            <SettingLinks>
              <Link href="/integraciones"><Button className="btn-primary" size="sm">Ver enlace y widget</Button></Link>
              <Link href="/codigo-qr"><Button variant="outline" size="sm">Descargar QR</Button></Link>
              <Link href="/plan"><Button variant="outline" size="sm">Ver planes</Button></Link>
            </SettingLinks>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>¿Necesita ayuda adicional?</CardTitle>
            <CardDescription>
              Si ninguna guía resuelve su caso, escríbanos indicando empresa, RUC y el servicio que
              quiere configurar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <a href="mailto:hola@librodigital.pe?subject=Ayuda%20con%20integraciones">
              <Button className="btn-primary" size="sm">Escribir a hola@librodigital.pe</Button>
            </a>
            <Link href="/contacto"><Button variant="outline" size="sm">Ir a Contacto</Button></Link>
            <Link href="/estado"><Button variant="outline" size="sm">Estado del servicio</Button></Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

