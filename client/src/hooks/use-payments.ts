import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PaymentProviderDefinition } from "@shared/payments";

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

/** Starts a checkout. The caller decides whether to redirect or show instructions. */
export function useStartCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      plan: string;
      period: 'monthly' | 'annual';
      provider: string;
    }) => {
      const response = await apiRequest('POST', '/api/payments/checkout', input);
      return response.json() as Promise<CheckoutResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
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
    },
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
