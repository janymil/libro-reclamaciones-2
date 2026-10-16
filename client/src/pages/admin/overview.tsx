import { Link } from 'wouter';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAdminCustomers,
  useAdminOverview,
  useAdminPayments,
  useAdminPlatform,
  useIsOperator,
} from '@/hooks/use-admin';
import { adminPathFor } from '@/lib/admin-path';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';

/** Resumen: cómo va el negocio hoy, en una pantalla. */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
const fecha = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-PE') : '—');

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="pt-6">
        <p className="font-mono text-[10px] tracking-[0.18em] text-slate-400 uppercase">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-50">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const isOperator = useIsOperator();
  const overview = useAdminOverview(isOperator);
  const customers = useAdminCustomers(isOperator);
  const payments = useAdminPayments(isOperator);
  const platform = useAdminPlatform(isOperator);

  const failing = (platform.data?.checks ?? []).filter((check) => !check.ok);
  const recentPayments = (payments.data ?? []).slice(0, 6);
  const byPlan = overview.data?.byPlan ?? {};

  return (
    <AdminLayout title="Resumen" subtitle="Clientes, cobros y estado de la plataforma">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Clientes"
            value={overview.data ? String(overview.data.customers) : '—'}
            hint={
              overview.data
                ? `${overview.data.activeCustomers} activos · ${overview.data.logins} accesos`
                : undefined
            }
          />
          <Kpi
            label="Cobrado este mes"
            value={overview.data ? money(overview.data.paidThisMonthCents) : '—'}
            hint={
              overview.data ? `Histórico ${money(overview.data.collectedTotalCents)}` : undefined
            }
          />
          <Kpi
            label="Transferencias por confirmar"
            value={overview.data ? String(overview.data.pendingTransfers) : '—'}
            hint="Se confirman en Pagos"
          />
          <Kpi
            label="Equipo"
            value={overview.data ? String(overview.data.operators) : '—'}
            hint={
              overview.data
                ? `${overview.data.trialsEndingThisWeek} pruebas vencen esta semana`
                : undefined
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-slate-50">Clientes por plan</CardTitle>
              <CardDescription className="text-slate-400">
                Reparto actual de la cartera.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.keys(byPlan).length === 0 && (
                <p className="text-sm text-slate-500">Sin datos.</p>
              )}
              {Object.entries(byPlan).map(([plan, count]) => (
                <span
                  key={plan}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200"
                >
                  <span className="capitalize">{plan}</span>
                  <span className="font-mono text-amber-300">{count}</span>
                </span>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-slate-50">Estado de la plataforma</CardTitle>
              <CardDescription className="text-slate-400">
                Lo mismo que el servidor avisa al arrancar, en vivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {failing.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Todo configurado.
                </p>
              ) : (
                failing.map((check) => (
                  <p key={check.id} className="flex items-start gap-2 text-sm text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{check.label}</span>
                      <span className="block text-xs text-slate-400">{check.hint}</span>
                    </span>
                  </p>
                ))
              )}
              <Link href={adminPathFor('/plataforma')}>
                <span className="mt-2 inline-flex cursor-pointer text-sm text-amber-300 hover:underline">
                  Ver las comprobaciones
                </span>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Últimos pagos</CardTitle>
            <CardDescription className="text-slate-400">
              {customers.data?.length ?? 0} clientes · {payments.data?.length ?? 0} intentos de pago
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentPayments.length === 0 && (
              <p className="text-sm text-slate-500">Sin pagos aún.</p>
            )}
            {recentPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-2 last:border-b-0"
              >
                <div>
                  <p className="font-mono text-sm text-slate-200">{payment.reference}</p>
                  <p className="text-xs text-slate-400">
                    {payment.businessName ?? 'Cliente eliminado'} · {payment.provider} ·{' '}
                    {fecha(payment.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      payment.status === 'paid'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }
                  >
                    {payment.statusLabel ?? payment.status}
                  </Badge>
                  <span className="text-sm font-semibold text-slate-100">
                    {money(payment.amountCents)}
                  </span>
                </div>
              </div>
            ))}
            <Link href={adminPathFor('/pagos')}>
              <span className="inline-flex cursor-pointer text-sm text-amber-300 hover:underline">
                Ver todos los pagos
              </span>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
