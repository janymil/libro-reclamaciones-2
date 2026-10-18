import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { BUSINESS_TYPE_OPTIONS, resolveChannelFit } from "@/lib/channel-fit";
import LibroWebLinkCard from "@/components/libro/libro-web-link-card";
import SocialChannelsCard from "@/components/libro/social-channels-card";
import PlanGate from "@/components/plan/plan-gate";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import type { LibroConfiguration } from "@shared/schema";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useRotateWebhookSecret,
  useDeleteWebhook,
  useWebhookDeliveries,
  useRetryWebhookDelivery,
  useWidgetSnippet,
} from "@/hooks/use-subscription";

/**
 * Events a webhook can subscribe to. Kept in sync with WEBHOOK_EVENTS in
 * server/services/webhookService.ts.
 */
const WEBHOOK_EVENT_OPTIONS = [
  { value: "complaint.created", label: "Nueva reclamación" },
  { value: "complaint.updated", label: "Cambio de estado o prioridad" },
  { value: "complaint.responded", label: "Respuesta enviada" },
];

/** Why a company would want the API (shown with and without the plan). */
const API_BENEFITS = [
  "Evite la doble digitación: cada reclamo nace en su CRM, ERP o tienda y queda en el Libro con su correlativo legal.",
  "Responda, cambie el estado y adjunte evidencias desde su propio sistema, sin entrar al panel.",
  "Mantenga el plazo legal de 15 días hábiles bajo control con estados y fechas sincronizados.",
  "Un solo libro para todas sus sucursales, con trazabilidad y auditoría.",
];

/** Why a company would want webhooks (shown with and without the plan). */
const WEBHOOK_BENEFITS = [
  "Su sistema se entera del reclamo en segundos, sin consultar el panel ni revisar el correo.",
  "Cree tickets, avise al área responsable o actualice su CRM automáticamente.",
  "Firma HMAC-SHA256 y reintentos automáticos: la integración no depende de una persona.",
  "Puede excluir los datos personales del consumidor del webhook y consultarlos por la API.",
];

function BenefitList({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-[#e3d9c6] bg-[#fdfaf3] p-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-600">
        Por qué le conviene
      </p>
      <ul className="space-y-1.5 text-sm text-gray-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-[#c02b0a]">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Integraciones: how the business puts its Libro where its customers are.
 *
 * The page adapts to the sales channel stored on the Libro configuration:
 * an online store gets the link/widget guidance, a business that sells through
 * WhatsApp or social networks gets the copy-ready profile guide. Both are plain
 * links - no API and no third-party account needed. The API keys and webhooks
 * below stay for Corporativo/API customers.
 */
export default function IntegrationsPage() {
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<string[]>(
    WEBHOOK_EVENT_OPTIONS.map((option) => option.value),
  );
  const [includeConsumerData, setIncludeConsumerData] = useState(true);

  const { data: config } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });

  const fit = resolveChannelFit(config?.businessType);
  const isAdmin = user?.role === "admin";

  const updateBusinessType = useMutation({
    mutationFn: async (businessType: string) => {
      const response = await apiRequest("PATCH", "/api/libro-configuration", { businessType });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/libro-configuration"] });
      toast({
        title: "Tipo de negocio actualizado",
        description: "Ajustamos las guías que ve en esta página.",
      });
    },
    onError: () => {
      toast({
        title: "No se pudo actualizar",
        description: isAdmin
          ? "Intente nuevamente en unos instantes."
          : "Solo un administrador puede cambiar el tipo de negocio.",
        variant: "destructive",
      });
    },
  });

  const apiKeys = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const rotateApiKey = useRotateApiKey();
  const webhooks = useWebhooks();
  const createWebhook = useCreateWebhook();
  const updateWebhook = useUpdateWebhook();
  const rotateWebhookSecret = useRotateWebhookSecret();
  const deleteWebhook = useDeleteWebhook();
  const deliveries = useWebhookDeliveries();
  const retryDelivery = useRetryWebhookDelivery();
  const widget = useWidgetSnippet();

  return (
    <AppLayout title="Integraciones" subtitle="Enlace, redes sociales, widget y API para su negocio">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Always visible, whatever the plan: the API guide and the help page
            must be readable before an upgrade. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            Enlaces, widget, API y webhooks para conectar su Libro con sus sistemas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ayuda">
              <Button variant="outline" size="sm" data-testid="link-help-center">
                Ayuda y guías
              </Button>
            </Link>
            <Link href="/integraciones/api">
              <Button className="btn-primary" size="sm" data-testid="link-api-docs-top">
                Documentación de la API
              </Button>
            </Link>
          </div>
        </div>

        {/* Qué guía corresponde según dónde vende */}
        <Card data-testid="channel-guide-intro">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="material-icons text-[#c02b0a]">storefront</span>
              {fit.headline}
            </CardTitle>
            <CardDescription>{fit.hint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Label htmlFor="businessType" className="text-sm text-gray-600">
              Tipo de negocio
            </Label>
            <Select
              value={config?.businessType ?? ""}
              onValueChange={(value) => updateBusinessType.mutate(value)}
              disabled={!isAdmin || updateBusinessType.isPending || !config}
            >
              <SelectTrigger id="businessType" className="w-[240px]" data-testid="select-business-type">
                <SelectValue placeholder="Seleccione" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <span className="text-xs text-gray-500">Solo un administrador puede cambiarlo.</span>
            )}
          </CardContent>
        </Card>

        {fit.showWebLink && <LibroWebLinkCard />}
        {fit.showSocialChannels && <SocialChannelsCard />}
        {/* Widget */}
        <PlanGate
          feature="widget"
          title="Widget para su tienda virtual"
          description="Un botón flotante que abre su Libro de Reclamaciones dentro de su propia web o tienda."
        >
        <Card>
          <CardHeader>
            <CardTitle>Widget para su tienda virtual</CardTitle>
            <CardDescription>
              Un botón flotante que abre su Libro de Reclamaciones dentro de su web. Pegue este
              snippet antes de cerrar el {"</body>"}:
            </CardDescription>
          </CardHeader>
          <CardContent>
            {widget.data ? (
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto" data-testid="widget-snippet">
                {widget.data.snippet}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">
                {widget.error
                  ? 'No se pudo generar el código. Intente nuevamente en unos momentos.'
                  : 'Configure primero su Libro de Reclamaciones.'}
              </p>
            )}
          </CardContent>
        </Card>
        </PlanGate>

        {/* API keys */}
        <PlanGate
          feature="api"
          title="Claves de API para su CRM/ERP"
          description="Conecte su CRM, ERP, call center o tienda para crear y gestionar reclamaciones sin doble digitación."
          benefits={API_BENEFITS}
        >
        <Card>
          <CardHeader>
            <CardTitle>Claves de API</CardTitle>
            <CardDescription>
              Cree, consulte, responda y adjunte evidencias desde su CRM/ERP con la API REST
              (plan Empresarial).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Link href="/integraciones/api">
                <Button variant="outline" size="sm" data-testid="link-api-docs">
                  Ver documentación de la API
                </Button>
              </Link>
            </div>
            <BenefitList items={API_BENEFITS} />
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de la clave (ej.: Mi CRM)"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                data-testid="input-api-key-name"
              />
              <Button
                className="btn-primary"
                disabled={!keyName.trim() || createApiKey.isPending}
                onClick={async () => {
                  try {
                    const created = await createApiKey.mutateAsync(keyName.trim());
                    setCreatedKey(created.fullKey ?? null);
                    setKeyName("");
                    toast({ title: "Clave creada", description: "Guárdela ahora: no se volverá a mostrar." });
                  } catch (error) {
                    upgradeToast(error, 'No se pudo crear la clave');
                  }
                }}
                data-testid="button-create-api-key"
              >
                Crear clave
              </Button>
            </div>

            {createdKey && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3" data-testid="created-api-key">
                <p className="text-xs font-medium text-yellow-800 mb-1">
                  Copie esta clave ahora — no se volverá a mostrar:
                </p>
                <code className="text-xs break-all text-gray-900">{createdKey}</code>
              </div>
            )}

            <ul className="space-y-2">
              {(apiKeys.data ?? []).map((key) => (
                <li key={key.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <code className="text-xs text-gray-500">{key.keyPrefix}••••</code>
                    {key.revokedAt ? (
                      <Badge className="bg-gray-100 text-gray-500">Revocada</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800">Activa</Badge>
                    )}
                  </span>
                  {!key.revokedAt && (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const rotated = await rotateApiKey.mutateAsync(key.id);
                            setCreatedKey(rotated.fullKey ?? null);
                            toast({
                              title: "Clave rotada",
                              description: "La clave anterior dejó de funcionar. Copie la nueva ahora.",
                            });
                          } catch (error) {
                            upgradeToast(error, 'No se pudo rotar la clave');
                          }
                        }}
                        aria-label={`Rotar ${key.name}`}
                        data-testid={`button-rotate-api-key-${key.id}`}
                      >
                        <span className="material-icons text-lg">autorenew</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeApiKey.mutate(key.id)}
                        aria-label={`Revocar ${key.name}`}
                      >
                        <span className="material-icons text-lg">block</span>
                      </Button>
                    </span>
                  )}
                </li>
              ))}
              {apiKeys.data?.length === 0 && (
                <li className="text-sm text-gray-500">Aún no hay claves de API.</li>
              )}
            </ul>
          </CardContent>
        </Card>
        </PlanGate>

        {/* Webhooks */}
        <PlanGate
          feature="webhooks"
          title="Webhooks a su sistema"
          description="Reciba cada evento en su sistema en tiempo real, con firma HMAC-SHA256 y reintentos automáticos."
          benefits={WEBHOOK_BENEFITS}
        >
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              Le notificamos a su sistema cada evento con una firma HMAC-SHA256 en la cabecera
              X-LibroDigital-Signature. Las entregas fallidas se reintentan y quedan visibles abajo
              (plan Empresarial).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BenefitList items={WEBHOOK_BENEFITS} />
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Eventos a notificar</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {WEBHOOK_EVENT_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox
                      checked={webhookEvents.includes(option.value)}
                      onCheckedChange={(checked) =>
                        setWebhookEvents((previous) =>
                          checked === true
                            ? [...previous, option.value]
                            : previous.filter((event) => event !== option.value),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <Checkbox
                checked={includeConsumerData}
                onCheckedChange={(checked) => setIncludeConsumerData(checked === true)}
              />
              <span>
                Incluir los datos del consumidor en el webhook (nombre, documento, correo, teléfono).
                Si lo desactiva, el evento solo lleva los identificadores y su sistema debe consultar
                <code className="mx-1 text-xs">GET /api/v1/complaints/:id</code>.
              </span>
            </label>

            <div className="flex gap-2">
              <Input
                placeholder="https://su-sistema.pe/webhooks/reclamos"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                data-testid="input-webhook-url"
              />
              <Button
                className="btn-primary"
                disabled={!webhookUrl.trim() || webhookEvents.length === 0 || createWebhook.isPending}
                onClick={async () => {
                  try {
                    const created = await createWebhook.mutateAsync({
                      url: webhookUrl.trim(),
                      events: webhookEvents,
                      includeConsumerData,
                    });
                    setCreatedSecret(created.secret ?? null);
                    setWebhookUrl("");
                    toast({ title: "Webhook creado", description: "Guarde el secreto de firma mostrado abajo." });
                  } catch (error) {
                    upgradeToast(error, 'No se pudo crear el webhook');
                  }
                }}
                data-testid="button-create-webhook"
              >
                Añadir webhook
              </Button>
            </div>

            {createdSecret && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3" data-testid="created-webhook-secret">
                <p className="text-xs font-medium text-yellow-800 mb-1">
                  Secreto de firma (guárdelo ahora, no se volverá a mostrar):
                </p>
                <code className="text-xs break-all text-gray-900">{createdSecret}</code>
              </div>
            )}

            <ul className="space-y-2">
              {(webhooks.data ?? []).map((hook) => (
                <li key={hook.id} className="border rounded-lg px-3 py-2 text-sm space-y-2" data-testid={`webhook-row-${hook.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{hook.url}</span>
                    <span className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const rotated = await rotateWebhookSecret.mutateAsync(hook.id);
                            setCreatedSecret(rotated.secret);
                            toast({
                              title: "Secreto rotado",
                              description: "El secreto anterior dejó de validar. Copie el nuevo ahora.",
                            });
                          } catch (error) {
                            upgradeToast(error, 'No se pudo rotar el secreto');
                          }
                        }}
                        aria-label="Rotar secreto de firma"
                        data-testid={`button-rotate-webhook-${hook.id}`}
                      >
                        <span className="material-icons text-lg">key</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhook.mutate(hook.id)}
                        aria-label="Eliminar webhook"
                      >
                        <span className="material-icons text-lg">delete</span>
                      </Button>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    {(hook.events ?? ["complaint.created"]).map((event) => (
                      <Badge key={event} className="bg-gray-100 text-gray-700">
                        {WEBHOOK_EVENT_OPTIONS.find((option) => option.value === event)?.label ?? event}
                      </Badge>
                    ))}
                    <label className="flex items-center gap-1">
                      <Checkbox
                        checked={hook.includeConsumerData !== false}
                        onCheckedChange={async (checked) => {
                          try {
                            await updateWebhook.mutateAsync({
                              id: hook.id,
                              includeConsumerData: checked === true,
                            });
                            toast({
                              title: "Preferencia actualizada",
                              description: checked === true
                                ? "Los webhooks incluirán los datos del consumidor."
                                : "Los webhooks ya no incluirán datos del consumidor.",
                            });
                          } catch (error) {
                            upgradeToast(error, 'No se pudo actualizar el webhook');
                          }
                        }}
                      />
                      Datos del consumidor
                    </label>
                  </div>
                </li>
              ))}
              {webhooks.data?.length === 0 && (
                <li className="text-sm text-gray-500">Aún no hay webhooks configurados.</li>
              )}
            </ul>

            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">
                  Últimas entregas (5 intentos automáticos)
                </p>
                <Button variant="ghost" size="sm" onClick={() => deliveries.refetch()}>
                  Actualizar
                </Button>
              </div>

              {deliveries.data?.length ? (
                <ul className="space-y-1">
                  {deliveries.data.map((delivery) => (
                    <li
                      key={delivery.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            delivery.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : delivery.status === "failed"
                                ? "bg-yellow-100 text-yellow-800"
                                : delivery.status === "dead"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-700"
                          }
                        >
                          {delivery.status === "delivered"
                            ? "Entregado"
                            : delivery.status === "failed"
                              ? "Reintentando"
                              : delivery.status === "dead"
                                ? "Fallido"
                                : "Pendiente"}
                        </Badge>
                        <span className="font-medium">{delivery.event}</span>
                        <span className="text-gray-500">
                          intento {delivery.attempts}
                          {delivery.lastStatusCode ? ` · HTTP ${delivery.lastStatusCode}` : ""}
                          {` · ${new Date(delivery.createdAt).toLocaleString("es-PE")}`}
                        </span>
                        <span className="max-w-[220px] truncate text-gray-500" title={delivery.url}>
                          {delivery.url}
                        </span>
                        {delivery.lastError && (
                          <span className="max-w-[220px] truncate text-red-700" title={delivery.lastError}>
                            {delivery.lastError}
                          </span>
                        )}
                      </span>
                      {(delivery.status === "failed" || delivery.status === "dead") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryDelivery.isPending}
                          onClick={() => retryDelivery.mutate(delivery.id)}
                        >
                          Reintentar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Todavía no hay entregas registradas.</p>
              )}
            </div>
          </CardContent>
        </Card>
        </PlanGate>
      </div>
    </AppLayout>
  );
}
