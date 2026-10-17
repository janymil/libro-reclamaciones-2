import { describe, it, expect } from "vitest";
import {
  PLANS,
  checkQuota,
  getAllowedComplaintTypes,
  getEffectivePlan,
  getPlan,
  getTrialDaysRemaining,
  isComplaintTypeAllowed,
  isTrialing,
  resolveTrialEnd,
} from "@shared/plans";
import { monthWindowStart, resolvePlanChange, newBusinessTrialDefaults } from "./subscriptionService";
import type { Business } from "@shared/schema";

const business = (overrides: Partial<Business> = {}): Business =>
  ({
    id: "b1",
    ruc: "12345678901",
    businessName: "Demo SAC",
    address: "Av. Siempreviva 742",
    distrito: "Lima",
    provincia: "Lima",
    departamento: "Lima",
    isActive: true,
    subscriptionPlan: "esencial",
    subscriptionStatus: "active",
    trialEndsAt: null,
    planPeriod: "monthly",
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Business;

describe("plans & quotas", () => {
  it("unlimited plans never block complaints", () => {
    expect(checkQuota(PLANS.profesional, "complaintsThisMonth", 100_000).allowed).toBe(true);
    expect(checkQuota(PLANS.esencial, "complaintsThisMonth", 100_000).allowed).toBe(true);
    expect(checkQuota(PLANS.corporativo, "establishments", 999).allowed).toBe(true);
  });

  it("Básico allows unlimited complaints but blocks the third user", () => {
    expect(checkQuota(PLANS.esencial, "complaintsThisMonth", 10_000).allowed).toBe(true);
    expect(checkQuota(PLANS.esencial, "users", 1).allowed).toBe(true);
    const blocked = checkQuota(PLANS.esencial, "users", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Básico");
  });

  it("corporativo allows 5 businesses but not 6", () => {
    expect(checkQuota(PLANS.corporativo, "businesses", 4).allowed).toBe(true);
    expect(checkQuota(PLANS.corporativo, "businesses", 5).allowed).toBe(false);
  });

  it("trialing businesses get the profesional plan", () => {
    const trialing = business({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 86_400_000),
    });
    expect(isTrialing(trialing)).toBe(true);
    expect(getEffectivePlan(trialing).id).toBe("profesional");
  });

  it("an expired trial falls back to the stored plan", () => {
    const expired = business({
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 86_400_000),
    });
    expect(isTrialing(expired)).toBe(false);
    expect(getEffectivePlan(expired).id).toBe("esencial");
  });

  it("reconstructs the 15-day window when trial_ends_at was never stored", () => {
    // 0003 added `trial_ends_at` as a nullable column to a populated table, so
    // every tenant that already existed kept NULL while `subscription_status`
    // defaulted to 'trialing'. That combination used to read as "still
    // trialing" forever: the header showed "quedan 0 día(s)" and Pro stayed
    // unlocked. The window now comes from registration.
    const legacy = business({
      subscriptionPlan: "gratis",
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      createdAt: new Date(Date.now() - 120 * 86_400_000),
    });

    const resolved = resolveTrialEnd(legacy);
    expect(resolved).not.toBeNull();
    expect(resolved!.getTime()).toBe(legacy.createdAt.getTime() + 15 * 86_400_000);

    expect(isTrialing(legacy)).toBe(false);
    expect(getTrialDaysRemaining(legacy)).toBe(0);
    expect(getEffectivePlan(legacy).id).toBe("gratis");
  });

  it("keeps a reconstructed window open while its 15 days are still running", () => {
    const recent = business({
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      createdAt: new Date(Date.now() - 3 * 86_400_000),
    });

    expect(isTrialing(recent)).toBe(true);
    expect(getTrialDaysRemaining(recent)).toBe(12);
    expect(getEffectivePlan(recent).id).toBe("profesional");
  });

  it("never treats a row with no trial window information as trialing", () => {
    const unknown = business({
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      createdAt: null as unknown as Date,
    });

    expect(resolveTrialEnd(unknown)).toBeNull();
    expect(isTrialing(unknown)).toBe(false);
    expect(getEffectivePlan(unknown).id).toBe("esencial");
  });

  it("resolves a legacy stored plan id to the Free plan it already applies", () => {
    // Pre-0003 rows keep the old `basic` DEFAULT from 0000_init.sql, an id that
    // is not in the catalog. Such a tenant has always been granted Free, so the
    // stored value must not leak any other tier into the UI.
    // See migrations/manual/0009_normalize_plan_ids.sql.
    const legacy = business({
      subscriptionPlan: "basic",
      subscriptionStatus: "trial_ended",
    });

    expect(getPlan("basic").id).toBe("gratis");
    expect(getPlan(legacy.subscriptionPlan).id).toBe("gratis");
    expect(getEffectivePlan(legacy).id).toBe("gratis");
  });

  it("unlocks corporativo immediately when purchased during the trial window", () => {
    const trialingCorp = business({
      subscriptionPlan: "corporativo",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 35 * 86_400_000),
    });
    expect(isTrialing(trialingCorp)).toBe(true);
    expect(getEffectivePlan(trialingCorp).id).toBe("corporativo");
  });

  it("falls back to gratis once currentPeriodEnd has passed", () => {
    const lapsed = business({
      subscriptionPlan: "profesional",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    expect(getEffectivePlan(lapsed).id).toBe("gratis");
  });

  it("keeps the paid plan while currentPeriodEnd is still in the future, even after cancellation", () => {
    const cancelledWithRemainingDays = business({
      subscriptionPlan: "profesional",
      subscriptionStatus: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
    });
    expect(getEffectivePlan(cancelledWithRemainingDays).id).toBe("profesional");
  });
});

describe("subscriptionService helpers", () => {
  it("monthWindowStart returns the first day of the UTC month", () => {
    expect(monthWindowStart(new Date("2026-06-15T12:00:00Z")).toISOString())
      .toBe("2026-06-01T00:00:00.000Z");
  });

  it("new businesses get a 15-day trial", () => {
    const defaults = newBusinessTrialDefaults(new Date("2026-01-01T00:00:00Z"));
    expect(defaults.subscriptionStatus).toBe("trialing");
    expect(defaults.trialEndsAt.toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("honours the trial length the console configured (Planes)", () => {
    // The operator changed it to 30 days; new signups must get 30, not the constant.
    const defaults = newBusinessTrialDefaults(new Date("2026-01-01T00:00:00Z"), 30);
    expect(defaults.trialEndsAt.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("falls back to the default for a nonsense trial length", () => {
    // NaN/0/negative can only arrive from a bad row or a stale caller: a trial that
    // ends today would silently skip the free period entirely.
    for (const days of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const defaults = newBusinessTrialDefaults(new Date("2026-01-01T00:00:00Z"), days);
      expect(defaults.trialEndsAt.toISOString()).toBe("2026-01-16T00:00:00.000Z");
    }
  });

  it("plan changes advance the period end", () => {
    const result = resolvePlanChange(business(), "profesional", "annual", new Date("2026-01-01T00:00:00Z"));
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.subscriptionPlan).toBe("profesional");
      expect(result.planPeriod).toBe("annual");
      expect(result.currentPeriodEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    }
  });

  it("returns the column names the caller persists", () => {
    // Regression: the keys used to be `plan` / `status`, which are not columns of
    // `businesses`. Callers pass this object to `storage.updateBusiness`, and
    // Drizzle drops unknown keys silently - so the plan-change endpoint reported
    // success and changed nothing.
    const result = resolvePlanChange(business(), "profesional", "annual");

    if ("error" in result) throw new Error("unexpected error result");

    expect(Object.keys(result).sort()).toEqual([
      "currentPeriodEnd",
      "planPeriod",
      "subscriptionPlan",
      "subscriptionStatus",
    ]);
  });

  it("rejects unknown plans", () => {
    expect("error" in resolvePlanChange(business(), "premium", "monthly")).toBe(true);
  });
});

describe("Gratis plan limits", () => {
  it("caps Free at 5 complaints in total, 1 user and 1 local", () => {
    expect(checkQuota(PLANS.gratis, "complaintsTotal", 4).allowed).toBe(true);
    const blocked = checkQuota(PLANS.gratis, "complaintsTotal", 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Gratis");

    // Free is a lifetime total, not a monthly meter.
    expect(PLANS.gratis.limits.complaintsPerMonth).toBeNull();

    expect(checkQuota(PLANS.gratis, "users", 0).allowed).toBe(true);
    expect(checkQuota(PLANS.gratis, "users", 1).allowed).toBe(false);
    expect(checkQuota(PLANS.gratis, "establishments", 1).allowed).toBe(false);
  });

  it("Básico and Gratis are both 1 RUC / 1 local; Pro allows more", () => {
    expect(PLANS.gratis.limits.businesses).toBe(1);
    expect(PLANS.gratis.limits.establishments).toBe(1);
    expect(PLANS.esencial.limits.businesses).toBe(1);
    expect(PLANS.esencial.limits.establishments).toBe(1);

    expect(PLANS.profesional.limits.establishments).toBe(5);
    expect(PLANS.profesional.limits.businesses).toBe(2);
  });

  it("blocks each feature outside the tiers that include it", () => {
    // Gratis: no drafting, no widget, no reports, no audit, no API.
    expect(PLANS.gratis.features.aiDrafting).toBe(false);
    expect(PLANS.gratis.features.widget).toBe(false);
    expect(PLANS.gratis.features.reports).toBe(false);
    expect(PLANS.gratis.features.auditLog).toBe(false);
    expect(PLANS.gratis.features.api).toBe(false);

    // Básico: still no drafting/widget/api, but reports are included.
    expect(PLANS.esencial.features.aiDrafting).toBe(false);
    expect(PLANS.esencial.features.widget).toBe(false);
    expect(PLANS.esencial.features.reports).toBe(true);
    expect(PLANS.esencial.features.auditLog).toBe(false);

    // Pro: drafting, brand voice, widget, templates.
    expect(PLANS.profesional.features.aiDrafting).toBe(true);
    expect(PLANS.profesional.features.brandTone).toBe(true);
    expect(PLANS.profesional.features.widget).toBe(true);
    expect(PLANS.profesional.features.api).toBe(false);

    // Empresarial: everything, including the audit trail.
    expect(PLANS.corporativo.features.api).toBe(true);
    expect(PLANS.corporativo.features.webhooks).toBe(true);
    expect(PLANS.corporativo.features.auditLog).toBe(true);
  });

  it("accepts Reclamos but not Quejas on Free, and both on paid plans", () => {
    expect(isComplaintTypeAllowed(PLANS.gratis, "reclamo")).toBe(true);
    expect(isComplaintTypeAllowed(PLANS.gratis, "queja")).toBe(false);
    expect(getAllowedComplaintTypes(PLANS.gratis)).toEqual(["reclamo"]);

    expect(isComplaintTypeAllowed(PLANS.esencial, "queja")).toBe(true);
    expect(getAllowedComplaintTypes(PLANS.profesional)).toEqual(["reclamo", "queja"]);
  });

  it("stores gratis so an ended trial falls back to Free, not to a paid plan", () => {
    const ended = business({
      subscriptionPlan: newBusinessTrialDefaults().subscriptionPlan,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 86_400_000),
    });

    expect(isTrialing(ended)).toBe(false);
    expect(getEffectivePlan(ended).id).toBe("gratis");
  });
});
