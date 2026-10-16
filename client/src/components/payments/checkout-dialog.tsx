import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useDiscountPreview,
  usePaymentProviders,
  useStartCheckout,
  type PaymentProviderOption,
} from "@/hooks/use-payments";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAYMENT_CURRENCY_SYMBOL,
  PAYMENT_METHODS,
} from "@shared/payments";
import type { PlanDefinition } from "@shared/plans";

/**
 * Checkout (Phase 2.7).
 *
 * Two very different outcomes, one dialog:
 *   * an online PSP answers with a `redirectUrl` - we send the browser there,
 *     and the plan activates from the webhook when the money arrives;
 *   * an offline provider answers with `instructions` - the customer transfers
 *     or Yapes, and an administrator confirms it in "Pagos".
 */

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDefinition | null;
  period: 'monthly' | 'annual';
  /** Called after a payment is started, so the page can refresh. */
  onStarted?: () => void;
}

function ProviderCard({
  provider,
  selected,
  onSelect,
  recurring,
}: {
  provider: PaymentProviderOption;
  selected: boolean;
  onSelect: () => void;
  /** True when this card is being sold as a subscription rather than a single period. */
  recurring: boolean;
}) {
  // A recurring charge needs a card on file: Yape, Plin and cash cannot be
  // charged again by themselves, so they are not offered in that mode. This is
  // Mercado Pago's own checkout behaviour, confirmed against the live API.
  const methods = recurring
    ? provider.methods.filter((method) => method === "tarjeta")
    : provider.methods;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!provider.configured}
      data-testid={`payment-provider-${provider.id}`}
      className={[
        "w-full rounded-lg border p-4 text-left transition-colors",
        selected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-gray-50",
        !provider.configured ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{provider.name}</span>
        {selected && <Badge className="btn-primary">Seleccionado</Badge>}
      </div>
      <p className="mt-1 text-sm text-gray-600">{provider.tagline}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {methods.map((method) => (
          <span
            key={method}
            className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
          >
            <span className="material-icons text-[14px] leading-none">{PAYMENT_METHODS[method].icon}</span>
            {PAYMENT_METHODS[method].name}
          </span>
        ))}
      </div>

      {recurring && (
        <p className="mt-2 inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-800">
          <span className="material-icons text-[14px] leading-none">autorenew</span>
          Se renueva solo cada mes o año
        </p>
      )}

      {!provider.configured && (
        <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
          Todavía no está activado en el servidor. Falta configurar
          {provider.envKeys.length > 0 ? ` (${provider.envKeys.join(", ")})` : ""}. Puede usar
          transferencia directa mientras tanto.
        </p>
      )}
    </button>
  );
}

export default function CheckoutDialog({
  open,
  onOpenChange,
  plan,
  period,
  onStarted,
}: CheckoutDialogProps) {
  const { toast } = useToast();
  const providers = usePaymentProviders();
  const checkout = useStartCheckout();
  const discountPreview = useDiscountPreview();

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  // A provider with a recurring rail can also sell just one period, which is the
  // only way to pay with Yape, Plin or cash. `false` = charge automatically.
  const [oneTime, setOneTime] = useState(false);
  // A promo code only makes sense on a single period: a recurring charge at a
  // discounted amount would follow the customer forever.
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{
    code: string;
    label: string;
    finalAmountCents: number;
    amountOffCents: number;
  } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  // Only the offline path needs a panel here: everything else leaves the page
  // for the provider's checkout.
  const [offline, setOffline] = useState<{ reference: string; instructions?: string } | null>(null);

  const options = providers.data?.providers ?? [];

  // Preselect the first provider that actually works, so the common case is a
  // single click.
  useEffect(() => {
    if (!open) {
      return;
    }
    const current = options.find((option) => option.id === selectedProvider && option.configured);
    if (current) {
      return;
    }
    setSelectedProvider(options.find((option) => option.configured)?.id ?? null);
  }, [open, options, selectedProvider]);

  // A new opening must not show the previous attempt's instructions.
  useEffect(() => {
    if (open) {
      setOffline(null);
      setOneTime(false);
      setCode('');
      setApplied(null);
      setCodeError(null);
    }
  }, [open]);

  const price = plan ? (period === 'annual' ? plan.priceAnnual : plan.priceMonthly) : 0;
  const periodLabel = period === 'annual' ? 'anual (ahorra ~50% vs mensual)' : 'mensual';

  const selected = options.find((option) => option.id === selectedProvider);
  // A recurring provider charges again every period by itself; the others are
  // paid one period at a time. The customer can turn a recurring provider into a
  // single payment, because Yape, Plin and cash cannot be charged again.
  const recurring = selected?.supportsRecurring === true && !oneTime;

  /** What the customer pays: the catalogue price, or the discounted one. */
  const payable = applied && !recurring ? applied.finalAmountCents / 100 : price;

  /** Asks the server what the typed code is worth (never trust the browser). */
  const handleApplyCode = async () => {
    if (!plan || !code.trim()) {
      return;
    }
    setCodeError(null);
    try {
      const result = await discountPreview.mutateAsync({
        plan: plan.id,
        period,
        code: code.trim(),
      });
      if (!result.ok) {
        setApplied(null);
        setCodeError(result.reason ?? 'Ese código no es válido.');
        return;
      }
      setApplied({
        code: code.trim().toUpperCase(),
        label: result.label,
        finalAmountCents: result.finalAmountCents,
        amountOffCents: result.amountOffCents,
      });
    } catch (error) {
      setApplied(null);
      setCodeError(error instanceof Error ? error.message.replace(/^\d{3}:\s*/, '') : 'Error');
    }
  };

  const handleClose = (next: boolean) => {
    if (checkout.isPending) {
      return;
    }
    onOpenChange(next);
  };

  const handleStart = async () => {
    if (!plan || !selectedProvider) {
      return;
    }

    try {
      const response = await checkout.mutateAsync({
        plan: plan.id,
        period,
        provider: selectedProvider,
        mode: recurring ? 'auto' : 'one_time',
        // Only a single period can carry a discount; the server re-validates it.
        discountCode: applied && !recurring ? applied.code : undefined,
      });
      onStarted?.();

      // Both modes send the customer to the provider - a subscription to
      // authorise the recurring charge, a card/Yape payment to pay. Only the
      // offline provider has nothing to redirect to.
      if (response.redirectUrl) {
        toast({
          title: response.mode === 'subscription'
            ? "Autorice su suscripción"
            : "Le llevamos a la pasarela de pago",
          description: response.mode === 'subscription'
            ? "Al confirmar, se cobrará automáticamente cada periodo. Puede cancelar cuando quiera."
            : "No cierre la ventana hasta terminar el pago.",
        });
        window.location.assign(response.redirectUrl);
        return;
      }

      const reference = 'payment' in response ? response.payment.reference : '';
      setOffline({ reference, instructions: 'instructions' in response ? response.instructions : undefined });
      toast({
        title: "Pago registrado",
        description: `La referencia ${reference} quedó pendiente de confirmación.`,
      });
    } catch (error) {
      toast({
        title: "No se pudo iniciar el pago",
        // apiRequest prefixes errors with "500: "; strip it for the customer.
        description: error instanceof Error
          ? error.message.replace(/^\d{3}:\s*/, "")
          : "Intente nuevamente en unos minutos.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="checkout-dialog">
        <DialogHeader>
          <DialogTitle>
            {recurring ? `Suscribirse al plan ${plan?.name ?? ''}` : `Pagar el plan ${plan?.name ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            Periodo {periodLabel} · {PAYMENT_CURRENCY_SYMBOL} {price}
            {recurring && ' · se cobra automáticamente y puede cancelar cuando quiera'}
          </DialogDescription>
        </DialogHeader>

        {offline ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">Pago en espera de confirmación</p>
              <p className="mt-1 text-sm text-amber-900">
                Referencia{' '}
                <span className="font-mono font-semibold">{offline.reference}</span>. Guárdela:
                es lo que identifica su pago.
              </p>
            </div>

            <pre className="whitespace-pre-wrap rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
              {offline.instructions}
            </pre>

            <p className="text-sm text-gray-600">
              Cuando el depósito llegue, un administrador confirmará el pago en «Pagos» y su plan
              quedará activo automáticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.isLoading && (
              <p className="text-sm text-gray-500">Cargando métodos de pago...</p>
            )}

            {selected?.supportsRecurring && (
              <div className="rounded-lg border p-3" data-testid="checkout-mode">
                <p className="text-sm font-medium">¿Cómo quiere pagar?</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOneTime(false)}
                    data-testid="checkout-mode-recurring"
                    className={[
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      !oneTime
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <span className="font-medium">Cobro automático</span>
                    <span className="mt-0.5 block text-xs text-gray-600">
                      Con tarjeta. Se renueva solo y puede cancelar cuando quiera.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOneTime(true)}
                    data-testid="checkout-mode-one-time"
                    className={[
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      oneTime
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <span className="font-medium">Pago único</span>
                    <span className="mt-0.5 block text-xs text-gray-600">
                      Tarjeta, Yape, Plin o efectivo. Usted lo renueva cada periodo.
                    </span>
                  </button>
                </div>
              </div>
            )}

            {options.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                selected={selectedProvider === provider.id}
                onSelect={() => setSelectedProvider(provider.id)}
                recurring={provider.supportsRecurring && !(oneTime && selectedProvider === provider.id)}
              />
            ))}

            {!providers.isLoading && options.length === 0 && (
              <p className="text-sm text-gray-500">
                No hay métodos de pago disponibles. Contacte a soporte.
              </p>
            )}

            {/* A promo code is only offered for a single period: a recurring charge at a
                discounted amount would follow the customer forever. */}
            {!recurring && selectedProvider && (
              <div className="rounded-lg border p-3" data-testid="checkout-discount">
                <Label className="text-sm font-medium" htmlFor="checkout-discount-code">
                  ¿Tiene un código de descuento?
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    id="checkout-discount-code"
                    className="max-w-[12rem]"
                    placeholder="PRO10"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value);
                      setCodeError(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!code.trim() || discountPreview.isPending}
                    data-testid="button-apply-discount"
                    onClick={() => void handleApplyCode()}
                  >
                    {discountPreview.isPending ? 'Comprobando...' : 'Aplicar'}
                  </Button>
                </div>

                {codeError && (
                  <p className="mt-2 text-xs text-red-600" data-testid="checkout-discount-error">
                    {codeError}
                  </p>
                )}

                {applied && (
                  <p className="mt-2 text-xs text-green-700" data-testid="checkout-discount-applied">
                    {applied.code} aplicado ({applied.label}): paga{' '}
                    <strong>
                      {PAYMENT_CURRENCY_SYMBOL} {(applied.finalAmountCents / 100).toFixed(2)}
                    </strong>{' '}
                    en vez de {PAYMENT_CURRENCY_SYMBOL} {price.toFixed(2)}.
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">
              {recurring
                ? "Autorizará un cobro automático cada periodo y podrá cancelarlo desde «Pagos» cuando quiera. El plan se activa cuando el primer cobro queda confirmado; si está en la prueba gratuita, conserva los días restantes."
                : "El plan se activa solo cuando el pago queda confirmado. Si paga durante la prueba gratuita, conserva los días restantes."}{' '}
              Si ya tenía un cobro automático de otro plan o del mismo plan en otro periodo, se
              cancela al iniciar este pago: nunca se le cobra dos veces.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={checkout.isPending}>
            {offline ? 'Cerrar' : 'Cancelar'}
          </Button>

          {!offline && (
            <Button
              onClick={handleStart}
              disabled={!plan || !selectedProvider || checkout.isPending}
              data-testid="button-start-checkout"
            >
              {checkout.isPending
                ? 'Iniciando...'
                : recurring
                  ? `Suscribirme · ${PAYMENT_CURRENCY_SYMBOL} ${price} /${period === 'annual' ? 'año' : 'mes'}`
                  : `Pagar ${PAYMENT_CURRENCY_SYMBOL} ${payable.toFixed(2)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
