import { useState } from 'react';
import { Link, useParams } from 'wouter';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdminCustomerDetail, useIsOperator } from '@/hooks/use-admin';
import { useRegisterManualPayment } from '@/hooks/use-payments';
import { adminPathFor } from '@/lib/admin-path';
import { PLAN_LIST } from '@shared/plans';
import {
  PAYMENT_CURRENCY_SYMBOL,
  PAYMENT_METHODS,
  type PaymentMethodId,
  type PlanPeriod,
} from '@shared/payments';

/**
 * Ficha de un cliente: todo lo que hace falta mientras el cliente está al
 * teléfono. Una sola petición, la mitad de la pantalla de un vistazo.
 */

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
const fecha = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-PE') : '—');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="pt-6">
        <p className="font-mono text-[10px] tracking-[0.18em] text-slate-400 uppercase">{label}</p>
        <p className="mt-1 text-xl font-semibold text-slate-50">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}
/** Plans that can be charged: the free one is not a payment. */
const PAYABLE_PLANS = PLAN_LIST.filter((plan) => plan.priceMonthly > 0);
const OFFLINE_METHODS: PaymentMethodId[] = ['transferencia', 'yape', 'plin', 'efectivo'];

function priceInSoles(planId: string, period: PlanPeriod): number {
  const plan = PAYABLE_PLANS.find((row) => row.id === planId) ?? PAYABLE_PLANS[0];
  return period === 'annual' ? plan.priceAnnual : plan.priceMonthly;
}

/**
 * A payment recorded by hand: the customer paid by transfer / Yape without
 * finishing a checkout.
 *
 * It creates the `payments` row AND applies the plan in one step, on purpose: a
 * plan that appears with no money behind it cannot be reconciled later. This is
 * the console's answer to "activate the plan manually".
 */
function ManualPaymentCard({
  businessId,
  currentPlan,
  currentPeriod,
}: {
  businessId: string;
  currentPlan: string;
  currentPeriod: string;
}) {
  const { toast } = useToast();
  const register = useRegisterManualPayment();

  const initialPlan = PAYABLE_PLANS.some((plan) => plan.id === currentPlan)
    ? currentPlan
    : PAYABLE_PLANS[0].id;
  const initialPeriod: PlanPeriod = currentPeriod === 'annual' ? 'annual' : 'monthly';

  const [planId, setPlanId] = useState(initialPlan);
  const [period, setPeriod] = useState<PlanPeriod>(initialPeriod);
  const [method, setMethod] = useState<PaymentMethodId>('transferencia');
  const [amount, setAmount] = useState(() => String(priceInSoles(initialPlan, initialPeriod)));
  const [note, setNote] = useState('');

  const choosePlan = (nextPlan: string, nextPeriod: PlanPeriod) => {
    setPlanId(nextPlan);
    setPeriod(nextPeriod);
    // The list price is the default; an operator may overwrite it with what the
    // bank actually shows (a negotiated price, a partial payment).
    setAmount(String(priceInSoles(nextPlan, nextPeriod)));
  };

  const submit = async () => {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast({
        title: 'Monto inválido',
        description: 'Escriba el monto en soles.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await register.mutateAsync({
        businessId,
        planId,
        period,
        method,
        amountCents: cents,
        note: note.trim() || undefined,
      });
      toast({ title: 'Pago registrado', description: result.message });
      setNote('');
    } catch (error) {
      toast({
        title: 'No se pudo registrar el pago',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="text-slate-50">Registrar pago manual</CardTitle>
        <CardDescription className="text-slate-400">
          Para dinero que llegó por transferencia, Yape, Plin o efectivo sin una orden en el sistema.
          Crea el pago, activa el plan y envía el comprobante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label className="text-slate-300" htmlFor="manual-plan">
              Plan
            </Label>
            <select
              id="manual-plan"
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
              value={planId}
              onChange={(event) => choosePlan(event.target.value, period)}
            >
              {PAYABLE_PLANS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300" htmlFor="manual-period">
              Periodo
            </Label>
            <select
              id="manual-period"
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
              value={period}
              onChange={(event) => choosePlan(planId, event.target.value as PlanPeriod)}
            >
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300" htmlFor="manual-method">
              Medio
            </Label>
            <select
              id="manual-method"
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
            <Label className="text-slate-300" htmlFor="manual-amount">
              Monto ({PAYMENT_CURRENCY_SYMBOL})
            </Label>
            <Input
              id="manual-amount"
              className="border-slate-700 bg-slate-950 text-slate-100"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300" htmlFor="manual-note">
            Número de operación (opcional)
          </Label>
          <Input
            id="manual-note"
            className="border-slate-700 bg-slate-950 text-slate-100"
            value={note}
            placeholder="Ej.: operación BCP 123456 / Yape 998877"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <Button
          className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          onClick={() => void submit()}
          disabled={register.isPending}
        >
          {register.isPending ? 'Registrando...' : 'Registrar pago y activar plan'}
        </Button>
      </CardContent>
    </Card>
  );
}



export default function AdminCustomerDetailPage() {
  const isOperator = useIsOperator();
  const params = useParams<{ businessId: string }>();
  const businessId = params.businessId ?? null;
  const detail = useAdminCustomerDetail(businessId, isOperator);

  const data = detail.data;
  const paidCents = (data?.payments ?? [])
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  return (
    <AdminLayout
      title={data?.business.businessName ?? 'Ficha del cliente'}
      subtitle={
        data
          ? `RUC ${data.business.ruc} · ${data.business.distrito}, ${data.business.provincia}`
          : 'Cargando...'
      }
      actions={
        <Link href={adminPathFor('/clientes')}>
          <span className="cursor-pointer text-sm text-amber-300 hover:underline">
            ← Volver a clientes
          </span>
        </Link>
      }
    >
      <div className="space-y-6">
        {detail.isLoading && <p className="text-sm text-slate-400">Cargando la ficha...</p>}
        {!detail.isLoading && !data && (
          <p className="text-sm text-slate-400">No se encontró el cliente.</p>
        )}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Plan"
                value={data.business.subscriptionPlan}
                hint={`${data.business.subscriptionStatus} · ${
                  data.business.planPeriod === 'annual' ? 'anual' : 'mensual'
                } · vence ${fecha(data.business.currentPeriodEnd)}`}
              />
              <Stat
                label="Pagado"
                value={money(paidCents)}
                hint={`${data.payments.length} intentos de pago`}
              />
              <Stat
                label="Reclamos"
                value={String(data.complaints.total)}
                hint={`${data.complaints.pending} sin responder`}
              />
              <Stat
                label="Estructura"
                value={`${data.establishments.length} sucursales`}
                hint={`${data.apiKeys.total} claves API`}
              />
            </div>

            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-slate-50">Accesos</CardTitle>
                <CardDescription className="text-slate-400">
                  Quién puede entrar en nombre del cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.logins.map((login) => (
                  <div
                    key={login.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-2 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm text-slate-100">{login.email}</p>
                      <p className="text-xs text-slate-400">
                        {login.firstName} {login.lastName} · {login.role} · último acceso{' '}
                        {fecha(login.lastLoginAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!login.isActive && (
                        <Badge className="bg-red-500/15 text-red-300">Inactivo</Badge>
                      )}
                      {!login.isEmailVerified && (
                        <Badge className="bg-amber-500/15 text-amber-300">Sin confirmar</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-slate-50">Cobros automáticos</CardTitle>
                <CardDescription className="text-slate-400">
                  Autorizaciones de Mercado Pago de este cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.subscriptions.length === 0 && (
                  <p className="text-sm text-slate-400">Sin cobro automático.</p>
                )}
                {data.subscriptions.map((subscription) => (
                  <div
                    key={subscription.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-2 last:border-b-0"
                  >
                    <div>
                      <p className="font-mono text-sm text-slate-100">{subscription.reference}</p>
                      <p className="text-xs text-slate-400">
                        {subscription.provider} · {subscription.planId} · inicio{' '}
                        {fecha(subscription.startedAt ?? subscription.createdAt)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <Badge
                        className={
                          subscription.cancelledAt
                            ? 'bg-slate-700/40 text-slate-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }
                      >
                        {subscription.cancelledAt ? 'Cancelada' : subscription.status}
                      </Badge>
                      <p className="mt-1">Próximo: {fecha(subscription.nextPaymentAt)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <ManualPaymentCard
              businessId={data.business.id}
              currentPlan={data.business.subscriptionPlan}
              currentPeriod={data.business.planPeriod}
            />

            <Card className="border-slate-800 bg-slate-900">
              <CardHeader>
                <CardTitle className="text-slate-50">Últimos reclamos</CardTitle>
                <CardDescription className="text-slate-400">
                  Sin responder todavía: {data.complaints.pending}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.complaints.latest.length === 0 && (
                  <p className="text-sm text-slate-400">Sin reclamos registrados.</p>
                )}
                {data.complaints.latest.map((complaint) => (
                  <div
                    key={complaint.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-2 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm text-slate-100">
                        {complaint.correlativeNumber ?? complaint.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {complaint.complaintType} · {complaint.status} · presentado{' '}
                        {fecha(complaint.submissionDate)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      Vence {fecha(complaint.dueDate)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
