import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PlanDefinition } from "@shared/plans";

/**
 * Plans & quotas (Phase 2.6), integrations (Phase 3.12) and the multi-RUC
 * switcher (Phase 2.7) hooks.
 */

export interface SubscriptionUsage {
  complaintsThisMonth: number;
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

export function useChangePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ plan, period }: { plan: string; period: 'monthly' | 'annual' }) => {
      const response = await apiRequest('POST', '/api/subscription', { plan, period });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
    },
  });
}

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

export interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
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
    mutationFn: async ({ url, events }: { url: string; events?: string[] }) => {
      const response = await apiRequest('POST', '/api/webhooks', { url, events });
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
