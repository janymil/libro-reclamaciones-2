import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Tag, Trash2 } from 'lucide-react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminDiscountCodes,
  useCreateDiscountCode,
  useDeleteDiscountCode,
  useIsOperator,
  useUpdateDiscountCode,
  type AdminDiscountCode,
} from '@/hooks/use-admin';
import { usePlans } from '@/hooks/use-subscription';
import { discountAmountOffCents, normalizeDiscountCode } from '@shared/discounts';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';

/**
 * Descuentos: códigos de promoción.
 *
 * Un código es una promesa ("PRO10 = 10% menos"), así que la aritmética vive en
 * `@shared/discounts` y se aplica en el servidor sobre el precio del servidor. Aquí
 * solo se crean y se desactivan.
 *
 * Tres reglas que se ven en la pantalla:
 *   * el código se guarda normalizado (mayúsculas, sin guiones), así que `pro-10` y
 *     `PRO 10` son el mismo código y no dos promesas distintas;
 *   * un código agotado o vencido se muestra como tal;
 *   * el uso se cuenta solo cuando el pago se confirma, nunca al iniciar el cobro.
 */

const inputClass = 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500';

const money = (cents: number) => `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
const fecha = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-PE') : '—');
const fechaHora = (value: string | null) =>
  value ? new Date(value).toLocaleString('es-PE') : '—';

/** "29,5" | "29" -> céntimos. Nunca NaN. */
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

/** A date input is midnight; a code must last until the END of its last day. */
function endOfDayIso(date: string): string | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(`${date}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const STATE_BADGES: Record<AdminDiscountCode['state'], string> = {
  activo: 'bg-emerald-500/15 text-emerald-300',
  inactivo: 'bg-slate-800 text-slate-300',
  vencido: 'bg-amber-500/15 text-amber-300',
  agotado: 'bg-red-500/15 text-red-300',
};

const STATE_LABELS: Record<AdminDiscountCode['state'], string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  vencido: 'Vencido',
  agotado: 'Agotado',
};

const EMPTY_FORM = {
  code: '',
  description: '',
  kind: 'percent' as 'percent' | 'fixed',
  value: '10',
  planIds: [] as string[],
  maxRedemptions: '',
  expiresAt: '',
};

export default function AdminDiscountsPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const codes = useAdminDiscountCodes(isOperator);
  const plans = usePlans();
  const create = useCreateDiscountCode();
  const update = useUpdateDiscountCode();
  const remove = useDeleteDiscountCode();

  const [form, setForm] = useState({ ...EMPTY_FORM });

  // The paid plans a code may be scoped to. Prices come from the live catalogue, so
  // the preview below shows what a customer would really pay today.
  const paidPlans = useMemo(
    () => (plans.data ?? []).filter((plan) => plan.priceMonthly > 0),
    [plans.data],
  );

  /** The offer, applied to today's monthly price of every plan it covers. */
  const preview = useMemo(() => {
    const valueCents = form.kind === 'fixed' ? toCents(form.value) : 0;
    const percent = form.kind === 'percent' ? Math.round(Number(form.value) || 0) : 0;

    return paidPlans
      .filter((plan) => form.planIds.length === 0 || form.planIds.includes(plan.id))
      .map((plan) => {
        const priceCents = Math.round(plan.priceMonthly * 100);
        const off = discountAmountOffCents(
          form.kind === 'percent'
            ? { kind: 'percent', value: percent }
            : { kind: 'fixed', value: valueCents },
          priceCents,
        );
        return { planId: plan.id, name: plan.name, priceCents, off, finalCents: priceCents - off };
      });
  }, [form.kind, form.value, form.planIds, paidPlans]);

  const handleCreate = async () => {
    try {
      const value =
        form.kind === 'percent' ? Math.round(Number(form.value) || 0) : toCents(form.value);
      await create.mutateAsync({
        code: normalizeDiscountCode(form.code),
        description: form.description.trim(),
        kind: form.kind,
        value,
        planIds: form.planIds,
        maxRedemptions: form.maxRedemptions.trim() ? Math.round(Number(form.maxRedemptions)) : null,
        expiresAt: endOfDayIso(form.expiresAt),
      });
      setForm({ ...EMPTY_FORM });
      toast({
        title: 'Descuento creado',
        description: 'Ya se puede usar en el cobro de pago único.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo crear el descuento',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout
      title="Descuentos"
      subtitle={`${(codes.data?.codes ?? []).length} códigos creados`}
      actions={
        <Button
          size="sm"
          variant="outline"
          className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
          onClick={() => codes.refetch()}
          disabled={codes.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Recargar
        </Button>
      }
    >
      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-50">
              <Tag className="h-5 w-5 text-amber-300" aria-hidden="true" />
              Nuevo código
            </CardTitle>
            <CardDescription className="text-slate-400">
              Aplica a <strong>pago único</strong> (tarjeta/Yape/Plin sueltos o transferencia): un
              cobro automático se renovaría con el descuento para siempre. El uso se cuenta al
              confirmarse el pago, nunca al iniciar el cobro. El pago no puede quedar por debajo de{' '}
              {money(100)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-slate-300" htmlFor="discount-code">
                  Código
                </Label>
                <Input
                  id="discount-code"
                  className={inputClass}
                  placeholder="PRO10"
                  value={form.code}
                  data-testid="input-discount-code"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value }))
                  }
                />
                <p className="text-xs text-slate-500">
                  Se guarda como {normalizeDiscountCode(form.code) || '—'} (mayúsculas, sin espacios).
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300" htmlFor="discount-kind">
                  Tipo
                </Label>
                <select
                  id="discount-kind"
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                  value={form.kind}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      kind: event.target.value as 'percent' | 'fixed',
                      value: event.target.value === 'percent' ? '10' : '10.00',
                    }))
                  }
                >
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Monto fijo (S/)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300" htmlFor="discount-value">
                  {form.kind === 'percent' ? 'Porcentaje' : 'Monto en soles'}
                </Label>
                <Input
                  id="discount-value"
                  className={inputClass}
                  inputMode="decimal"
                  data-testid="input-discount-value"
                  value={form.value}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, value: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300" htmlFor="discount-expires">
                  Vence (opcional)
                </Label>
                <Input
                  id="discount-expires"
                  type="date"
                  className={inputClass}
                  value={form.expiresAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, expiresAt: event.target.value }))
                  }
                />
                <p className="text-xs text-slate-500">Vale hasta el final de ese día.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300" htmlFor="discount-max">
                  Usos máximos (vacío = ilimitado)
                </Label>
                <Input
                  id="discount-max"
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="50"
                  value={form.maxRedemptions}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, maxRedemptions: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label className="text-slate-300">Aplica a</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, planIds: [] }))}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      form.planIds.length === 0
                        ? 'border-amber-400 text-amber-300'
                        : 'border-slate-700 text-slate-300'
                    }`}
                  >
                    Todos los planes pagados
                  </button>
                  {paidPlans.map((plan) => {
                    const selected = form.planIds.includes(plan.id);
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            planIds: selected
                              ? current.planIds.filter((id) => id !== plan.id)
                              : [...current.planIds, plan.id],
                          }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected
                            ? 'border-amber-400 text-amber-300'
                            : 'border-slate-700 text-slate-300'
                        }`}
                      >
                        {plan.name} · {money(Math.round(plan.priceMonthly * 100))}/mes
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="discount-description">
                Nota interna (opcional)
              </Label>
              <Textarea
                id="discount-description"
                className={inputClass}
                rows={2}
                placeholder="Campaña de lanzamiento, acordado con el cliente X..."
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
              <p className="text-xs text-slate-500">
                Solo la ve el equipo; el cliente nunca lee esta nota.
              </p>
            </div>

            {preview.length > 0 && (
              <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-300">
                <p className="text-slate-400">Qué pagaría un cliente con este código:</p>
                {preview.map((row) => (
                  <p key={row.planId}>
                    {row.name}: {money(row.priceCents)} → <strong>{money(row.finalCents)}</strong>{' '}
                    {row.off > 0 ? `(ahorra ${money(row.off)})` : ''}
                  </p>
                ))}
              </div>
            )}

            <Button
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              disabled={create.isPending || !normalizeDiscountCode(form.code)}
              data-testid="button-create-discount"
              onClick={() => void handleCreate()}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {create.isPending ? 'Creando...' : 'Crear código'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Códigos</CardTitle>
            <CardDescription className="text-slate-400">
              El uso se cuenta al confirmarse el pago. Un código usado no se puede borrar (los pagos
              que lo usaron lo explican): desactívelo para que nadie más lo use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {codes.isLoading && <p className="text-sm text-slate-400">Cargando códigos...</p>}
            {!codes.isLoading && (codes.data?.codes ?? []).length === 0 && (
              <p className="text-sm text-slate-400">
                Todavía no hay descuentos. No hace falta ninguno para vender.
              </p>
            )}

            {(codes.data?.codes ?? []).map((code) => (
              <div
                key={code.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-100">
                      {code.code}
                    </span>
                    <Badge className="bg-slate-800 text-slate-200">{code.label}</Badge>
                    <Badge className={STATE_BADGES[code.state]}>{STATE_LABELS[code.state]}</Badge>
                    <span className="text-xs text-slate-400">
                      {code.planIds.length === 0 ? 'todos los planes' : code.planIds.join(', ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Usos: {code.redemptionCount}
                    {code.maxRedemptions !== null ? ` / ${code.maxRedemptions}` : ' (sin límite)'} ·
                    vence {fecha(code.expiresAt)} · creado {fechaHora(code.createdAt)}
                    {code.createdByEmail ? ` por ${code.createdByEmail}` : ''}
                  </p>
                  {code.description && (
                    <p className="text-xs text-slate-500">Nota: {code.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                    disabled={update.isPending}
                    data-testid={`button-toggle-discount-${code.code}`}
                    onClick={async () => {
                      try {
                        await update.mutateAsync({
                          id: code.id,
                          changes: { isActive: !code.isActive },
                        });
                        toast({
                          title: code.isActive ? 'Descuento desactivado' : 'Descuento activado',
                          description: code.code,
                        });
                      } catch (error) {
                        toast({
                          title: 'No se pudo cambiar el descuento',
                          description: error instanceof Error ? error.message : 'Error',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    {code.isActive ? 'Desactivar' : 'Activar'}
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Eliminar el código ${code.code}`}
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    disabled={remove.isPending}
                    onClick={async () => {
                      try {
                        await remove.mutateAsync({ id: code.id });
                        toast({ title: 'Descuento eliminado', description: code.code });
                      } catch (error) {
                        toast({
                          title: 'No se pudo eliminar',
                          description: error instanceof Error ? error.message : 'Error',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
