import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Kpi } from '@/pages/admin/overview';
import { useAdminPlatform, useIsOperator } from '@/hooks/use-admin';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';

/**
 * Plataforma: lo que hay que arreglar en la configuración.
 *
 * Es la misma lista que el servidor imprime al arrancar ("el webhook es tal",
 * "APP_URL no es público"), pero viva y con el valor actual: estas cosas fallan
 * en silencio y se pagan caro (planes que no se activan, transferencias que nadie
 * puede confirmar).
 */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;

export default function AdminPlatformPage() {
  const isOperator = useIsOperator();
  const platform = useAdminPlatform(isOperator);

  const checks = platform.data?.checks ?? [];
  const failing = checks.filter((check) => !check.ok);

  return (
    <AdminLayout
      title="Plataforma"
      subtitle={
        failing.length === 0
          ? 'Todo configurado'
          : `${failing.length} puntos requieren atención`
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
          onClick={() => platform.refetch()}
          disabled={platform.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Revisar
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Clientes"
            value={platform.data ? String(platform.data.totals.customers) : '—'}
            hint={platform.data ? `${platform.data.totals.logins} accesos` : undefined}
          />
          <Kpi
            label="Cobrado (histórico)"
            value={
              platform.data ? money(platform.data.totals.collectedTotalCents) : '—'
            }
            hint={platform.data ? `${platform.data.totals.paidPayments} pagos confirmados` : undefined}
          />
          <Kpi
            label="Transferencias pendientes"
            value={platform.data ? String(platform.data.totals.pendingTransfers) : '—'}
            hint="Se confirman en Pagos"
          />
          <Kpi
            label="Ruta de esta consola"
            value={platform.data?.adminPath ?? '—'}
            hint="Cambie VITE_ADMIN_PATH y reinicie"
          />
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Comprobaciones de configuración</CardTitle>
            <CardDescription className="text-slate-400">
              Nunca se muestra el valor de un secreto: solo si está puesto y de qué tipo es.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {platform.isLoading && <p className="text-sm text-slate-400">Comprobando...</p>}

            {checks.map((check) => (
              <div
                key={check.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm text-slate-100">{check.label}</p>
                    <p className="text-xs text-slate-400">{check.hint}</p>
                  </div>
                </div>
                <Badge
                  className={
                    check.ok
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }
                >
                  {check.detail ?? 'sin configurar'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Sondas públicas</CardTitle>
            <CardDescription className="text-slate-400">
              Para comprobar el servicio desde fuera (monitorización, soporte).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <a
              className="inline-flex items-center gap-1 text-amber-300 hover:underline"
              href="/health"
              target="_blank"
              rel="noreferrer"
            >
              /health <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <a
              className="inline-flex items-center gap-1 text-amber-300 hover:underline"
              href="/ready"
              target="_blank"
              rel="noreferrer"
            >
              /ready <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <a
              className="inline-flex items-center gap-1 text-amber-300 hover:underline"
              href="/estado"
              target="_blank"
              rel="noreferrer"
            >
              Página de estado <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
