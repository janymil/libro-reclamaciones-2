import { useState } from "react";
import { Link } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import CheckoutDialog from "@/components/payments/checkout-dialog";
import { usePlans, useSubscription } from "@/hooks/use-subscription";
import type { PlanDefinition } from "@shared/plans";

/**
 * Plan y Cuotas: the sellable SaaS surface. Shows the trial state,
 * usage meters against the effective plan limits and the three plans with
 * monthly/annual pricing. Positioning: "reclamos ilimitados en todos los
 * planes + IA en Pro" — competitors limit claims or charge per case.
 * Annual is pre-selected because it saves ~50% vs monthly.
 */

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const percent = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium">
          {used}{unlimited ? '' : ` / ${limit}`} {unlimited && <span className="text-green-600">· ilimitado</span>}
        </span>
      </div>
      {!unlimited && <Progress value={percent} className="h-2" />}
    </div>
  );
}

function PlanCard({
  plan,
  period,
  isCurrent,
  onSelect,
}: {
  plan: PlanDefinition;
  period: 'monthly' | 'annual';
  isCurrent: boolean;
  onSelect: (planId: string) => void;
}) {
  const price = period === 'annual' ? plan.priceAnnual : plan.priceMonthly;
  const isFree = plan.id === 'gratis';

  return (
    <Card className={isCurrent ? "border-primary ring-2 ring-primary/30" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrent && <Badge className="btn-primary">Plan actual</Badge>}
        </div>
        <CardDescription>{plan.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold">
            S/ {price}
            {!isFree && (
              <span className="text-sm font-normal text-gray-500"> /{period === 'annual' ? 'año' : 'mes'}</span>
            )}
          </p>
          {isFree ? (
            <p className="text-xs text-gray-500 mt-1">
              Para siempre · sin tarjeta · 5 reclamos al mes
            </p>
          ) : period === 'annual' ? (
            <p className="text-xs text-green-600 mt-1">Ahorra ~50% vs pagar mes a mes</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">El anual sale mucho más barato</p>
          )}
        </div>

        <ul className="space-y-2">
          {plan.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start text-sm text-gray-700">
              <span className="material-icons text-green-600 mr-2 text-lg">check_circle</span>
              {highlight}
            </li>
          ))}
        </ul>

        <Button
          className="w-full"
          variant={isCurrent ? "outline" : "default"}
          disabled={isCurrent || isFree}
          onClick={() => onSelect(plan.id)}
          data-testid={`button-select-plan-${plan.id}`}
        >
          {isFree ? 'Gratis, no se paga' : isCurrent ? "Plan activo" : `Pagar y activar ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionPage() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('annual');
  // Selecting a plan now opens the checkout: the plan is activated by the
  // confirmed payment, never by the click itself (Phase 2.7).
  const [checkoutPlan, setCheckoutPlan] = useState<PlanDefinition | null>(null);

  const { data: plans } = usePlans();
  const { data: subscription, isLoading } = useSubscription();

  const handleSelect = (planId: string) => {
    const plan = (plans ?? []).find((candidate) => candidate.id === planId) ?? null;
    setCheckoutPlan(plan);
  };

  return (
    <AppLayout title="Plan y Cuotas" subtitle="Elija el plan de su empresa">
      <div className="max-w-6xl mx-auto space-y-8">
        {isLoading && <p className="text-gray-500">Cargando suscripción...</p>}

        {subscription && (
          <>
            {/* Current state */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>Estado de la suscripción</CardTitle>
                    <CardDescription>
                      {subscription.isTrial
                        ? `Prueba gratuita activa — quedan ${subscription.trialDaysRemaining} día(s). Todas las funciones de Pro desbloqueadas.`
                        : `Plan ${subscription.plan.name} · ${subscription.planPeriod === 'annual' ? 'anual' : 'mensual'}`}
                    </CardDescription>
                  </div>
                  <Badge className={subscription.isTrial ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"}>
                    {subscription.isTrial ? "Prueba gratuita" : "Activo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {subscription.plan.limits.complaintsTotal !== null ? (
                  <UsageMeter
                    label="Reclamos usados (total del plan Gratis)"
                    used={subscription.usage.complaintsTotal}
                    limit={subscription.plan.limits.complaintsTotal}
                  />
                ) : (
                  <UsageMeter
                    label="Reclamos este mes"
                    used={subscription.usage.complaintsThisMonth}
                    limit={subscription.plan.limits.complaintsPerMonth}
                  />
                )}
                <UsageMeter label="Usuarios" used={subscription.usage.users} limit={subscription.plan.limits.users} />
                <UsageMeter
                  label="Sucursales"
                  used={subscription.usage.establishments}
                  limit={subscription.plan.limits.establishments}
                />
                <UsageMeter label="Empresas (RUCs)" used={subscription.usage.businesses} limit={subscription.plan.limits.businesses} />
              </CardContent>
            </Card>

            {/* Billing period toggle */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant={period === 'monthly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('monthly')}
              >
                Mensual
              </Button>
              <Button
                variant={period === 'annual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod('annual')}
              >
                Anual (ahorra ~50%)
              </Button>
            </div>

            {/* Plan catalog */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {(plans ?? []).map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  period={period}
                  isCurrent={!subscription.isTrial && subscription.storedPlanId === plan.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-2">
              <Link href="/pagos">
                <Button variant="link" data-testid="link-payment-history">
                  Ver historial de pagos
                </Button>
              </Link>
              <p className="text-xs text-gray-500 text-center">
                Reclamos ilimitados en todos los planes. La IA que redacta respuestas viene en Pro y Empresarial.
                El plan se activa cuando el pago queda confirmado: con tarjeta o
                Yape suele ser inmediato y, si elige transferencia, un administrador lo confirma en «Pagos».
                Consejo: el anual ahorra ~50% frente al mensual. Paga 2 años y llévate el 3ro al 50%.
              </p>
            </div>
          </>
        )}
      </div>

      <CheckoutDialog
        open={checkoutPlan !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCheckoutPlan(null);
          }
        }}
        plan={checkoutPlan}
        period={period}
      />
    </AppLayout>
  );
}
