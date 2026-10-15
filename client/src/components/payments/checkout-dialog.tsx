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
  usePaymentProviders,
  useStartCheckout,
  type CheckoutResponse,
  type PaymentProviderOption,
} from "@/hooks/use-payments";
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
}: {
  provider: PaymentProviderOption;
  selected: boolean;
  onSelect: () => void;
}) {
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
        {provider.methods.map((method) => (
          <span
            key={method}
            className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
          >
            <span className="material-icons text-[14px] leading-none">{PAYMENT_METHODS[method].icon}</span>
            {PAYMENT_METHODS[method].name}
          </span>
        ))}
      </div>

      {provider.supportsRecurring && (
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

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
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
    }
  }, [open]);

  const price = plan ? (period === 'annual' ? plan.priceAnnual : plan.priceMonthly) : 0;
  const periodLabel = period === 'annual' ? 'anual (ahorra ~50% vs mensual)' : 'mensual';

  const selected = options.find((option) => option.id === selectedProvider);
  // A recurring provider charges again every period by itself; the others are
  // paid one period at a time.
  const recurring = selected?.supportsRecurring === true;

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

            {options.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                selected={selectedProvider === provider.id}
                onSelect={() => setSelectedProvider(provider.id)}
              />
            ))}

            {!providers.isLoading && options.length === 0 && (
              <p className="text-sm text-gray-500">
                No hay métodos de pago disponibles. Contacte a soporte.
              </p>
            )}

            <p className="text-xs text-gray-500">
              {recurring
                ? "Autorizará un cobro automático cada periodo y podrá cancelarlo desde «Pagos» cuando quiera. El plan se activa cuando el primer cobro queda confirmado; si está en la prueba gratuita, conserva los días restantes."
                : "El plan se activa solo cuando el pago queda confirmado. Si paga durante la prueba gratuita, conserva los días restantes."}
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
                  : `Pagar ${PAYMENT_CURRENCY_SYMBOL} ${price}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
