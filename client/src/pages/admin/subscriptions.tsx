import { Link } from 'wouter';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminSubscriptions, useIsOperator } from '@/hooks/use-admin';
import { adminPathFor } from '@/lib/admin-path';

/**
 * Suscripciones: el cobro automático.
 *
 * Es la pantalla donde se ve un cobro que dejó de funcionar (una preaprobación
 * rechazada o caducada) antes de que el cliente se quede sin plan.
 */

const fecha = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-PE') : '—');

export default function AdminSubscriptionsPage() {
  const isOperator = useIsOperator();
  const subscriptions = useAdminSubscriptions(isOperator);

  const rows = subscriptions.data ?? [];
  const live = rows.filter((row) => !row.cancelledAt);

  return (
    <AdminLayout
      title="Suscripciones"
      subtitle={`${live.length} cobros automáticos activos de ${rows.length} autorizaciones`}
    >
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-50">Autorizaciones de cobro</CardTitle>
          <CardDescription className="text-slate-400">
            Cada fila es un mandato de Mercado Pago (preapproval): el cliente autorizó que se le
            cobre cada periodo sin volver a pagar a mano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscriptions.isLoading && <p className="text-sm text-slate-400">Cargando...</p>}
          {!subscriptions.isLoading && rows.length === 0 && (
            <p className="text-sm text-slate-400">
              Todavía no hay suscripciones automáticas: los pagos de transferencia y Yape son
              puntuales.
            </p>
          )}

          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-100">
                    {row.reference}
                  </span>
                  <Badge
                    className={
                      row.cancelledAt
                        ? 'bg-slate-700/40 text-slate-300'
                        : row.status === 'authorized'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                    }
                  >
                    {row.cancelledAt ? 'Cancelada' : row.status}
                  </Badge>
                  {row.businessId ? (
                    <Link href={adminPathFor(`/clientes/${row.businessId}`)}>
                      <span className="cursor-pointer text-xs text-amber-300 hover:underline">
                        {row.businessName ?? 'Cliente'}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">Cliente eliminado</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {row.provider} · plan {row.planId} ·{' '}
                  {row.period === 'annual' ? 'anual' : 'mensual'} · iniciada{' '}
                  {fecha(row.startedAt ?? row.createdAt)}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Próximo cobro</p>
                <p className="text-sm font-semibold text-slate-100">
                  {row.cancelledAt ? '—' : fecha(row.nextPaymentAt)}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
