import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useWidgetSnippet,
} from "@/hooks/use-subscription";

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
  const webhooks = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const widget = useWidgetSnippet();

  return (
    <AppLayout title="Integraciones" subtitle="Enlace, redes sociales, widget y API para su negocio">
      <div className="max-w-4xl mx-auto space-y-8">
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
          description="Cree y consulte reclamaciones desde su propio sistema con POST/GET /api/v1/complaints."
        >
        <Card>
          <CardHeader>
            <CardTitle>Claves de API</CardTitle>
            <CardDescription>
              Para crear y consultar reclamaciones desde su CRM/ERP vía POST/GET /api/v1/complaints
              (plan Empresarial).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeApiKey.mutate(key.id)}
                      aria-label={`Revocar ${key.name}`}
                    >
                      <span className="material-icons text-lg">block</span>
                    </Button>
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
          description="Le avisamos a su sistema cada nueva reclamación, con firma HMAC-SHA256."
        >
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              Le notificamos a su sistema cada nueva reclamación con una firma HMAC-SHA256 en la
              cabecera X-LibroDigital-Signature (plan Empresarial).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="https://su-sistema.pe/webhooks/reclamos"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                data-testid="input-webhook-url"
              />
              <Button
                className="btn-primary"
                disabled={!webhookUrl.trim() || createWebhook.isPending}
                onClick={async () => {
                  try {
                    const created = await createWebhook.mutateAsync({ url: webhookUrl.trim() });
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
                <li key={hook.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <span className="truncate">{hook.url}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteWebhook.mutate(hook.id)}
                    aria-label="Eliminar webhook"
                  >
                    <span className="material-icons text-lg">delete</span>
                  </Button>
                </li>
              ))}
              {webhooks.data?.length === 0 && (
                <li className="text-sm text-gray-500">Aún no hay webhooks configurados.</li>
              )}
            </ul>
          </CardContent>
        </Card>
        </PlanGate>
      </div>
    </AppLayout>
  );
}
