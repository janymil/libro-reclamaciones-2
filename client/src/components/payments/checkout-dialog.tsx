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
import { useBillingProfile, useRucVerification, type BillingProfile } from "@/hooks/use-comprobantes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAYMENT_CURRENCY_SYMBOL,
  PAYMENT_METHODS,
} from "@shared/payments";
import {
  COMPROBANTE_DOC_TYPES,
  validateBilling,
  type BillingData,
  type ComprobanteDocType,
} from "@shared/comprobantes";
import { PRICES_INCLUDE_IGV_NOTE, formatIgvRate, igvBreakdown } from "@shared/tax";
import { companyNamesMatch, isRucActive } from "@shared/ruc";
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

/**
 * The factura/boleta decision, taken BEFORE paying.
 *
 * This ordering is the whole point: a comprobante cannot be re-issued to another
 * RUC afterwards (it would take a nota de crédito), so the buyer identifies the
 * document here, while a typo is still fixable. Prices are already gross, so the
 * choice never changes the amount.
 */
export function BillingFields({
  value,
  profile,
  errors,
  onChange,
}: {
  value: BillingData;
  profile?: BillingProfile;
  errors: string[];
  onChange: (next: BillingData) => void;
}) {
  const doc = COMPROBANTE_DOC_TYPES[value.docType];
  const update = (patch: Partial<BillingData>) => onChange({ ...value, ...patch });

  // Debounced so typing "20131312955" produces one SUNAT lookup, not eleven.
  const [debouncedRuc, setDebouncedRuc] = useState(value.docNumber);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRuc(value.docNumber), 450);
    return () => clearTimeout(timer);
  }, [value.docNumber]);

  const verification = useRucVerification(debouncedRuc, value.docType === "factura");
  const sunat = verification.data?.available ? verification.data : null;
  const nameMatches =
    sunat && value.name.trim() ? companyNamesMatch(value.name, sunat.razonSocial) : null;
  const sunatUsable = sunat ? isRucActive(sunat.estado, sunat.condicion) : true;

  const useSunatData = () => {
    if (!sunat) {
      return;
    }
    update({
      name: sunat.razonSocial,
      address: value.address.trim() || sunat.suggestedAddress,
    });
  };

  const switchType = (next: ComprobanteDocType) => {
    if (next === value.docType) {
      return;
    }
    if (next === "factura") {
      onChange({
        ...value,
        docType: "factura",
        docNumber: profile?.ruc ?? "",
        name: profile?.businessName ?? value.name,
        address: profile?.address ?? value.address,
      });
      return;
    }
    // A boleta is for a person: the company's RUC and razón social do not apply.
    onChange({ ...value, docType: "boleta", docNumber: "", name: "" });
  };

  return (
    <div className="rounded-lg border p-3" data-testid="checkout-billing">
      <p className="text-sm font-medium">Comprobante electrónico</p>
      <p className="mt-0.5 text-xs text-gray-600">
        Elige factura si necesitas sustentar el gasto; boleta si pagas como persona natural.
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(COMPROBANTE_DOC_TYPES) as ComprobanteDocType[]).map((id) => {
          const option = COMPROBANTE_DOC_TYPES[id];
          const selected = value.docType === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchType(id)}
              data-testid={`checkout-doctype-${id}`}
              className={[
                "rounded-lg border p-3 text-left text-sm transition-colors",
                selected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:bg-gray-50",
              ].join(" ")}
            >
              <span className="font-medium">{option.shortLabel}</span>
              <span className="mt-0.5 block text-xs text-gray-600">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="billing-doc" className="text-xs font-medium">
            {doc.requiresRuc ? "RUC" : "DNI (opcional)"}
          </Label>
          <Input
            id="billing-doc"
            inputMode="numeric"
            autoComplete="off"
            maxLength={doc.requiresRuc ? 11 : 8}
            placeholder={doc.requiresRuc ? "20123456789" : "Consumidor final"}
            value={value.docNumber}
            onChange={(event) =>
              update({ docNumber: event.target.value.replace(/\D/g, "") })
            }
            data-testid="checkout-billing-doc"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="billing-email" className="text-xs font-medium">
            Correo para el comprobante
          </Label>
          <Input
            id="billing-email"
            type="email"
            autoComplete="email"
            placeholder="facturacion@empresa.pe"
            value={value.email}
            onChange={(event) => update({ email: event.target.value })}
            data-testid="checkout-billing-email"
            className="mt-1"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="billing-name" className="text-xs font-medium">
            {doc.requiresRuc ? "Razón social" : "Nombres y apellidos (opcional)"}
          </Label>
          <Input
            id="billing-name"
            autoComplete={doc.requiresRuc ? "organization" : "name"}
            placeholder={doc.requiresRuc ? "Mi Empresa S.A.C." : "Consumidor final"}
            value={value.name}
            onChange={(event) => update({ name: event.target.value })}
            data-testid="checkout-billing-name"
            className="mt-1"
          />
        </div>

        {doc.requiresRuc && (
          <div className="sm:col-span-2">
            <Label htmlFor="billing-address" className="text-xs font-medium">
              Domicilio fiscal
            </Label>
            <Input
              id="billing-address"
              autoComplete="street-address"
              placeholder="Av. Ejemplo 123, Lima"
              value={value.address}
              onChange={(event) => update({ address: event.target.value })}
              data-testid="checkout-billing-address"
              className="mt-1"
            />
          </div>
        )}
      </div>

      {doc.requiresRuc && value.docNumber.length === 11 && (
        <div className="mt-2 text-xs" data-testid="ruc-verification">
          {verification.isFetching && <p className="text-gray-500">Verificando RUC en SUNAT…</p>}

          {!verification.isFetching &&
            sunat &&
            (!sunatUsable ? (
              <p className="text-red-600">
                SUNAT: {sunat.estado ?? "—"} / {sunat.condicion ?? "—"}. No se puede emitir
                factura a este RUC.
              </p>
            ) : nameMatches === false ? (
              <div className="text-amber-700">
                <p>
                  La razón social no coincide con SUNAT: <strong>{sunat.razonSocial}</strong>
                </p>
                <button
                  type="button"
                  className="mt-1 underline"
                  onClick={useSunatData}
                  data-testid="button-use-sunat-name"
                >
                  Usar la razón social y el domicilio de SUNAT
                </button>
              </div>
            ) : nameMatches === null ? (
              <div className="text-gray-600">
                <p>
                  SUNAT: {sunat.razonSocial} · {sunat.condicion ?? sunat.estado ?? "verificado"}
                </p>
                <button
                  type="button"
                  className="mt-1 underline"
                  onClick={useSunatData}
                  data-testid="button-use-sunat-name"
                >
                  Usar la razón social y el domicilio de SUNAT
                </button>
              </div>
            ) : (
              <p className="text-green-700">
                SUNAT: {sunat.razonSocial} · {sunat.condicion ?? sunat.estado ?? "verificado"}
              </p>
            ))}

          {!verification.isFetching &&
            !sunat &&
            verification.data &&
            !verification.data.available && (
              <p
                className={
                  verification.data.code === "ruc_not_found" ? "text-red-600" : "text-gray-500"
                }
              >
                {verification.data.message}
              </p>
            )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-600" data-testid="checkout-billing-errors">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-gray-500">
        El comprobante se emite a estos datos y no puede cambiarse después del pago. Se envía a su
        correo dentro de los 3 días hábiles. Si algo está mal, corrígelo ahora.
      </p>
    </div>
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
  const billingProfile = useBillingProfile(open);

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  // The buyer snapshot. Pre-filled from the company profile, then editable:
  // paying with a personal card may well need a boleta instead of a factura.
  const [billing, setBilling] = useState<BillingData>({
    docType: "factura",
    docNumber: "",
    name: "",
    address: "",
    email: "",
  });
  const [billingTouched, setBillingTouched] = useState(false);
  const [billingErrors, setBillingErrors] = useState<string[]>([]);
  // A provider with a recurring rail can also sell just one period, which is the
  // only way to pay with Yape, Plin or cash (and does not require logging into a
  // Mercado Pago account). `true` = one-time Checkout Pro by default.
  const [oneTime, setOneTime] = useState(true);
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
      setOneTime(true);
      setCode('');
      setApplied(null);
      setCodeError(null);
      setBillingTouched(false);
      setBillingErrors([]);
    }
  }, [open]);

  // Prefill once the profile arrives, unless the customer already typed.
  useEffect(() => {
    if (!open || billingTouched || !billingProfile.data) {
      return;
    }
    const profile = billingProfile.data;
    setBilling({
      docType: profile.docType,
      docNumber: profile.docNumber,
      name: profile.name,
      address: profile.address,
      email: profile.email,
    });
  }, [open, billingTouched, billingProfile.data]);

  const price = plan ? (period === 'annual' ? plan.priceAnnual : plan.priceMonthly) : 0;
  const periodLabel = period === 'annual' ? 'anual (ahorra ~50% vs mensual)' : 'mensual';

  const selected = options.find((option) => option.id === selectedProvider);
  // A recurring provider charges again every period by itself; the others are
  // paid one period at a time. The customer can turn a recurring provider into a
  // single payment, because Yape, Plin and cash cannot be charged again.
  const recurring = selected?.supportsRecurring === true && !oneTime;

  /** What the customer pays: the catalogue price, or the discounted one. */
  const payable = applied && !recurring ? applied.finalAmountCents / 100 : price;

  /**
   * The anatomy of the amount: prices are gross, so the base and the IGV are
   * derived (never added on top). Shown next to the buyer fields so a business
   * customer can see exactly what the factura will say.
   */
  const breakdown = igvBreakdown(Math.round(payable * 100));

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

    // Validated before anything is charged: a wrong RUC or a missing mailbox
    // would otherwise surface only when the factura cannot be issued.
    const errors = validateBilling(billing);
    if (errors.length > 0) {
      setBillingErrors(errors);
      toast({
        title: "Revise los datos del comprobante",
        description: errors[0],
        variant: "destructive",
      });
      return;
    }
    setBillingErrors([]);

    try {
      const response = await checkout.mutateAsync({
        plan: plan.id,
        period,
        provider: selectedProvider,
        mode: recurring ? 'auto' : 'one_time',
        // Only a single period can carry a discount; the server re-validates it.
        discountCode: applied && !recurring ? applied.code : undefined,
        billing,
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

            <BillingFields
              value={billing}
              profile={billingProfile.data}
              errors={billingErrors}
              onChange={(next) => {
                setBilling(next);
                setBillingTouched(true);
                if (billingErrors.length > 0) {
                  setBillingErrors(validateBilling(next));
                }
              }}
            />

            <div
              className="rounded-lg border bg-gray-50 p-3 text-sm"
              data-testid="checkout-igv-breakdown"
            >
              <div className="flex justify-between text-gray-700">
                <span>Valor de venta</span>
                <span>{PAYMENT_CURRENCY_SYMBOL} {(breakdown.subtotalCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>IGV ({formatIgvRate(breakdown.rateBps)})</span>
                <span>{PAYMENT_CURRENCY_SYMBOL} {(breakdown.igvCents / 100).toFixed(2)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold text-gray-900">
                <span>Total</span>
                <span>{PAYMENT_CURRENCY_SYMBOL} {(breakdown.totalCents / 100).toFixed(2)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {PRICES_INCLUDE_IGV_NOTE} El comprobante que elijas no cambia el total.
              </p>
            </div>

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
