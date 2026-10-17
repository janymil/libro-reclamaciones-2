import { useState } from 'react';
import { Link } from 'wouter';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAdminPayments, useIsOperator, type AdminPaymentRow } from '@/hooks/use-admin';
import {
  useConfirmOfflinePayment,
  useConfirmPayment,
  usePendingManualPayments,
  useSendPaymentLink,
} from '@/hooks/use-payments';
import { adminPathFor } from '@/lib/admin-path';
import { PAYMENT_CURRENCY_SYMBOL, PAYMENT_METHODS, type PaymentMethodId } from '@shared/payments';

/**
 * Pagos: la caja.
 *
 * Arriba, la cola que espera a una persona: transferencias y Yape que el equipo
 * confirma mirando su propia cuenta. Debajo, todos los intentos de todos los
 * clientes, que es con lo que se concilia el banco.
 *
 * Cada fila que no está pagada ofrece las dos salidas que existen cuando una
 * tarjeta no pasa: reenviar al cliente el enlace de pago (el mismo que usó, más
 * los datos de transferencia/Yape) o confirmar que el dinero llegó por otro medio,
 * que empareja el depósito con el pedido que el cliente cita (`LD-XXXXXX`).
 */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
const fecha = (value: string | null) => (value ? new Date(value).toLocaleString('es-PE') : '—');

/** Los métodos que un operador puede confirmar a mano (nunca una tarjeta). */
const OFFLINE_METHODS: PaymentMethodId[] = ['transferencia', 'yape', 'plin', 'efectivo'];

const statusTone = (status: string) =>
  status === 'paid'
    ? 'bg-emerald-500/15 text-emerald-300'
    : status === 'failed'
      ? 'bg-rose-500/15 text-rose-300'
      : 'bg-amber-500/15 text-amber-300';

export default function AdminPaymentsPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const payments = useAdminPayments(isOperator);
  const pending = usePendingManualPayments(isOperator);
  const confirm = useConfirmPayment();
  const sendLink = useSendPaymentLink();
  const confirmOffline = useConfirmOfflinePayment();

  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminPaymentRow | null>(null);
  const [method, setMethod] = useState<PaymentMethodId>('transferencia');
  const [note, setNote] = useState('');

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

  /** Reenvía el mismo enlace de pago que el cliente usó, más los datos offline. */
  const sendPaymentLink = async (row: { id: string }) => {
    try {
      const result = await sendLink.mutateAsync(row.id);
      toast({ title: 'Enlace enviado', description: result.message });
    } catch (error) {
      toast({
        title: 'No se pudo enviar el enlace',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const openConfirm = (row: AdminPaymentRow) => {
    setTarget(row);
    setMethod(row.method === 'yape' || row.method === 'plin' ? row.method : 'transferencia');
    setNote('');
  };

  const submitConfirm = async () => {
    if (!target) {
      return;
    }
    try {
      const result = await confirmOffline.mutateAsync({
        paymentId: target.id,
        method,
        note: note.trim() || undefined,
      });
      toast({ title: 'Pago confirmado', description: result.message });
      setTarget(null);
    } catch (error) {
      toast({
        title: 'No se pudo confirmar',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

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
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                    disabled={sendLink.isPending}
                    onClick={() => void sendPaymentLink(row.payment)}
                  >
                    Enviar enlace
                  </Button>
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
                    <Badge className={statusTone(row.status)}>
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
                    {row.method
                      ? ` · ${PAYMENT_METHODS[row.method as PaymentMethodId]?.name ?? row.method}`
                      : ''}{' '}
                    · plan {row.planId} · {fecha(row.createdAt)}
                    {row.paidAt ? ` · pagado ${fecha(row.paidAt)}` : ''}
                    {row.discountCode
                      ? ` · código ${row.discountCode} (−${money(row.discountCents ?? 0)})`
                      : ''}
                    {(row.recoveryEmailCount ?? 0) > 0
                      ? ` · enlace enviado ${row.recoveryEmailCount}×`
                      : ''}
                  </p>
                  {row.failureReason && (
                    <p className="max-w-2xl text-xs text-rose-300">{row.failureReason}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {money(row.amountCents)}
                  </span>
                  {row.status !== 'paid' && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        disabled={sendLink.isPending}
                        onClick={() => void sendPaymentLink(row)}
                      >
                        Enviar enlace
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        onClick={() => openConfirm(row)}
                      >
                        Confirmar transferencia/Yape
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <DialogHeader>
            <DialogTitle>Confirmar pago recibido</DialogTitle>
            <DialogDescription className="text-slate-400">
              {target?.reference} · {target ? money(target.amountCents) : ''}. Confirme solo después
              de ver el depósito o la operación en su cuenta: el plan del cliente se activa y se
              envía el comprobante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="confirm-method">
                ¿Cómo llegó el dinero?
              </Label>
              <select
                id="confirm-method"
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethodId)}
              >
                {OFFLINE_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {PAYMENT_METHODS[option].name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="confirm-note">
                Número de operación (opcional)
              </Label>
              <Textarea
                id="confirm-note"
                className="border-slate-700 bg-slate-950 text-slate-100"
                rows={3}
                value={note}
                placeholder="Ej.: operación BCP 123456 / Yape 998877"
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="text-xs text-slate-400">
                Se guarda junto al pago para conciliarlo con el banco.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={confirmOffline.isPending}
            >
              Cancelar
            </Button>
            <Button
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              onClick={() => void submitConfirm()}
              disabled={confirmOffline.isPending}
            >
              {confirmOffline.isPending ? 'Confirmando...' : 'Confirmar y activar plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
