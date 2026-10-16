import { useState } from 'react';
import { Link } from 'wouter';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAdminPayments, useIsOperator } from '@/hooks/use-admin';
import { useConfirmPayment, usePendingManualPayments } from '@/hooks/use-payments';
import { adminPathFor } from '@/lib/admin-path';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';

/**
 * Pagos: la caja.
 *
 * Arriba, la cola que espera a una persona: transferencias y Yape que el equipo
 * confirma mirando su propia cuenta. Debajo, todos los intentos de todos los
 * clientes, que es con lo que se concilia el banco.
 */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
const fecha = (value: string | null) => (value ? new Date(value).toLocaleString('es-PE') : '—');

export default function AdminPaymentsPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const payments = useAdminPayments(isOperator);
  const pending = usePendingManualPayments(isOperator);
  const confirm = useConfirmPayment();

  const [search, setSearch] = useState('');

  const all = payments.data ?? [];
  const term = search.trim().toLowerCase();
  const rows = term
    ? all.filter((row) =>
        [row.reference, row.businessName ?? '', row.ruc ?? '', row.status, row.provider]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
    : all;

  const paid = all.filter((row) => row.status === 'paid');
  const collectedTotal = paid.reduce((sum, row) => sum + row.amountCents, 0);
  const pendingTotal = (pending.data ?? []).reduce((sum, row) => sum + row.payment.amountCents, 0);

  return (
    <AdminLayout
      title="Pagos"
      subtitle={`Cobrado ${money(collectedTotal)} · ${paid.length} pagos confirmados`}
    >
      <div className="space-y-6">
        <Card className="border-amber-500/40 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Por confirmar</CardTitle>
            <CardDescription className="text-slate-400">
              Transferencias y Yape esperando: verifique el monto y la referencia en su cuenta antes
              de confirmar. Al confirmar, el plan del cliente se activa.{' '}
              {pendingTotal > 0 ? `Total en espera ${money(pendingTotal)}.` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.isLoading && <p className="text-sm text-slate-400">Cargando cola...</p>}
            {!pending.isLoading && (pending.data ?? []).length === 0 && (
              <p className="text-sm text-slate-400">No hay transferencias pendientes.</p>
            )}

            {(pending.data ?? []).map((row) => (
              <div
                key={row.payment.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0"
              >
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">
                      {row.payment.reference}
                    </span>
                    <span className="text-xs text-slate-400">{row.businessName ?? '—'}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Plan {row.payment.planId} ·{' '}
                    {row.payment.period === 'annual' ? 'anual' : 'mensual'} · creado{' '}
                    {fecha(row.payment.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-100">
                    {money(row.payment.amountCents)}
                  </span>
                  <Button
                    size="sm"
                    className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                    disabled={confirm.isPending}
                    onClick={async () => {
                      try {
                        await confirm.mutateAsync(row.payment.id);
                        toast({ title: 'Pago confirmado', description: row.payment.reference });
                      } catch (error) {
                        toast({
                          title: 'No se pudo confirmar',
                          description: error instanceof Error ? error.message : 'Error',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    Confirmar pago
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Todos los pagos</CardTitle>
            <CardDescription className="text-slate-400">
              {all.length} intentos de todos los clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              className="max-w-md border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              placeholder="Buscar por referencia, RUC, cliente o estado..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {payments.isLoading && <p className="text-sm text-slate-400">Cargando pagos...</p>}
            {!payments.isLoading && rows.length === 0 && (
              <p className="text-sm text-slate-400">Sin resultados.</p>
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
                        row.status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }
                    >
                      {row.statusLabel ?? row.status}
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
                    {row.ruc && <span className="text-xs text-slate-500">RUC {row.ruc}</span>}
                  </div>
                  <p className="text-xs text-slate-400">
                    {row.provider}
                    {row.method ? ` · ${row.method}` : ''} · plan {row.planId} ·{' '}
                    {fecha(row.createdAt)}
                    {row.paidAt ? ` · pagado ${fecha(row.paidAt)}` : ''}
                    {row.discountCode
                      ? ` · código ${row.discountCode} (−${money(row.discountCents ?? 0)})`
                      : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-100">
                  {money(row.amountCents)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
