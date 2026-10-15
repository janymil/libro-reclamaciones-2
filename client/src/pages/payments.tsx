import { useEffect, useState } from "react";

import AppLayout from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  useAgreement,
  useCancelAgreement,
  useConfirmPayment,
  usePayments,
  useRefreshAgreement,
  useRefreshPayment,
  type AgreementRecord,
  type PaymentRecord,
} from "@/hooks/use-payments";
import {
  PAYMENT_CURRENCY_SYMBOL,
  getPaymentProvider,
  type PaymentProviderDefinition,
} from "@shared/payments";

/**
 * Pagos (Phase 2.7): the subscription payment history.
 *
 * Two jobs:
 *   * show every attempt with its reference, so the customer and our support
 *     can reconcile a bank transfer without guessing;
 *   * let an administrator confirm a transfer / Yape that arrived, and re-check
 *     a pending online payment (the webhook can be a few seconds late).
 */

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-800",
  expired: "bg-gray-200 text-gray-700",
  refunded: "bg-purple-100 text-purple-800",
};

function providerName(providerId: string): string {
  const provider: PaymentProviderDefinition | undefined = getPaymentProvider(providerId);
  return provider?.name ?? providerId;
}

function formatAmount(payment: PaymentRecord): string {
  return `${PAYMENT_CURRENCY_SYMBOL} ${(payment.amountCents / 100).toFixed(2)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The recurring agreement: what the customer authorised, and the only place a
 * subscription can be stopped. Cancelling keeps the access they already paid for
 * and simply prevents the next charge.
 */
function AgreementCard({
  agreement,
  canCancel,
  onCancel,
  onRefresh,
  busy,
  refreshing,
}: {
  agreement: AgreementRecord;
  canCancel: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  busy: boolean;
  refreshing: boolean;
}) {
  const amount = `${PAYMENT_CURRENCY_SYMBOL} ${(agreement.amountCents / 100).toFixed(2)}`;
  const every = agreement.period === 'annual' ? 'año' : 'mes';

  return (
    <Card className={agreement.isLive ? "border-green-300 bg-green-50" : ""}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Suscripción</CardTitle>
            <CardDescription>
              {providerName(agreement.provider)} · referencia{' '}
              <span className="font-mono">{agreement.reference}</span>
            </CardDescription>
          </div>
          <Badge className={agreement.isLive ? "bg-green-200 text-green-900" : "bg-gray-200 text-gray-700"}>
            {agreement.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700">
          Plan <span className="font-medium capitalize">{agreement.planId}</span> · {amount} cada {every}
        </p>

        {agreement.isLive && (
          <p className="text-sm text-gray-700">
            {agreement.nextPaymentAt
              ? `Próximo cobro automático: ${formatDate(agreement.nextPaymentAt)}.`
              : 'El proveedor cobrará automáticamente cuando termine el periodo pagado.'}
          </p>
        )}

        {agreement.isLive && canCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy} data-testid="button-cancel-subscription">
            {busy ? 'Cancelando...' : 'Cancelar suscripción'}
          </Button>
        )}

        {agreement.isLive && !canCancel && (
          <p className="text-xs text-gray-500">Solo un administrador puede cancelar la suscripción.</p>
        )}

        {agreement.status === 'cancelled' && (
          <p className="text-sm text-gray-600">
            No se harán más cobros automáticos. Mantiene el acceso hasta el final del periodo pagado.
          </p>
        )}

        {agreement.status === 'paused' && (
          <p className="text-sm text-amber-800">
            El proveedor no pudo realizar el último cobro. Actualice su medio de pago para evitar la
            suspensión del servicio.
          </p>
        )}

        {agreement.status === 'pending' && (
          <div className="space-y-2">
            <p className="text-sm text-amber-800">
              Falta autorizar el cobro automático. Si ya lo autorizó, verifique el estado.
            </p>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Verificando...' : 'Verificar ahora'}
            </Button>
          </div>
        )}

        {agreement.status === 'paused' && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Verificando...' : 'Verificar ahora'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentRow({
  payment,
  canConfirm,
  onConfirm,
  onRefresh,
  busy,
}: {
  payment: PaymentRecord;
  canConfirm: boolean;
  onConfirm: () => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const isManual = payment.provider === 'manual';

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b py-4 last:border-b-0">
      <div className="min-w-[14rem] space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{payment.reference}</span>
          <Badge className={STATUS_STYLES[payment.status] ?? "bg-gray-100 text-gray-700"}>
            {payment.statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-gray-700">
          Plan <span className="font-medium capitalize">{payment.planId}</span> ·{' '}
          {payment.period === 'annual' ? 'anual' : 'mensual'}
        </p>
        <p className="text-xs text-gray-500">
          {providerName(payment.provider)} · {formatDate(payment.createdAt)}
          {payment.paidAt ? ` · pagado el ${formatDate(payment.paidAt)}` : ''}
        </p>
        {payment.failureReason && (
          <p className="text-xs text-red-700">{payment.failureReason}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className="text-base font-semibold">{formatAmount(payment)}</span>

        {payment.status === 'pending' && !isManual && (
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy}>
            Verificar ahora
          </Button>
        )}

        {payment.status === 'pending' && isManual && canConfirm && (
          <Button size="sm" onClick={onConfirm} disabled={busy} data-testid={`button-confirm-payment-${payment.reference}`}>
            {busy ? 'Confirmando...' : 'Confirmar pago recibido'}
          </Button>
        )}

        {payment.status === 'pending' && isManual && !canConfirm && (
          <span className="text-xs text-gray-500">
            Esperando confirmación de un administrador
          </span>
        )}
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Query params are read once: this page is also where the PSP redirects the
  // customer back (?pago=ok|error|pendiente&ref=LV-XXXXXX).
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const returnState = params.get('pago');
  const returnRef = params.get('ref');

  const payments = usePayments();
  const refresh = useRefreshPayment();
  const confirm = useConfirmPayment();
  const agreement = useAgreement();
  const refreshAgreement = useRefreshAgreement();
  const cancelAgreement = useCancelAgreement();

  const [checkedReturn, setCheckedReturn] = useState(false);

  /**
   * The webhook can arrive a few seconds after the browser comes back, so on
   * return we ask the provider ourselves instead of showing a stale "pendiente".
   *
   * A subscription comes back with the agreement's reference, a one-off payment
   * with the payment's, so both are handled here.
   */
  useEffect(() => {
    if (checkedReturn || !returnState) {
      return;
    }

    const pendingAgreement =
      agreement.data && agreement.data.reference === returnRef && agreement.data.status === 'pending'
        ? agreement.data
        : undefined;

    if (pendingAgreement) {
      setCheckedReturn(true);
      refreshAgreement
        .mutateAsync()
        .then((updated) => {
          if (updated?.isLive) {
            toast({
              title: "Suscripción activa",
              description: "Se cobrará automáticamente cada periodo. Puede cancelarla cuando quiera.",
            });
          }
        })
        .catch(() => {
          // Not fatal: the customer can retry from this page.
        });
      return;
    }

    if (!payments.data) {
      return;
    }
    setCheckedReturn(true);

    const target = payments.data.find(
      (payment) => payment.reference === returnRef && payment.status === 'pending',
    );
    if (!target) {
      return;
    }

    refresh
      .mutateAsync(target.id)
      .then((result) => {
        if (result.payment?.status === 'paid') {
          toast({
            title: "Pago confirmado",
            description: `El plan quedó activo con el pago ${target.reference}.`,
          });
        }
      })
      .catch(() => {
        // Not fatal: the customer can press "Verificar ahora".
      });
    // Runs once per page load on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedReturn, returnState, returnRef, payments.data]);

  const handleConfirm = async (payment: PaymentRecord) => {
    try {
      const result = await confirm.mutateAsync(payment.id);
      toast({ title: "Pago confirmado", description: result.message });
    } catch (error) {
      toast({
        title: "No se pudo confirmar el pago",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : undefined,
        variant: "destructive",
      });
    }
  };

  const handleRefreshAgreement = async () => {
    try {
      const updated = await refreshAgreement.mutateAsync();
      toast({
        title: updated?.isLive ? "Suscripción activa" : "Todavía no está autorizada",
        description: updated
          ? `Referencia ${updated.reference}: ${updated.statusLabel}.`
          : undefined,
      });
    } catch (error) {
      toast({
        title: "No se pudo verificar la suscripción",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : undefined,
        variant: "destructive",
      });
    }
  };

  const handleCancelAgreement = async () => {
    try {
      const result = await cancelAgreement.mutateAsync();
      toast({ title: "Suscripción cancelada", description: result.message });
    } catch (error) {
      toast({
        title: "No se pudo cancelar la suscripción",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : undefined,
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async (payment: PaymentRecord) => {
    try {
      const result = await refresh.mutateAsync(payment.id);
      toast({
        title: result.payment?.status === 'paid' ? "Pago confirmado" : "Todavía no se registró el pago",
        description: `Referencia ${payment.reference}: ${result.payment?.statusLabel ?? 'sin cambios'}.`,
      });
    } catch (error) {
      toast({
        title: "No se pudo verificar el pago",
        description: error instanceof Error ? error.message.replace(/^\d{3}:\s*/, "") : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout title="Pagos" subtitle="Historial y confirmación de pagos de su plan">
      <div className="max-w-4xl mx-auto space-y-6">
        {returnState === 'ok' && (
          <Card className="border-green-300 bg-green-50">
            <CardContent className="pt-6">
              <p className="font-medium text-green-900">¡Gracias! Estamos verificando su pago.</p>
              <p className="mt-1 text-sm text-green-900">
                Si autorizó el cobro automático o pagó con tarjeta o Yape, la confirmación suele
                tardar unos segundos. Use «Verificar ahora» si el estado sigue pendiente.
              </p>
            </CardContent>
          </Card>
        )}

        {returnState === 'error' && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-6">
              <p className="font-medium text-red-900">El pago no se completó.</p>
              <p className="mt-1 text-sm text-red-900">
                No se realizó ningún cargo. Puede intentarlo otra vez desde «Plan y Cuotas».
              </p>
            </CardContent>
          </Card>
        )}

        {returnState === 'pendiente' && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="pt-6">
              <p className="font-medium text-amber-900">Pago pendiente.</p>
              <p className="mt-1 text-sm text-amber-900">
                Si eligió pagar en efectivo, complete el pago con el código que se le mostró.
                En cuanto se acredite, el plan se activará solo.
              </p>
            </CardContent>
          </Card>
        )}

        {agreement.data && (
          <AgreementCard
            agreement={agreement.data}
            canCancel={isAdmin}
            busy={cancelAgreement.isPending}
            refreshing={refreshAgreement.isPending}
            onCancel={handleCancelAgreement}
            onRefresh={handleRefreshAgreement}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Historial de pagos</CardTitle>
            <CardDescription>
              Cada intento y cada cobro automático quedan registrados con su referencia para que
              pueda conciliarlos con su banco. El plan se activa únicamente cuando el pago queda
              confirmado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payments.isLoading && <p className="text-sm text-gray-500">Cargando pagos...</p>}

            {!payments.isLoading && (payments.data ?? []).length === 0 && (
              <p className="text-sm text-gray-500">
                Todavía no hay pagos. Puede contratar un plan desde «Plan y Cuotas».
              </p>
            )}

            {(payments.data ?? []).map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                canConfirm={isAdmin}
                busy={
                  (refresh.isPending && refresh.variables === payment.id) ||
                  (confirm.isPending && confirm.variables === payment.id)
                }
                onConfirm={() => handleConfirm(payment)}
                onRefresh={() => handleRefresh(payment)}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
