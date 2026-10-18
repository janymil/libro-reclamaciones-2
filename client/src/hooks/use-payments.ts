import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PaymentProviderDefinition } from "@shared/payments";
import type { BillingData } from "@shared/comprobantes";

/**
 * Payments (Phase 2.7) hooks.
 *
 * The server decides what is possible; these hooks only carry the answer to the
 * screen. Note `configured`: a provider can be listed but have no credentials,
 * in which case the UI explains what is missing instead of failing at the end.
 */

export interface PaymentProviderOption extends PaymentProviderDefinition {
  configured: boolean;
}

export interface PaymentProvidersResponse {
  currency: string;
  providers: PaymentProviderOption[];
}

export interface PaymentRecord {
  id: string;
  reference: string;
  provider: string;
  method: string | null;
  planId: string;
  period: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  redirectUrl: string | null;
  failureReason: string | null;
  /** When the "finish your payment" email first went out (automatic or manual). */
  recoveryEmailSentAt?: string | null;
  /** How many times it went out, so the console does not resend blindly. */
  recoveryEmailCount?: number;
  paidAt: string | null;
  createdAt: string;
}

/**
 * A recurring agreement with the provider (Mercado Pago "Suscripciones").
 *
 * This is the SaaS shape: the customer authorises one charge and the provider
 * repeats it every period, so the plan keeps itself alive.
 */
export interface AgreementRecord {
  id: string;
  reference: string;
  provider: string;
  planId: string;
  period: string;
  amountCents: number;
  currency: string;
  status: string;
  statusLabel: string;
  isLive: boolean;
  nextPaymentAt: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  initPoint: string | null;
  createdAt: string;
}

export type CheckoutResponse =
  | { mode: 'subscription'; redirectUrl: string; subscription: AgreementRecord }
  | { mode: 'payment'; redirectUrl: string | null; instructions?: string; payment: PaymentRecord };

export function usePaymentProviders() {
  return useQuery({
    queryKey: ['/api/payments/providers'],
    queryFn: async () => {
      const response = await fetch('/api/payments/providers', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch payment providers');
      }
      return response.json() as Promise<PaymentProvidersResponse>;
    },
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ['/api/payments'],
    queryFn: async () => {
      const response = await fetch('/api/payments', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch payments');
      }
      return response.json() as Promise<PaymentRecord[]>;
    },
  });
}

/**
 * Operator queue (LibroDigital team only - the API answers 403 to anyone else):
 * every customer's transfer/Yape that still waits for a human to confirm it.
 *
 * The money arrives in the operator's own Yape/bank account, so this list is the
 * only place where the team can see what has to be reconciled.
 */
export interface PendingManualPayment {
  payment: PaymentRecord;
  businessId: string | null;
  businessName: string | null;
}

export function usePendingManualPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/payments/pending-manual'],
    enabled,
    queryFn: async () => {
      const response = await fetch('/api/payments/pending-manual', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch pending manual payments');
      }
      return response.json() as Promise<PendingManualPayment[]>;
    },
  });
}

/** Starts a checkout. The caller decides whether to redirect or show instructions. */
export function useStartCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      plan: string;
      period: 'monthly' | 'annual';
      provider: string;
      /**
       * `one_time` buys a single period on a provider that could also renew
       * automatically - the only way to pay with Yape, Plin or cash, because a
       * recurring charge needs a card on file. `auto` (the default) renews.
       */
      mode?: 'auto' | 'one_time';
      /**
       * Promo code, only ever sent for a single period: a recurring charge at a
       * discounted amount would follow the customer forever. The server re-validates
       * it against the price it is about to charge.
       */
      discountCode?: string;
      /** To whom the factura/boleta is issued; validated on the server. */
      billing?: BillingData;
    }) => {
      const response = await apiRequest('POST', '/api/payments/checkout', input);
      return response.json() as Promise<CheckoutResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
    },
  });
}

export interface DiscountPreview {
  ok: boolean;
  reason: string | null;
  label: string;
  listAmountCents: number;
  amountOffCents: number;
  finalAmountCents: number;
}

/**
 * Asks the server what a promo code would do to this plan.
 *
 * A courtesy, not a contract: the checkout re-validates the code against the price it
 * is about to charge. It exists so the customer sees "con PRO10 pagas S/ 26.10" before
 * being sent to a payment page, instead of discovering the discount there.
 */
export function useDiscountPreview() {
  return useMutation({
    mutationFn: async (input: { plan: string; period: string; code: string }) => {
      const response = await apiRequest('POST', '/api/payments/discount', input);
      return response.json() as Promise<DiscountPreview>;
    },
  });
}

/** Re-checks a pending payment after the customer returns from the PSP page. */
export function useRefreshPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest('POST', `/api/payments/${paymentId}/refresh`);
      return response.json() as Promise<{ payment: PaymentRecord | null }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      // A confirmed payment moves the plan, so the subscription view is stale.
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
    },
  });
}

/** Admin action: a bank transfer / Yape deposit was received. */
export function useConfirmPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest('POST', `/api/payments/${paymentId}/confirm`);
      return response.json() as Promise<{ message: string; payment: PaymentRecord }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      // A confirmed transfer leaves the operator's queue.
      queryClient.invalidateQueries({ queryKey: ['/api/payments/pending-manual'] });
    },
  });
}

/** Everything an operator action can move: the ledger, the plan and the queues. */
function invalidatePaymentViews(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    '/api/payments',
    '/api/payments/pending-manual',
    '/api/payments/subscription',
    '/api/subscription',
    '/api/admin/payments',
    '/api/admin/overview',
    '/api/admin/customers',
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Operator: email the customer a way to finish an unpaid order.
 *
 * The server sends the same message the webhook sends automatically: the checkout
 * link they already used, our own page as a fallback, and the transfer/Yape data
 * for the same reference.
 */
export function useSendPaymentLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiRequest('POST', `/api/payments/${paymentId}/payment-link`);
      return response.json() as Promise<{ message: string; sentTo: string; payment: PaymentRecord }>;
    },
    onSuccess: () => invalidatePaymentViews(queryClient),
  });
}

/**
 * Operator: the customer paid a pending order by transfer / Yape instead.
 *
 * Confirming the existing row is what PAIRS the deposit with the order they quote,
 * so the ledger keeps where the order started and how the money arrived.
 */
export function useConfirmOfflinePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { paymentId: string; method: string; note?: string }) => {
      const response = await apiRequest('POST', `/api/payments/${input.paymentId}/confirm-offline`, {
        method: input.method,
        note: input.note ?? null,
      });
      return response.json() as Promise<{ message: string; payment: PaymentRecord }>;
    },
    onSuccess: () => invalidatePaymentViews(queryClient),
  });
}

/**
 * Operator: record a payment that has no order behind it and apply the plan.
 *
 * Used when the customer paid "por fuera" and no checkout was ever finished; the
 * row it creates is what makes the plan change explainable later.
 */
export function useRegisterManualPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      businessId: string;
      planId: string;
      period: string;
      method: string;
      /** Céntimos. Omitted = the console's price for the plan. */
      amountCents?: number;
      note?: string;
    }) => {
      const response = await apiRequest('POST', '/api/payments/manual', input);
      return response.json() as Promise<{ message: string; payment: PaymentRecord }>;
    },
    onSuccess: () => invalidatePaymentViews(queryClient),
  });
}

// ---- Recurring agreement (Phase 2.7, step 2) --------------------------------

export function useAgreement() {
  return useQuery({
    queryKey: ['/api/payments/subscription'],
    queryFn: async () => {
      const response = await fetch('/api/payments/subscription', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch the subscription');
      }
      const body = (await response.json()) as { subscription: AgreementRecord | null };
      return body.subscription;
    },
  });
}

/** Re-reads the agreement from the provider (used right after authorising it). */
export function useRefreshAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/payments/subscription/refresh');
      const body = (await response.json()) as { subscription: AgreementRecord | null };
      return body.subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
    },
  });
}

/** Stops future charges. The current paid period still runs to its end. */
export function useCancelAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/payments/subscription/cancel');
      return response.json() as Promise<{ message: string; subscription: AgreementRecord }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
    },
  });
}
