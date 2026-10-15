import { describe, it, expect } from "vitest";
import {
  PLANS,
  checkQuota,
  getAllowedComplaintTypes,
  getEffectivePlan,
  isComplaintTypeAllowed,
  isTrialing,
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

  it("plan changes advance the period end", () => {
    const result = resolvePlanChange(business(), "profesional", "annual", new Date("2026-01-01T00:00:00Z"));
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.plan).toBe("profesional");
      expect(result.planPeriod).toBe("annual");
      expect(result.currentPeriodEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    }
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
