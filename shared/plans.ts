import type { Business } from "./schema";

/**
 * Commercial plan catalog — aggressive mass-market pricing for Perú.
 *
 * Goal: be the clearly cheaper + better-value option for micro + small
 * businesses (1 local / 1 RUC), while keeping profitable higher tiers.
 * Annual billing is pushed hard (50%+ cheaper than paying month by month)
 * because most cash comes from yearly payments.
 *
 * Tiers:
 *   gratis       = Gratis      S/ 0 — hook to beat the paper book + DIY form
 *   esencial     = Básico      S/ 89/año (S/ 15/mes) — volume driver
 *   profesional  = Pro         S/ 189/año (S/ 29/mes) — MOST POPULAR
 *   corporativo  = Empresarial S/ 429/año (S/ 69/mes) — multi-RUC + API
 * Chains / franchises (10+ locales, SSO, nube privada) go custom — contact sales.
 *
 * Trial: every new business starts a TRIAL_DAYS trial with the full
 * "profesional" feature set, after which the stored plan's quotas apply.
 * New businesses store "gratis" so when the trial ends they fall back to
 * Free automatically instead of being blocked.
 *
 * Positioning: paid plans have UNLIMITED complaints. Gratis is deliberately
 * tight (5 reclamos/mes, solo Reclamos, 1 local, 1 usuario) so it beats a
 * photocopied paper book or a homemade form, but any real volume, second
 * local, second user or Queja pushes to Básico.
 */

export type PlanId = "gratis" | "esencial" | "profesional" | "corporativo";

export interface PlanLimits {
  /** Monthly complaint intake quota. `null` = unlimited / not monthly-metered. */
  complaintsPerMonth: number | null;
  /**
   * Lifetime complaint quota. Gratis gets 5 complaints in total (not per
   * month), so a free book never becomes a permanent free service.
   */
  complaintsTotal: number | null;
  /** Team members per business. `null` = unlimited. */
  users: number | null;
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
  /**
   * WhatsApp Cloud API: inbound consumer messages get a guided reply, and a
   * registered written response can be notified to the consumer on WhatsApp.
   * Requires the platform WABA (env-configured); degrades silently without it.
   */
  whatsapp: boolean;
  /** Per-business email/portal templates and branding. */
  templates: boolean;
  /** Consolidated reports, statistics and SIREC/INDECOPI export. */
  reports: boolean;
  /** Audit trail: who changed what, and when. */
  auditLog: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number; // soles / month (decoy to push annual)
  priceAnnual: number; // soles / year (the real price, ~50% off)
  limits: PlanLimits;
  features: PlanFeatures;
  highlights: string[];
}

export const TRIAL_DAYS = 15;
export const RETENTION_MONTHS = 24;

/** Launch offer: first 500 customers pay S/ 69 the first year (regular S/ 89). */
export const LAUNCH_OFFER_ANNUAL_BASICO = 69;
export const REGULAR_ANNUAL_BASICO = 89;
export const LAUNCH_OFFER_SEATS = 500;

/** Multi-year: pay 2 years, 3rd year at 50% (messaging, applied as coupon at checkout). */
export const MULTI_YEAR_DISCOUNT_NOTE =
  'Paga 2 años y llévate el 3ro al 50%';

export const PLANS: Record<PlanId, PlanDefinition> = {
  gratis: {
    id: 'gratis',
    name: 'Gratis',
    tagline: 'Cumple la ley sin pagar nada · 1 local',
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      complaintsPerMonth: null,
      complaintsTotal: 5,
      users: 1,
      establishments: 1,
      businesses: 1,
      attachmentsPerComplaint: 1,
    },
    features: {
      aiClassification: true,
      aiDrafting: false,
      brandTone: false,
      api: false,
      webhooks: false,
      widget: false,
      whatsapp: false,
      templates: false,
      reports: false,
      auditLog: false,
    },
    highlights: [
      '5 reclamos en total, para siempre (solo Reclamos, no Quejas)',
      '1 RUC, 1 local y 1 libro',
      '1 usuario',
      'QR + cartel oficial + constancia PDF',
      'Alertas de 15 días hábiles',
      'Resguardo 2 años (ley)',
    ],
  },
  esencial: {
    id: 'esencial',
    name: 'Básico',
    tagline: 'Cumple la ley sin pagar de más · 1 local',
    priceMonthly: 15,
    priceAnnual: 89,
    limits: {
      complaintsPerMonth: null,
      complaintsTotal: null,
      users: 2,
      establishments: 1,
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
      whatsapp: false,
      templates: false,
      reports: true,
      auditLog: false,
    },
    highlights: [
      'Reclamos ILIMITADOS (otros los limitan o cobran por caso)',
      '1 RUC y 1 local / 1 libro',
      '2 usuarios',
      'Reportes de cumplimiento y exportación SIREC / INDECOPI',
      'Alertas de 15 días hábiles + resguardo 2 años (ley)',
      'QR + cartel oficial + constancia PDF automática',
      'Logo de tu negocio',
    ],
  },
  profesional: {
    id: 'profesional',
    name: 'Pro',
    tagline: 'El más elegido · hasta 5 locales',
    priceMonthly: 29,
    priceAnnual: 189,
    limits: {
      complaintsPerMonth: null,
      complaintsTotal: null,
      users: 5,
      establishments: 5,
      businesses: 2,
      attachmentsPerComplaint: 5,
    },
    features: {
      aiClassification: true,
      aiDrafting: true,
      brandTone: true,
      api: false,
      webhooks: false,
      widget: true,
      whatsapp: true,
      templates: true,
      reports: true,
      auditLog: false,
    },
    highlights: [
      'Todo lo de Básico, ILIMITADO',
      'Hasta 5 locales y 2 RUCs',
      '5 usuarios con roles',
      'IA que redacta respuestas con tu tono',
      'Panel con estadísticas y plantillas',
      'Widget para Shopify / WooCommerce / web',
      'Soporte por WhatsApp prioritario',
    ],
  },
  corporativo: {
    id: 'corporativo',
    name: 'Empresarial',
    tagline: 'Multi-RUC, API y auditoría',
    priceMonthly: 69,
    priceAnnual: 429,
    limits: {
      complaintsPerMonth: null,
      complaintsTotal: null,
      users: null,
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
      whatsapp: true,
      templates: true,
      reports: true,
      auditLog: true,
    },
    highlights: [
      'Todo lo de Pro, ILIMITADO',
      'Hasta 5 RUCs · locales y usuarios ilimitados',
      'API REST + webhooks para tu CRM/ERP',
      'Reportes avanzados y registro de auditoría',
      'Exportación SIREC lista para fiscalización',
      'Atención prioritaria con SLA',
    ],
  },
};

export const PLAN_LIST: PlanDefinition[] = [
  PLANS.gratis,
  PLANS.esencial,
  PLANS.profesional,
  PLANS.corporativo,
];

export function isPlanId(value: string): value is PlanId {
  return value === "gratis" || value === "esencial" || value === "profesional" || value === "corporativo";
}

export function getPlan(planId: string): PlanDefinition {
  return isPlanId(planId) ? PLANS[planId] : PLANS.gratis;
}

/**
 * Which complaint types a plan may receive.
 * Gratis is Reclamos-only (no Quejas): Quejas are about attention/service
 * quality, Reclamos about the product/service itself. A free hook that only
 * handles Reclamos beats a paper book for an online shop, but any business
 * that gets Quejas (i.e. real customer-service volume) must move to Básico.
 */
export function getAllowedComplaintTypes(plan: PlanDefinition): Array<"reclamo" | "queja"> {
  return plan.id === "gratis" ? ["reclamo"] : ["reclamo", "queja"];
}

export function isComplaintTypeAllowed(
  plan: PlanDefinition,
  complaintType: string,
): boolean {
  return getAllowedComplaintTypes(plan).includes(complaintType as "reclamo" | "queja");
}

/** The fields needed to place a business inside (or outside) its trial window. */
export interface TrialWindow {
  subscriptionStatus: string;
  trialEndsAt?: Date | string | null;
  /**
   * Fallback when `trialEndsAt` was never stored. The column arrived with the
   * trial lifecycle (0003) as a nullable addition, so every tenant that already
   * existed kept NULL there and only `createdAt` describes its window.
   */
  createdAt?: Date | string | null;
  /**
   * End of the currently paid period, when set. Once this date has passed, a
   * business that is not trialing falls back to the Free tier.
   */
  currentPeriodEnd?: Date | string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date a business's trial ends.
 *
 * `trialEndsAt` is the stored value. A trial is TRIAL_DAYS long *by
 * definition*, so when the column is empty the window is reconstructed from
 * registration instead of being left open — that data gap is what made an
 * old tenant show "quedan 0 día(s)" while keeping every Pro feature unlocked
 * forever. `null` therefore means "the window cannot be known at all", which
 * callers must read as "no trial", never as "trial without end".
 */
export function resolveTrialEnd(
  business: Pick<TrialWindow, "trialEndsAt" | "createdAt">,
): Date | null {
  if (business.trialEndsAt) {
    const stored = new Date(business.trialEndsAt);
    if (!Number.isNaN(stored.getTime())) {
      return stored;
    }
  }

  if (business.createdAt) {
    const createdAt = new Date(business.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
      const derived = new Date(createdAt);
      derived.setUTCDate(derived.getUTCDate() + TRIAL_DAYS);
      return derived;
    }
  }

  return null;
}

/** Whether the business is inside its trial window. */
export function isTrialing(business: TrialWindow, now: Date = new Date()): boolean {
  if (business.subscriptionStatus !== "trialing") {
    return false;
  }

  const endsAt = resolveTrialEnd(business);
  return endsAt !== null && endsAt > now;
}

/** Whole days left in the trial (0 when the business is not trialing). */
export function getTrialDaysRemaining(business: TrialWindow, now: Date = new Date()): number {
  const endsAt = resolveTrialEnd(business);
  if (endsAt === null || !isTrialing(business, now)) {
    return 0;
  }

  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}

/**
 * Resolves the *effective* plan for quota enforcement.
 *
 * During the trial every "profesional" feature is unlocked (unless the tenant
 * already purchased "corporativo", which unlocks Empresarial immediately);
 * once the trial ends the stored plan applies for as long as the paid period
 * (`currentPeriodEnd`) has not lapsed.
 */
export function getEffectivePlan(
  business: Pick<Business, "subscriptionPlan"> & TrialWindow,
  now: Date = new Date(),
): PlanDefinition {
  if (isTrialing(business, now)) {
    const stored = getPlan(business.subscriptionPlan);
    return stored.id === "corporativo" ? PLANS.corporativo : PLANS.profesional;
  }

  if (business.currentPeriodEnd) {
    const periodEnd = new Date(business.currentPeriodEnd);
    if (!Number.isNaN(periodEnd.getTime()) && periodEnd <= now) {
      return PLANS.gratis;
    }
  } else if (
    business.subscriptionStatus === "canceled" ||
    business.subscriptionStatus === "past_due"
  ) {
    return PLANS.gratis;
  }

  return getPlan(business.subscriptionPlan);
}

export type QuotaResource =
  | "complaintsThisMonth"
  | "complaintsTotal"
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
  complaintsThisMonth: (plan) => plan.limits.complaintsPerMonth === null
    ? `Su plan ${plan.name} no tiene límite mensual de reclamos`
    : `Su plan ${plan.name} permite ${plan.limits.complaintsPerMonth} reclamos al mes`,
  complaintsTotal: (plan) => `Su plan ${plan.name} incluye ${plan.limits.complaintsTotal ?? 0} reclamos en total`,
  users: (plan) => plan.limits.users === null
    ? `Su plan ${plan.name} permite usuarios ilimitados`
    : `Su plan ${plan.name} permite hasta ${plan.limits.users} usuarios`,
  establishments: (plan) => plan.limits.establishments === null
    ? `Su plan ${plan.name} permite locales ilimitados`
    : `Su plan ${plan.name} permite hasta ${plan.limits.establishments} locales`,
  businesses: (plan) => `Su plan ${plan.name} permite gestionar hasta ${plan.limits.businesses} empresa(s)`,
  attachmentsPerComplaint: (plan) => `Su plan ${plan.name} permite hasta ${plan.limits.attachmentsPerComplaint} adjuntos por reclamo`,
};

/** Maps a quota resource to the plan limit that governs it. */
const LIMIT_KEYS: Record<QuotaResource, keyof PlanLimits> = {
  complaintsThisMonth: 'complaintsPerMonth',
  complaintsTotal: 'complaintsTotal',
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

