import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { TRIAL_DAYS, type PlanDefinition } from "@shared/plans";

/**
 * Plans & quotas (Phase 2.6), integrations (Phase 3.12) and the multi-RUC
 * switcher (Phase 2.7) hooks.
 */

export interface SubscriptionUsage {
  complaintsThisMonth: number;
  /** Lifetime complaints (the Gratis quota is a total, not monthly). */
  complaintsTotal: number;
  users: number;
  establishments: number;
  businesses: number;
}

export interface SubscriptionInfo {
  plan: PlanDefinition;
  storedPlanId: string;
  status: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  planPeriod: string;
  currentPeriodEnd: string | null;
  usage: SubscriptionUsage;
}

export function usePlans() {
  return useQuery({
    queryKey: ['/api/plans'],
    queryFn: async () => {
      const response = await fetch('/api/plans');
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      return response.json() as Promise<PlanDefinition[]>;
    },
    staleTime: Infinity,
  });
}

/** Who the platform is and how long the trial lasts (public, no auth needed). */
export interface PlatformInfo {
  identity: {
    legalName: string;
    commercialName: string;
    ruc: string;
    fiscalAddress: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
  };
  trialDays: number;
}

/**
 * The public platform facts.
 *
 * Used by the marketing copy ("15 días de prueba"), the page footer and anywhere the
 * platform names itself: all of it used to be hardcoded, so changing the identity meant
 * a deploy. `staleTime` is long because these change a few times a year.
 */
export function usePlatformInfo() {
  return useQuery({
    queryKey: ['/api/platform-info'],
    queryFn: async () => {
      const response = await fetch('/api/platform-info');
      if (!response.ok) {
        throw new Error('Failed to fetch the platform info');
      }
      return response.json() as Promise<PlatformInfo>;
    },
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * The trial length to print, with a safe fallback.
 *
 * Never renders "undefined días": while the request is in flight (or if it fails) the
 * built-in default from `shared/plans.ts` is used, which is exactly what the server
 * applies when nobody overrode it.
 */
export function useTrialDays(): number {
  const info = usePlatformInfo();
  return info.data?.trialDays ?? TRIAL_DAYS;
}

export function useSubscription() {
  return useQuery({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const response = await fetch('/api/subscription', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }
      return response.json() as Promise<SubscriptionInfo>;
    },
  });
}

// The old "change the plan for free" mutation is gone: a plan is now activated
// by a confirmed payment (see use-payments.ts → useStartCheckout).

// ---- Multi-RUC switcher (Phase 2.7) ------------------------------------------

export interface UserBusiness {
  businessId: string;
  businessName: string;
  ruc: string;
  role: string;
  isActive: boolean;
}

export function useUserBusinesses() {
  return useQuery({
    queryKey: ['/api/auth/businesses'],
    queryFn: async () => {
      const response = await fetch('/api/auth/businesses', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch businesses');
      }
      return response.json() as Promise<UserBusiness[]>;
    },
  });
}

// ---- Integrations (Phase 3.12) -------------------------------------------------

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  fullKey?: string; // only present right after creation
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['/api/api-keys'],
    queryFn: async () => {
      const response = await fetch('/api/api-keys', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      return response.json() as Promise<ApiKeyInfo[]>;
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', '/api/api-keys', { name });
      return response.json() as Promise<ApiKeyInfo>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/api-keys'] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/api-keys'] });
    },
  });
}

/** Issues a new secret for an existing key; the old one stops working at once. */
export function useRotateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/api-keys/${id}/rotate`, {});
      return response.json() as Promise<ApiKeyInfo>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/api-keys'] });
    },
  });
}

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  includeConsumerData: boolean;
  isActive: boolean;
  createdAt: string;
  secret?: string; // only present right after creation
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['/api/webhooks'],
    queryFn: async () => {
      const response = await fetch('/api/webhooks', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch webhooks');
      }
      return response.json() as Promise<WebhookInfo[]>;
    },
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      url,
      events,
      includeConsumerData,
    }: {
      url: string;
      events?: string[];
      includeConsumerData?: boolean;
    }) => {
      const response = await apiRequest('POST', '/api/webhooks', { url, events, includeConsumerData });
      return response.json() as Promise<WebhookInfo>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
    },
  });
}

export interface WebhookDeliveryInfo {
  id: string;
  webhookId: string;
  complaintId: string;
  event: string;
  status: 'pending' | 'sending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  url: string;
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      url?: string;
      events?: string[];
      includeConsumerData?: boolean;
      isActive?: boolean;
    }) => {
      const response = await apiRequest('PATCH', `/api/webhooks/${id}`, data);
      return response.json() as Promise<WebhookInfo>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks/deliveries'] });
    },
  });
}

/** Issues a new signing secret; the previous one stops validating at once. */
export function useRotateWebhookSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/webhooks/${id}/rotate-secret`, {});
      return response.json() as Promise<{ id: string; secret: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks'] });
    },
  });
}

export function useWebhookDeliveries(limit = 25) {
  return useQuery({
    queryKey: ['/api/webhooks/deliveries', limit],
    queryFn: async () => {
      const response = await fetch(`/api/webhooks/deliveries?limit=${limit}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch webhook deliveries');
      }
      return response.json() as Promise<WebhookDeliveryInfo[]>;
    },
  });
}

export function useRetryWebhookDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/webhooks/deliveries/${id}/retry`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/webhooks/deliveries'] });
    },
  });
}

export interface WidgetSnippet {
  slug: string;
  embedUrl: string;
  scriptUrl: string;
  snippet: string;
}

export function useWidgetSnippet() {
  return useQuery({
    queryKey: ['/api/integrations/widget'],
    queryFn: async () => {
      const response = await fetch('/api/integrations/widget', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch widget snippet');
      }
      return response.json() as Promise<WidgetSnippet>;
    },
  });
}
