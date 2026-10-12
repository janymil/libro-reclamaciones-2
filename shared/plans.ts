import type { Business } from "./schema";

/**
 * Commercial plan catalog (Phase 2 of the roadmap).
 *
 * Plans are code (not a table) so quota enforcement and the upgrade UI can
 * never drift from what was sold. `businesses.subscription_plan` stores the
 * plan id; every new business starts a TRIAL_DAYS trial with the full
 * "profesional" feature set, after which the selected plan's quotas apply.
 *
 * Positioning note: reclamavirtual charges per complaint - every plan here
 * that targets real usage (profesional/corporativo) has unlimited complaints
 * with AI included.
 */

export type PlanId = "esencial" | "profesional" | "corporativo";

export interface PlanLimits {
  /** Monthly complaint intake quota. `null` = unlimited. */
  complaintsPerMonth: number | null;
  /** Team members per business. */
  users: number;
  /** Branch offices (sucursales) per business. `null` = unlimited. */
  establishments: number | null;
  /** RUCs (businesses) manageable from one login. */
  businesses: number;
  /** Evidence files per complaint. */
  attachmentsPerComplaint: number;
}

export interface PlanFeatures {
  /** Baseline AI: classification, priority, risk, auto-assignment. */
  aiClassification: boolean;
  /** AI response drafting + SLA prediction + trends + similar cases. */
  aiDrafting: boolean;
  /** AI drafts using the business's own tone and policies. */
  brandTone: boolean;
  /** Public REST API + API keys (CRM/ERP). */
  api: boolean;
  /** Outgoing webhooks. */
  webhooks: boolean;
  /** Embeddable intake widget. */
  widget: boolean;
  /** Per-business email/portal templates and branding. */
  templates: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // soles / month
  priceAnnual: number; // soles / year (2 months free)
  limits: PlanLimits;
  features: PlanFeatures;
  highlights: string[];
}

export const TRIAL_DAYS = 7;
export const RETENTION_MONTHS = 24;

export const PLANS: Record<PlanId, PlanDefinition> = {
  esencial: {
    id: "esencial",
    name: "Esencial",
    tagline: "Cumplimiento legal desde el primer día",
    priceMonthly: 49,
    priceAnnual: 490,
    limits: {
      complaintsPerMonth: 60,
      users: 3,
      establishments: 2,
      businesses: 1,
      attachmentsPerComplaint: 3,
    },
    features: {
      aiClassification: true,
      aiDrafting: false,
      brandTone: false,
      api: false,
      webhooks: false,
      widget: false,
      templates: false,
    },
    highlights: [
      "1 empresa y 2 sucursales",
      "60 reclamos al mes",
      "Clasificación y priorización con IA",
      "Constancia PDF, QR y consulta pública",
      "Reporte SIREC y expediente INDECOPI",
    ],
  },
  profesional: {
    id: "profesional",
    name: "Profesional",
    tagline: "Reclamos ilimitados + IA incluida",
    priceMonthly: 99,
    priceAnnual: 990,
    limits: {
      complaintsPerMonth: null,
      users: 15,
      establishments: 10,
      businesses: 1,
      attachmentsPerComplaint: 5,
    },
    features: {
      aiClassification: true,
      aiDrafting: true,
      brandTone: true,
      api: false,
      webhooks: false,
      widget: true,
      templates: true,
    },
    highlights: [
      "Reclamos ilimitados con IA incluida",
      "1 empresa y hasta 10 sucursales",
      "IA con su tono de marca y políticas",
      "Plantillas y branding personalizados",
      "Recordatorios y escalado automático de SLA",
      "Widget para su tienda virtual",
    ],
  },
  corporativo: {
    id: "corporativo",
    name: "Corporativo",
    tagline: "Multi-empresa, API e integraciones",
    priceMonthly: 249,
    priceAnnual: 2490,
    limits: {
      complaintsPerMonth: null,
      users: 100,
      establishments: null,
      businesses: 5,
      attachmentsPerComplaint: 10,
    },
    features: {
      aiClassification: true,
      aiDrafting: true,
      brandTone: true,
      api: true,
      webhooks: true,
      widget: true,
      templates: true,
    },
    highlights: [
      "Hasta 5 RUCs con un solo usuario",
      "Sucursales y reclamos ilimitados",
      "API REST y webhooks para su CRM/ERP",
      "Todo lo de Profesional",
    ],
  },
};

export const PLAN_LIST: PlanDefinition[] = [
  PLANS.esencial,
  PLANS.profesional,
  PLANS.corporativo,
];

export function isPlanId(value: string): value is PlanId {
  return value === "esencial" || value === "profesional" || value === "corporativo";
}

export function getPlan(planId: string): PlanDefinition {
  return isPlanId(planId) ? PLANS[planId] : PLANS.esencial;
}

/** Whether the business is inside its 7-day trial window. */
export function isTrialing(
  business: Pick<Business, "subscriptionStatus" | "trialEndsAt">,
  now: Date = new Date(),
): boolean {
  if (business.subscriptionStatus !== "trialing") {
    return false;
  }
  if (!business.trialEndsAt) {
    return true;
  }
  return new Date(business.trialEndsAt) > now;
}

/**
 * Resolves the *effective* plan for quota enforcement.
 *
 * During the trial every "profesional" feature is unlocked; once the trial
 * ends the stored plan applies.
 */
export function getEffectivePlan(
  business: Pick<Business, "subscriptionPlan" | "subscriptionStatus" | "trialEndsAt">,
  now: Date = new Date(),
): PlanDefinition {
  return isTrialing(business, now) ? PLANS.profesional : getPlan(business.subscriptionPlan);
}

export type QuotaResource =
  | "complaintsThisMonth"
  | "users"
  | "establishments"
  | "businesses"
  | "attachmentsPerComplaint";

export interface QuotaCheck {
  allowed: boolean;
  /** Human readable reason shown by the client when `allowed` is false. */
  reason?: string;
}

const QUOTA_LABELS: Record<QuotaResource, (plan: PlanDefinition) => string> = {
  complaintsThisMonth: (plan) => `Su plan ${plan.name} permite ${plan.limits.complaintsPerMonth ?? '∞'} reclamos al mes`,
  users: (plan) => `Su plan ${plan.name} permite hasta ${plan.limits.users} usuarios`,
  establishments: (plan) => `Su plan ${plan.name} permite hasta ${plan.limits.establishments} sucursales`,
  businesses: (plan) => `Su plan ${plan.name} permite gestionar hasta ${plan.limits.businesses} empresa(s)`,
  attachmentsPerComplaint: (plan) => `Su plan ${plan.name} permite hasta ${plan.limits.attachmentsPerComplaint} adjuntos por reclamo`,
};

/** Maps a quota resource to the plan limit that governs it. */
const LIMIT_KEYS: Record<QuotaResource, keyof PlanLimits> = {
  complaintsThisMonth: 'complaintsPerMonth',
  users: 'users',
  establishments: 'establishments',
  businesses: 'businesses',
  attachmentsPerComplaint: 'attachmentsPerComplaint',
};

/**
 * Pure quota evaluation shared by the intake, user, establishment and
 * business routes (limits of `null` mean unlimited).
 */
export function checkQuota(
  plan: PlanDefinition,
  resource: QuotaResource,
  currentUsage: number,
  delta: number = 1,
): QuotaCheck {
  const limit = plan.limits[LIMIT_KEYS[resource]];
  if (limit === null) {
    return { allowed: true };
  }

  if (currentUsage + delta > limit) {
    return {
      allowed: false,
      reason: `${QUOTA_LABELS[resource](plan)}. Mejore su plan en la sección "Plan y Cuotas" para continuar.`,
    };
  }

  return { allowed: true };
}

