import {
  PLANS,
  TRIAL_DAYS,
  getEffectivePlan,
  isComplaintTypeAllowed,
  isPlanId,
  isTrialing,
  type PlanDefinition,
  type QuotaCheck,
  type QuotaResource,
  checkQuota,
} from "@shared/plans";
import type { Business } from "@shared/schema";
import { storage } from "../storage";

/**
 * Plans & quotas framework.
 *
 * Every new business starts a trial (TRIAL_DAYS) with the full "profesional"
 * feature set; afterwards the stored plan's quotas apply. Enforcement is a
 * pure function (`checkQuota` in shared/plans.ts) fed with usage counters
 * resolved here, so the same logic drives intake, users, establishments,
 * businesses and the upgrade UI.
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
  trialEndsAt: Date | null;
  trialDaysRemaining: number;
  planPeriod: string;
  currentPeriodEnd: Date | null;
  usage: SubscriptionUsage;
}

/** First moment of the current month (UTC) - the quota window boundary. */
export function monthWindowStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of time: counting every complaint the tenant ever received. */
const LIFETIME_START = new Date(0);

export async function getSubscriptionUsage(businessId: string, userId: string): Promise<SubscriptionUsage> {
  const monthStart = monthWindowStart();

  const [complaintsThisMonth, complaintsTotal, users, establishments] = await Promise.all([
    storage.countComplaintsSince(businessId, monthStart),
    storage.countComplaintsSince(businessId, LIFETIME_START),
    countBusinessUsers(businessId),
    countBusinessEstablishments(businessId),
  ]);

  // Multi-RUC: businesses this user manages (access grants + own business)
  const access = await storage.getUserBusinessAccess(userId);
  const businesses = new Set<string>(access.map((entry) => entry.businessId));
  if (businessId) {
    businesses.add(businessId);
  }

  return { complaintsThisMonth, complaintsTotal, users, establishments, businesses: businesses.size };
}

async function countBusinessUsers(businessId: string): Promise<number> {
  const all = await storage.getAllUsers();
  return all.filter((user) => user.businessId === businessId && user.isActive).length;
}

async function countBusinessEstablishments(businessId: string): Promise<number> {
  const establishments = await storage.getEstablishmentsByBusiness(businessId);
  return establishments.filter((establishment) => establishment.isActive).length;
}

export async function getSubscriptionInfo(business: Business, userId: string): Promise<SubscriptionInfo> {
  const now = new Date();
  const usage = await getSubscriptionUsage(business.id, userId);
  const trial = isTrialing(business, now);

  const trialDaysRemaining = trial && business.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(business.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    plan: getEffectivePlan(business, now),
    storedPlanId: business.subscriptionPlan,
    status: business.subscriptionStatus,
    isTrial: trial,
    trialEndsAt: business.trialEndsAt ? new Date(business.trialEndsAt) : null,
    trialDaysRemaining,
    planPeriod: business.planPeriod,
    currentPeriodEnd: business.currentPeriodEnd ? new Date(business.currentPeriodEnd) : null,
    usage,
  };
}

/**
 * Quota guard used by the write routes. Loads the business, resolves the
 * effective plan and evaluates the resource counter.
 */
export async function enforceQuota(
  businessId: string,
  userId: string | null,
  resource: QuotaResource,
  currentUsage?: number,
): Promise<QuotaCheck> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { allowed: false, reason: "Empresa no encontrada" };
  }

  const plan = getEffectivePlan(business);

  let usage = currentUsage;
  if (usage === undefined) {
    // The monthly complaint quota can be counted without a user; every other
    // resource needs the full usage snapshot of the business.
    if (resource === 'complaintsThisMonth') {
      usage = await storage.countComplaintsSince(businessId, monthWindowStart());
    } else if (resource === 'complaintsTotal') {
      usage = await storage.countComplaintsSince(businessId, LIFETIME_START);
    } else if (userId) {
      const snapshot = await getSubscriptionUsage(businessId, userId);
      usage = snapshot[resource as keyof SubscriptionUsage] ?? 0;
    } else {
      usage = 0;
    }
  }

  return checkQuota(plan, resource, usage);
}

/**
 * Whether the business's effective plan accepts this complaint type.
 *
 * Gratis only accepts Reclamos (a disconformity with the product/service), not
 * Quejas (a disconformity with the attention received). It is a deliberate
 * limit on the free tier: a business that gets Quejas has real
 * customer-service volume and moves (or their customers do) to Básico.
 */
export async function enforceComplaintType(
  businessId: string,
  complaintType: string,
): Promise<QuotaCheck> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { allowed: false, reason: "Empresa no encontrada" };
  }

  const plan = getEffectivePlan(business);
  if (isComplaintTypeAllowed(plan, complaintType)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      `Su plan ${plan.name} acepta solo Reclamos. Para registrar Quejas, active el plan Básico en "Plan y Cuotas".`,
  };
}

/** Whether a plan-gated feature is available to the business. */
export async function hasFeature(businessId: string, feature: keyof PlanDefinition["features"]): Promise<boolean> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return false;
  }
  return getEffectivePlan(business).features[feature];
}

/** Trial fields applied to every newly created business. New tenants store
 * "gratis" so when the trial ends they fall back to Free automatically. */
export function newBusinessTrialDefaults(now: Date = new Date()): {
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialEndsAt: Date;
  planPeriod: string;
} {
  const trialEndsAt = new Date(now);
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);
  return {
    subscriptionPlan: "gratis",
    subscriptionStatus: "trialing",
    trialEndsAt,
    planPeriod: "monthly",
  };
}

/**
 * Applies a plan change. Plans are annual or monthly; the trial stays intact
 * when the change happens during the trial (paying customers keep their
 * remaining trial days on top of the new plan).
 */
export function resolvePlanChange(
  current: Business,
  planId: string,
  period: string,
  now: Date = new Date(),
): { plan: string; status: string; planPeriod: string; currentPeriodEnd: Date } | { error: string } {
  if (!isPlanId(planId)) {
    return { error: "Plan inválido" };
  }

  const periodMonths = period === "annual" ? 12 : 1;
  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + periodMonths);

  return {
    plan: planId,
    status: isTrialing(current, now) ? "trialing" : "active",
    planPeriod: period === "annual" ? "annual" : "monthly",
    currentPeriodEnd,
  };
}

export { PLANS, TRIAL_DAYS };
