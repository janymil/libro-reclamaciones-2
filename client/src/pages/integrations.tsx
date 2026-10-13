import { useState } from "react";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import LibroWebLinkCard from "@/components/libro/libro-web-link-card";
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
 * Integraciones (Phase 3.12): the Corporativo surface - public REST API keys,
 * outgoing webhooks and the embeddable widget for e-commerce.
 */
export default function IntegrationsPage() {
  const { toast } = useToast();
  const [keyName, setKeyName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const apiKeys = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const webhooks = useWebhooks();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const widget = useWidgetSnippet();

  return (
    <AppLayout title="Integraciones" subtitle="API, webhooks y widget para su negocio">
      <div className="max-w-4xl mx-auto space-y-8">
        <LibroWebLinkCard />
        {/* Widget */}
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
              <p className="text-sm text-gray-500">Configure primero su Libro de Reclamaciones.</p>
            )}
          </CardContent>
        </Card>

        {/* API keys */}
        <Card>
          <CardHeader>
            <CardTitle>Claves de API</CardTitle>
            <CardDescription>
              Para crear y consultar reclamaciones desde su CRM/ERP vía POST/GET /api/v1/complaints
              (plan Corporativo).
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
                    toast({
                      title: "No se pudo crear la clave",
                      description: error instanceof Error ? error.message : "",
                      variant: "destructive",
                    });
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

        {/* Webhooks */}
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              Le notificamos a su sistema cada nueva reclamación con una firma HMAC-SHA256 en la
              cabecera X-LibroVirtual-Signature (plan Corporativo).
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
                    toast({
                      title: "No se pudo crear el webhook",
                      description: error instanceof Error ? error.message : "",
                      variant: "destructive",
                    });
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
      </div>
    </AppLayout>
  );
}
