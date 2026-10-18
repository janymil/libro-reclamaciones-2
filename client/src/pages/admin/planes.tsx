import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdminPlanPricing, useIsOperator, useUpdatePlanPricing } from '@/hooks/use-admin';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';
import { formatIgvRate } from '@shared/tax';

/**
 * Planes: lo que cobramos hoy.
 *
 * `shared/plans.ts` sigue diciendo qué incluye cada plan; esta pantalla dice cuánto
 * cuesta, y el servidor cobra desde aquí. Es la misma cifra que ve un cliente en la web
 * pública (`GET /api/plans`), así que la pantalla no puede prometer un precio que el
 * cobro no respete.
 *
 * Dos reglas que se ven en la interfaz:
 *   * un precio igual al del catálogo NO se guarda como excepción (vuelve a la fila
 *     base): una tabla con "lo mismo que el código" acaba mintiendo;
 *   * un plan pagado no puede quedar en S/ 0.00 - para eso está el plan Gratis.
 */

const inputClass = 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500';

/** Céntimos -> "29.00" (lo que el operador escribe). */
const toSoles = (cents: number) => (cents / 100).toFixed(2);

/** "29,00" | "29" | " 29.005 " -> céntimos, nunca NaN. */
function toCents(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) {
    return 0;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * 100);
}

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${toSoles(cents)}`;

interface PriceForm {
  monthly: string;
  annual: string;
}

export default function AdminPlansPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const pricing = useAdminPlanPricing(isOperator);
  const save = useUpdatePlanPricing();

  const [prices, setPrices] = useState<Record<string, PriceForm>>({});
  const [trialDays, setTrialDays] = useState('15');

  useEffect(() => {
    if (!pricing.data) {
      return;
    }
    setPrices(
      Object.fromEntries(
        pricing.data.plans.map((plan) => [
          plan.planId,
          { monthly: toSoles(plan.monthlyCents), annual: toSoles(plan.annualCents) },
        ]),
      ),
    );
    setTrialDays(String(pricing.data.trialDays));
  }, [pricing.data]);

  const setPrice = (planId: string, field: keyof PriceForm, value: string) =>
    setPrices((current) => ({
      ...current,
      [planId]: { ...(current[planId] ?? { monthly: '', annual: '' }), [field]: value },
    }));

  /** What the customer will read, computed from the form (before saving). */
  const preview = useMemo(
    () =>
      (pricing.data?.plans ?? []).map((plan) => {
        const monthlyCents = toCents(prices[plan.planId]?.monthly ?? '');
        const annualCents = toCents(prices[plan.planId]?.annual ?? '');
        const fullYear = monthlyCents * 12;
        const saving =
          fullYear > 0 && annualCents > 0
            ? Math.round(((fullYear - annualCents) / fullYear) * 100)
            : 0;
        return { planId: plan.planId, name: plan.name, monthlyCents, annualCents, saving };
      }),
    [pricing.data, prices],
  );

  const emptyPlan = preview.find((plan) => plan.monthlyCents === 0 && plan.annualCents === 0);

  const handleSave = async () => {
    try {
      const payload = {
        prices: preview.map((plan) => ({
          planId: plan.planId,
          monthlyCents: plan.monthlyCents,
          annualCents: plan.annualCents,
        })),
        trialDays: Math.max(1, Math.round(Number(trialDays) || 0)),
      };
      await save.mutateAsync(payload);
      await pricing.refetch();
      toast({
        title: 'Precios guardados',
        description: 'Es lo que cobrará el siguiente pago y lo que verá el cliente.',
      });
    } catch (error) {
      toast({
        title: 'No se pudieron guardar los precios',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout
      title="Planes"
      subtitle="Precios vigentes, prueba gratuita y qué incluye cada plan"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
            onClick={() => pricing.refetch()}
            disabled={pricing.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Recargar
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            disabled={save.isPending || Boolean(emptyPlan)}
            data-testid="button-save-plan-pricing"
            onClick={() => void handleSave()}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {save.isPending ? 'Guardando...' : 'Guardar precios'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Precios (en soles, IGV incluido)</CardTitle>
            <CardDescription className="text-slate-400">
              Es lo que se cobra en el pago y lo que aparece en la página de planes. Los importes son
              precios finales con IGV ({formatIgvRate()}) incluido: el comprobante los desglosa en
              valor de venta e IGV. El plan Gratis siempre es gratis. Debajo de cada plan está el
              precio que trae el código, como referencia: si escribe ese mismo importe, la fila deja
              de ser una excepción.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pricing.isLoading && <p className="text-sm text-slate-400">Cargando precios...</p>}

            {(pricing.data?.plans ?? []).map((plan) => {
              const form = prices[plan.planId] ?? { monthly: '', annual: '' };
              return (
                <div
                  key={plan.planId}
                  className="grid gap-3 border-b border-slate-800 pb-4 last:border-b-0 lg:grid-cols-12"
                >
                  <div className="space-y-1 lg:col-span-4">
                    <p className="text-sm text-slate-100">
                      {plan.name}{' '}
                      <span className="font-mono text-xs text-slate-500">{plan.planId}</span>
                    </p>
                    <Badge
                      className={
                        plan.isOverride
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-slate-800 text-slate-300'
                      }
                    >
                      {plan.isOverride ? 'precio propio' : 'del catálogo'}
                    </Badge>
                    <p className="text-xs text-slate-500">
                      Código: {money(plan.catalogueMonthlyCents)}/mes ·{' '}
                      {money(plan.catalogueAnnualCents)}/año
                    </p>
                  </div>

                  <div className="space-y-2 lg:col-span-3">
                    <Label className="text-slate-300">Mensual</Label>
                    <Input
                      className={inputClass}
                      inputMode="decimal"
                      data-testid={`plan-monthly-${plan.planId}`}
                      value={form.monthly}
                      onChange={(event) => setPrice(plan.planId, 'monthly', event.target.value)}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-3">
                    <Label className="text-slate-300">Anual</Label>
                    <Input
                      className={inputClass}
                      inputMode="decimal"
                      data-testid={`plan-annual-${plan.planId}`}
                      value={form.annual}
                      onChange={(event) => setPrice(plan.planId, 'annual', event.target.value)}
                    />
                  </div>

                  <div className="flex items-end lg:col-span-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-300 hover:bg-slate-800 hover:text-slate-50"
                      onClick={() =>
                        setPrices((current) => ({
                          ...current,
                          [plan.planId]: {
                            monthly: toSoles(plan.catalogueMonthlyCents),
                            annual: toSoles(plan.catalogueAnnualCents),
                          },
                        }))
                      }
                    >
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Al catálogo
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Prueba gratuita y vista previa</CardTitle>
            <CardDescription className="text-slate-400">
              La prueba se aplica a las empresas nuevas desde ahora; las que ya están en prueba
              conservan la fecha que tienen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="trial-days">
                Días de prueba gratuita
              </Label>
              <Input
                id="trial-days"
                className={`max-w-[8rem] ${inputClass}`}
                inputMode="numeric"
                data-testid="input-trial-days"
                value={trialDays}
                onChange={(event) => setTrialDays(event.target.value)}
              />
            </div>

            {emptyPlan && (
              <p className="text-sm text-amber-300">
                {emptyPlan.name} está en S/ 0.00: un plan pagado no puede quedar gratis. Corríjalo o
                use el plan Gratis para eso.
              </p>
            )}

            <div className="space-y-2 border-t border-slate-800 pt-3 text-sm">
              <p className="text-xs text-slate-400">
                Cómo lo verá el cliente (lo que hay en pantalla, todavía sin guardar):
              </p>
              {preview.map((plan) => (
                <div
                  key={plan.planId}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 py-1.5 last:border-b-0"
                >
                  <span className="text-slate-100">{plan.name}</span>
                  <span className="text-slate-300">
                    {money(plan.monthlyCents)}/mes · {money(plan.annualCents)}/año
                    {plan.saving > 0 ? (
                      <span className="text-emerald-300"> · ahorra {plan.saving}%</span>
                    ) : null}
                  </span>
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Prueba gratuita que leerá el cliente:{' '}
                {Math.max(1, Math.round(Number(trialDays) || 0))} días.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
