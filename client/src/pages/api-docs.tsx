import { Link } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Customer-facing API documentation (plan Empresarial).
 *
 * Deliberately in-app: the customer's developer can read it without asking us
 * for a PDF, and the machine-readable version is one click away at
 * /api/v1/openapi.json. Keep examples aligned with server/routes/api.routes.ts.
 */

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre">
      <code>{children}</code>
    </pre>
  );
}

const endpoints = [
  ["GET", "/api/v1/establishments", "Locales activos (de aquí sale el establishmentId)."],
  ["POST", "/api/v1/complaints", "Registra una reclamación y dispara constancia + webhooks."],
  ["GET", "/api/v1/complaints", "Lista paginada; total en X-Total-Count."],
  ["GET", "/api/v1/complaints/:id", "Detalle con datos del consumidor y evidencias."],
  ["PATCH", "/api/v1/complaints/:id", "Cambia estado y/o prioridad."],
  ["POST", "/api/v1/complaints/:id/response", "Registra la respuesta y la envía al consumidor."],
  ["GET", "/api/v1/complaints/:id/attachments", "Lista evidencias."],
  ["POST", "/api/v1/complaints/:id/attachments", "Sube evidencias (multipart, campo files)."],
  ["GET", "/api/v1/attachments/:id/file", "Descarga una evidencia."],
  ["GET", "/api/v1/ping", "Health probe (sin clave)."],
  ["GET", "/api/v1/openapi.json", "Especificación OpenAPI (sin clave)."],
];

const createExample = `curl -X POST https://librodigital.pe/api/v1/complaints \\
  -H "Authorization: Bearer ld_XXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "establishmentId": "UUID-DEL-LOCAL",
    "complaintType": "reclamo",
    "consumerFullName": "Juan Pérez",
    "consumerDocumentType": "DNI",
    "consumerDocumentNumber": "12345678",
    "consumerAddress": "Av. Siempre Viva 123, Lima",
    "consumerPhone": "999888777",
    "consumerEmail": "juan@example.com",
    "productServiceName": "Laptop modelo X",
    "productServiceDescription": "Compra online",
    "purchaseAmount": "149.90",
    "purchaseDate": "2026-10-01",
    "receiptNumber": "F001-1234",
    "complaintDetail": "El producto llegó con la pantalla rota.",
    "consumerRequest": "Cambio del producto o devolución.",
    "responseMethod": "email",
    "consentGiven": true
  }'`;

const responseExample = `{
  "id": "8f14e45f-ea4b-4c9a-9b1e-2b6f5f2d3a10",
  "correlativeNumber": "2026-0001",
  "dueDate": "2026-11-05T17:00:00.000Z",
  "status": "new"
}`;

const listExample = `curl "https://librodigital.pe/api/v1/complaints?limit=50&offset=0&status=new" \\
  -H "Authorization: Bearer ld_XXXXXXXX"

# Respuesta: array JSON. El total del filtro viaja en X-Total-Count.`;

const respondExample = `curl -X POST https://librodigital.pe/api/v1/complaints/UUID/response \\
  -H "Authorization: Bearer ld_XXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "providerResponse": "Estimado cliente, coordinamos el cambio del producto.",
    "providerActions": "Se generó la orden de cambio 001-2026.",
    "responseMethod": "email"
  }'`;

const uploadExample = `curl -X POST https://librodigital.pe/api/v1/complaints/UUID/attachments \\
  -H "Authorization: Bearer ld_XXXXXXXX" \\
  -F "files=@boleta.pdf" \\
  -F "files=@foto-producto.jpg"`;

const nodeWebhook = `import crypto from "crypto";
import express from "express";

const app = express();

app.post(
  "/webhooks/reclamos",
  express.raw({ type: "application/json" }), // raw body, not parsed JSON
  (req, res) => {
    const expected = "sha256=" + crypto
      .createHmac("sha256", process.env.LIBRO_SECRET)
      .update(req.body)
      .digest("hex");

    const received = req.get("X-LibroDigital-Signature") || "";
    const valid = received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

    if (!valid) return res.status(401).send("bad signature");

    const event = JSON.parse(req.body.toString());
    // event.event: complaint.created | complaint.updated | complaint.responded
    // event.data.id: complaint id
    // Si event.data.hasConsumerData === false, consultar GET /api/v1/complaints/:id

    res.sendStatus(200); // responda rápido; el payload ya quedó registrado
  },
);`;

const phpWebhook = `<?php
$secret = getenv('LIBRO_SECRET');
$raw = file_get_contents('php://input');
$expected = 'sha256=' . hash_hmac('sha256', $raw, $secret);
$received = $_SERVER['HTTP_X_LIBRO_DIGITAL_SIGNATURE'] ?? '';

if (!hash_equals($expected, $received)) {
    http_response_code(401);
    exit('bad signature');
}

$event = json_decode($raw, true);
// $event['event'], $event['data']['id']

http_response_code(200);`;

export default function ApiDocsPage() {
  return (
    <AppLayout
      title="API para su CRM/ERP"
      subtitle="Documentación de la API REST del Libro de Reclamaciones (plan Empresarial)"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Qué puede hacer con la API</CardTitle>
            <CardDescription>
              Su CRM/ERP puede crear y gestionar reclamaciones sin entrar al panel. El libro sigue
              siendo de LibroDigital.pe: el correlativo, el plazo legal de 15 días hábiles, la
              constancia PDF, los correos y la retención de 2 años se gestionan aquí. Su sistema
              solo envía y consulta datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>
              <strong>Requisito:</strong> plan Empresarial y un usuario administrador. La clave se
              crea en{" "}
              <Link href="/integraciones" className="text-[#c02b0a] underline">
                Integraciones → Claves de API
              </Link>
              . Se muestra una sola vez.
            </p>
            <p>
              <strong>Autenticación:</strong>{" "}
              <code className="rounded bg-gray-100 px-1">Authorization: Bearer ld_...</code>
            </p>
            <p>
              <strong>Base URL:</strong>{" "}
              <code className="rounded bg-gray-100 px-1">https://librodigital.pe</code>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">Abrir OpenAPI JSON</Button>
              </a>
              <Link href="/integraciones">
                <Button variant="outline" size="sm">Volver a Integraciones</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>Todo salvo ping/OpenAPI exige la clave y el plan vigente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">Método</th>
                    <th className="py-2 pr-3">Ruta</th>
                    <th className="py-2">Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map(([method, path, description]) => (
                    <tr key={`${method}-${path}`} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Badge className="bg-gray-100 text-gray-800">{method}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{path}</td>
                      <td className="py-2 text-gray-600">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>1. Obtenga el establishmentId</CardTitle>
            <CardDescription>
              Es obligatorio al crear una reclamación: identifica el local donde se presenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock>{`curl https://librodigital.pe/api/v1/establishments \\
  -H "Authorization: Bearer ld_XXXXXXXX"`}</CodeBlock>
            <p className="mt-3 text-sm text-gray-600">
              Devuelve los locales activos con <code>id</code>, <code>name</code> y{" "}
              <code>address</code>. Si el local se desactiva, la API rechaza reclamaciones nuevas
              con HTTP 409.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Cree una reclamación</CardTitle>
            <CardDescription>POST /api/v1/complaints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CodeBlock>{createExample}</CodeBlock>
            <p className="text-xs text-gray-500">
              <code>purchaseAmount</code> se envía como texto. <code>consentGiven</code> debe ser
              verdadero. No envíe <code>businessId</code>: se toma de la clave.
            </p>
            <p className="text-sm font-medium text-gray-700">Respuesta 201</p>
            <CodeBlock>{responseExample}</CodeBlock>
            <p className="text-xs text-gray-500">
              La reclamación ya disparó la constancia PDF, el correo al consumidor y los webhooks.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Consulte y gestione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Listar (paginado)</p>
              <CodeBlock>{listExample}</CodeBlock>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Responder al consumidor</p>
              <CodeBlock>{respondExample}</CodeBlock>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Adjuntar evidencias</p>
              <CodeBlock>{uploadExample}</CodeBlock>
            </div>
            <p className="text-sm text-gray-600">
              Para cambiar estado o prioridad:{" "}
              <code className="rounded bg-gray-100 px-1">PATCH /api/v1/complaints/:id</code> con{" "}
              <code>{`{ "status": "in_progress" }`}</code> y/o{" "}
              <code>{`{ "priority": "high" }`}</code>.
            </p>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>4. Webhooks</CardTitle>
            <CardDescription>
              Se configuran en Integraciones → Webhooks. La firma HMAC-SHA256 usa el secreto que se
              muestra una sola vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p><strong>Eventos:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><code>complaint.created</code> — nueva reclamación.</li>
              <li><code>complaint.updated</code> — cambio de estado o prioridad por API.</li>
              <li><code>complaint.responded</code> — respuesta registrada y enviada.</li>
            </ul>
            <p><strong>Cabeceras de cada entrega:</strong></p>
            <CodeBlock>{`Content-Type: application/json
User-Agent: LibroDigital-Webhooks/1.0
X-LibroDigital-Event: complaint.created
X-LibroDigital-Signature: sha256=<hex>
X-LibroDigital-Delivery: <delivery id>
X-LibroDigital-Attempt: 1`}</CodeBlock>
            <p>
              La firma se calcula sobre el <strong>cuerpo exacto</strong> (bytes crudos). No vuelva a
              serializar el JSON antes de verificar.
            </p>
            <p>
              <strong>Reintentos:</strong> hasta 5 intentos (1 min, 5 min, 30 min, 2 h). Si
              todos fallan, la entrega queda en estado <code>dead</code> y se puede reintentar
              manualmente desde Integraciones. El historial de entregas es visible en la misma
              pantalla.
            </p>
            <p>
              <strong>Datos del consumidor:</strong> se pueden excluir del webhook con la casilla
              “Datos del consumidor”. En ese caso el evento trae{" "}
              <code>hasConsumerData: false</code> y su sistema debe consultar{" "}
              <code>GET /api/v1/complaints/:id</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verificación de la firma</CardTitle>
            <CardDescription>Node.js / Express</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock>{nodeWebhook}</CodeBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verificación de la firma</CardTitle>
            <CardDescription>PHP / Laravel</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock>{phpWebhook}</CodeBlock>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Errores, límites y datos personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">HTTP</th>
                    <th className="py-2 pr-3">error</th>
                    <th className="py-2">Significado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">401</td><td className="py-1.5 pr-3 font-mono">invalid_api_key</td><td className="py-1.5">Clave inexistente o revocada.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">402</td><td className="py-1.5 pr-3 font-mono">plan_upgrade_required</td><td className="py-1.5">El plan ya no incluye API/webhooks.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">402</td><td className="py-1.5 pr-3 font-mono">quota_exceeded</td><td className="py-1.5">Cuota de reclamaciones o adjuntos alcanzada.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">403</td><td className="py-1.5 pr-3 font-mono">libro_not_published</td><td className="py-1.5">Falta confirmar el correo del administrador.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">404</td><td className="py-1.5 pr-3 font-mono">complaint_not_found</td><td className="py-1.5">No existe o pertenece a otro RUC.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">409</td><td className="py-1.5 pr-3 font-mono">intake_failed</td><td className="py-1.5">El local está desactivado.</td></tr>
                  <tr className="border-b"><td className="py-1.5 pr-3 font-mono">429</td><td className="py-1.5 pr-3 font-mono">rate_limited</td><td className="py-1.5">Límite por clave: 240 lecturas/min o 60 escrituras/min.</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              <strong>Datos personales:</strong> el detalle incluye nombre, documento, dirección,
              teléfono y correo del consumidor. Trátelos conforme a la Ley 29733, guárdelos solo el
              tiempo necesario y restrinja el acceso en su CRM.
            </p>
            <p>
              <strong>Buenas prácticas:</strong> use HTTPS, guarde la clave en un gestor de secretos,
              nunca la incluya en el frontend, rote la clave si sospecha una filtración y haga
              idempotencia por <code>data.id</code> + <code>event</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

