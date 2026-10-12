import { useState } from "react";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { usePlans, useSubscription, useChangePlan } from "@/hooks/use-subscription";
import type { PlanDefinition } from "@shared/plans";

/**
 * Plan y Cuotas (Phase 2.6): the sellable SaaS surface. Shows the trial state,
 * usage meters against the effective plan limits and the three plans with
 * monthly/annual pricing. Positioning: "reclamos ilimitados + IA incluida"
 * from Profesional up - competitors charge per complaint.
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
  pending,
}: {
  plan: PlanDefinition;
  period: 'monthly' | 'annual';
  isCurrent: boolean;
  onSelect: (planId: string) => void;
  pending: boolean;
}) {
  const price = period === 'annual' ? plan.priceAnnual : plan.priceMonthly;

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
            <span className="text-sm font-normal text-gray-500"> /{period === 'annual' ? 'año' : 'mes'}</span>
          </p>
          {period === 'annual' && (
            <p className="text-xs text-green-600 mt-1">2 meses gratis con el pago anual</p>
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
          disabled={isCurrent || pending}
          onClick={() => onSelect(plan.id)}
          data-testid={`button-select-plan-${plan.id}`}
        >
          {isCurrent ? "Plan activo" : pending ? "Cambiando..." : `Cambiar a ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');

  const { data: plans } = usePlans();
  const { data: subscription, isLoading } = useSubscription();
  const changePlan = useChangePlan();

  const handleSelect = async (planId: string) => {
    try {
      const result = await changePlan.mutateAsync({ plan: planId, period });
      toast({ title: "Plan actualizado", description: result.message });
    } catch (error) {
      toast({
        title: "No se pudo cambiar el plan",
        description: error instanceof Error ? error.message : "Intente nuevamente",
        variant: "destructive",
      });
    }
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
                        ? `Prueba gratuita activa — quedan ${subscription.trialDaysRemaining} día(s). Todas las funciones de Profesional desbloqueadas.`
                        : `Plan ${subscription.plan.name} · ${subscription.planPeriod === 'annual' ? 'anual' : 'mensual'}`}
                    </CardDescription>
                  </div>
                  <Badge className={subscription.isTrial ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"}>
                    {subscription.isTrial ? "Prueba gratuita" : "Activo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <UsageMeter
                  label="Reclamos este mes"
                  used={subscription.usage.complaintsThisMonth}
                  limit={subscription.plan.limits.complaintsPerMonth}
                />
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
                Anual (2 meses gratis)
              </Button>
            </div>

            {/* Plan catalog */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(plans ?? []).map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  period={period}
                  isCurrent={!subscription.isTrial && subscription.storedPlanId === plan.id}
                  onSelect={handleSelect}
                  pending={changePlan.isPending}
                />
              ))}
            </div>

            <p className="text-xs text-gray-500 text-center">
              Los reclamos ilimitados incluyen todas las funciones de IA (clasificación, borradores de respuesta,
              predicción de SLA y tendencias). El cobro se gestiona con su proveedor de pagos al confirmar el plan.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}
