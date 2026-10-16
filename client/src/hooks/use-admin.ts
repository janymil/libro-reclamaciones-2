import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiErrorMessage } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import type { PaymentCollectionDetails } from '@shared/payment-details';

/**
 * Platform panel hooks (operator-only).
 *
 * Every endpoint answers 403 to a customer, so these are only mounted when
 * `user.isPlatformAdmin` is true - the server is what actually enforces it.
 */

/** True when the signed-in login is platform staff (drives every console query). */
export function useIsOperator(): boolean {
  const { user } = useAuth();
  return Boolean(user?.isPlatformAdmin);
}

export interface AdminOverview {
  customers: number;
  activeCustomers: number;
  logins: number;
  operators: number;
  byPlan: Record<string, number>;
  trialsEndingThisWeek: number;
  paidThisMonthCents: number;
  collectedTotalCents: number;
  pendingTransfers: number;
}

export interface AdminCustomerLogin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isDemo: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminCustomer {
  business: {
    id: string;
    ruc: string;
    businessName: string;
    commercialName: string | null;
    subscriptionPlan: string;
    subscriptionStatus: string;
    planPeriod: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    isActive: boolean;
    createdAt: string;
    establishmentCount: number;
    userCount: number;
  };
  logins: AdminCustomerLogin[];
  paymentCount: number;
  paidCents: number;
  pendingCents: number;
}

export interface AdminPaymentRow {
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
  paidAt: string | null;
  createdAt: string;
  /** Promo code used, when the amount is below the list price. */
  discountCode: string | null;
  discountCents: number;
  businessId: string | null;
  businessName: string | null;
  ruc: string | null;
}

export interface AdminOperator {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminOperatorsResponse {
  operators: AdminOperator[];
  candidates: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isDemo: boolean;
    businessName: string | null;
  }[];
}

/**
 * The platform's own collection details (Configuración).
 *
 * `settings` is already normalized by the server (trimmed, incomplete bank rows
 * dropped), so the form can bind to it directly and the preview can be built with
 * `buildTransferInstructions` - the same function the checkout uses, which is what
 * makes the preview trustworthy.
 */
export interface AdminPaymentSettingsResponse {
  settings: PaymentCollectionDetails;
  /** True when a customer could actually pay with these details. */
  hasDetails: boolean;
  /** True once an operator has saved the record at least once. */
  saved: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  /** True when `PAYMENTS_MANUAL_INSTRUCTIONS` still carries a text to fall back on. */
  envFallbackConfigured: boolean;
}


async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    // `apiErrorMessage` expects the shape `apiRequest` throws: "404: {json}".
    throw new Error(
      apiErrorMessage(new Error(`${response.status}: ${await response.text()}`)),
    );
  }
  return response.json() as Promise<T>;
}

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/overview'],
    enabled,
    queryFn: () => getJson<AdminOverview>('/api/admin/overview'),
  });
}

export function useAdminCustomers(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/customers'],
    enabled,
    queryFn: () => getJson<AdminCustomer[]>('/api/admin/customers'),
  });
}

export function useAdminPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/payments'],
    enabled,
    queryFn: () => getJson<AdminPaymentRow[]>('/api/admin/payments'),
  });
}

export interface AdminSubscriptionRow {
  id: string;
  reference: string;
  provider: string;
  planId: string;
  period: string;
  status: string;
  nextPaymentAt: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  businessId: string | null;
  businessName: string | null;
  ruc: string | null;
}

/** Recurring billing: where a failed preapproval has to be spotted. */
export function useAdminSubscriptions(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/subscriptions'],
    enabled,
    queryFn: () => getJson<AdminSubscriptionRow[]>('/api/admin/subscriptions'),
  });
}

export interface AdminPlatformCheck {
  id: string;
  label: string;
  detail: string | null;
  ok: boolean;
  hint: string;
}

export interface AdminPlatformResponse {
  adminPath: string;
  checks: AdminPlatformCheck[];
  totals: {
    customers: number;
    logins: number;
    operators: number;
    paidPayments: number;
    collectedTotalCents: number;
    pendingTransfers: number;
    lastPaymentAt: string | null;
  };
}

/** The boot warnings, on screen: what is misconfigured right now. */
export function useAdminPlatform(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/platform'],
    enabled,
    queryFn: () => getJson<AdminPlatformResponse>('/api/admin/platform'),
  });
}

export interface AdminCustomerDetail {
  business: AdminCustomer['business'] & {
    phone: string | null;
    address: string;
    distrito: string;
    provincia: string;
    departamento: string;
    website: string | null;
    commercialName: string | null;
    trialEndsAt: string | null;
  };
  logins: AdminCustomerLogin[];
  payments: AdminPaymentRow[];
  subscriptions: {
    id: string;
    reference: string;
    provider: string;
    planId: string;
    period: string;
    status: string;
    nextPaymentAt: string | null;
    startedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
  }[];
  establishments: {
    id: string;
    name: string;
    address: string;
    identificationCode: string;
    isActive: boolean;
  }[];
  complaints: {
    total: number;
    pending: number;
    latest: {
      id: string;
      correlativeNumber: string | null;
      complaintType: string;
      status: string;
      submissionDate: string | null;
      dueDate: string | null;
    }[];
  };
  apiKeys: { total: number };
}

/** One customer in full, for support calls. */
export function useAdminCustomerDetail(businessId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/customers', businessId],
    enabled: enabled && Boolean(businessId),
    queryFn: () => getJson<AdminCustomerDetail>(`/api/admin/customers/${businessId}`),
  });
}

export function useAdminOperators(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/operators'],
    enabled,
    queryFn: () => getJson<AdminOperatorsResponse>('/api/admin/operators'),
  });
}

/** The platform's own collection details, as the console edits them. */
export function useAdminPaymentSettings(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/payment-settings'],
    enabled,
    queryFn: () => getJson<AdminPaymentSettingsResponse>('/api/admin/payment-settings'),
  });
}

function useAdminMutation<TInput>(
  request: (input: TInput) => Promise<Response>,
  invalidate: string[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TInput) => {
      const response = await request(input);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(
            new Error(`${response.status}: ${JSON.stringify(body ?? {})}`),
          ),
        );
      }
      return body;
    },
    onSuccess: () => {
      for (const key of invalidate) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** Assigns or changes a subscription (plan, period, renewal date, account state). */
export function useUpdateCustomer() {
  return useAdminMutation<{ businessId: string; changes: Record<string, unknown> }>(
    ({ businessId, changes }) =>
      apiRequest('PATCH', `/api/admin/customers/${businessId}`, changes),
    ['/api/admin/customers', '/api/admin/overview'],
  );
}

/** Wipes a customer and everything it owns; the RUC is the safety catch. */
export function useDeleteCustomer() {
  return useAdminMutation<{ businessId: string; confirmRuc: string }>(
    ({ businessId, confirmRuc }) =>
      apiRequest('DELETE', `/api/admin/customers/${businessId}`, { confirmRuc }),
    ['/api/admin/customers', '/api/admin/overview', '/api/admin/payments'],
  );
}

export function useGrantOperator() {
  return useAdminMutation<{ email: string }>(
    ({ email }) => apiRequest('POST', '/api/admin/operators', { email }),
    ['/api/admin/operators', '/api/admin/overview'],
  );
}

export function useRevokeOperator() {
  return useAdminMutation<{ userId: string }>(
    ({ userId }) => apiRequest('DELETE', `/api/admin/operators/${userId}`),
    ['/api/admin/operators', '/api/admin/overview'],
  );
}

/**
 * Saves the platform's collection details.
 *
 * `PUT` with the complete record: the form always sends every field, so clearing
 * the Yape number really removes it. `/api/admin/platform` is invalidated too
 * because its "what does the customer read?" check changes with this.
 */
export function useUpdatePaymentSettings() {
  return useAdminMutation<PaymentCollectionDetails>(
    (settings) => apiRequest('PUT', '/api/admin/payment-settings', settings),
    ['/api/admin/payment-settings', '/api/admin/platform'],
  );
}

// ---- Platform configuration (identity, alerts, flags) ------------------------

/** The env values each panel setting can fall back to. */
export interface AdminPlatformEnv {
  alertEmail: string | null;
  freePlanChange: boolean;
  smtpHost: string | null;
  smtpPort: string | null;
  smtpUser: string | null;
  smtpFromEmail: string | null;
}

export interface AdminPlatformSettingsResponse {
  stored: {
    alertEmail: string | null;
    legalName: string | null;
    commercialName: string | null;
    ruc: string | null;
    fiscalAddress: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    trialDays: number | null;
    allowFreePlanChange: boolean;
  };
  effective: {
    alertEmail: string;
    alertEmailSource: 'panel' | 'env' | 'none';
    trialDays: number;
    trialDaysSource: 'panel' | 'default';
    allowFreePlanChange: boolean;
    allowFreePlanChangeFromEnv: boolean;
  };
  identity: {
    legalName: string;
    commercialName: string;
    ruc: string;
    fiscalAddress: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
  };
  saved: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  env: AdminPlatformEnv;
}

/** What the console sends: the whole record, `""` meaning "clear this field". */
export interface PlatformSettingsInput {
  alertEmail: string;
  legalName: string;
  commercialName: string;
  ruc: string;
  fiscalAddress: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  allowFreePlanChange: boolean;
}

export function useAdminPlatformSettings(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/platform-settings'],
    enabled,
    queryFn: () => getJson<AdminPlatformSettingsResponse>('/api/admin/platform-settings'),
  });
}

export function useUpdatePlatformSettings() {
  return useAdminMutation<PlatformSettingsInput>(
    (settings) => apiRequest('PUT', '/api/admin/platform-settings', settings),
    ['/api/admin/platform-settings', '/api/admin/platform', '/api/platform-info'],
  );
}

/** Sends a real test message through SMTP, to the operator's own address. */
export function useSendTestEmail() {
  return useAdminMutation<undefined>(() => apiRequest('POST', '/api/admin/email-test', {}), []);
}


// ---- Price list (Planes) -----------------------------------------------------

export interface AdminPlanPrice {
  planId: string;
  name: string;
  monthlyCents: number;
  annualCents: number;
  catalogueMonthlyCents: number;
  catalogueAnnualCents: number;
  isOverride: boolean;
}

export interface AdminPlanPricingResponse {
  plans: AdminPlanPrice[];
  trialDays: number;
  trialDaysIsOverride: boolean;
}

export function useAdminPlanPricing(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/plan-pricing'],
    enabled,
    queryFn: () => getJson<AdminPlanPricingResponse>('/api/admin/plan-pricing'),
  });
}

export function useUpdatePlanPricing() {
  return useAdminMutation<{
    prices: { planId: string; monthlyCents: number; annualCents: number }[];
    trialDays: number;
  }>((input) => apiRequest('PUT', '/api/admin/plan-pricing', input), [
    '/api/admin/plan-pricing',
    '/api/admin/platform',
    // The customer-facing catalogue and the platform info carry these numbers too.
    '/api/plans',
    '/api/platform-info',
  ]);
}

// ---- Discount codes (Descuentos) ---------------------------------------------

export interface AdminDiscountCode {
  id: string;
  code: string;
  description: string | null;
  kind: 'percent' | 'fixed';
  value: number;
  label: string;
  planIds: string[];
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  state: 'activo' | 'inactivo' | 'vencido' | 'agotado';
  createdAt: string;
  createdByEmail: string | null;
}

export interface DiscountCodeInput {
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  value: number;
  planIds: string[];
  maxRedemptions: number | null;
  expiresAt: string | null;
}

export function useAdminDiscountCodes(enabled: boolean) {
  return useQuery({
    queryKey: ['/api/admin/discount-codes'],
    enabled,
    queryFn: () => getJson<{ codes: AdminDiscountCode[] }>('/api/admin/discount-codes'),
  });
}

export function useCreateDiscountCode() {
  return useAdminMutation<DiscountCodeInput>(
    (input) => apiRequest('POST', '/api/admin/discount-codes', input),
    ['/api/admin/discount-codes'],
  );
}

export function useUpdateDiscountCode() {
  return useAdminMutation<{ id: string; changes: Record<string, unknown> }>(
    ({ id, changes }) => apiRequest('PATCH', `/api/admin/discount-codes/${id}`, changes),
    ['/api/admin/discount-codes'],
  );
}

export function useDeleteDiscountCode() {
  return useAdminMutation<{ id: string }>(
    ({ id }) => apiRequest('DELETE', `/api/admin/discount-codes/${id}`),
    ['/api/admin/discount-codes'],
  );
}

// ---- Change history ----------------------------------------------------------

export interface AdminConfigChange {
  id: string;
  userId: string | null;
  email: string | null;
  area: string;
  summary: string;
  createdAt: string;
}

export function useAdminConfigHistory(enabled: boolean, limit = 50) {
  return useQuery({
    queryKey: ['/api/admin/config-history', limit],
    enabled,
    queryFn: () =>
      getJson<{ changes: AdminConfigChange[] }>(`/api/admin/config-history?limit=${limit}`),
  });
}
