import { describe, it, expect } from "vitest";
import {
  PLANS,
  checkQuota,
  getEffectivePlan,
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
    expect(checkQuota(PLANS.corporativo, "establishments", 999).allowed).toBe(true);
  });

  it("esencial blocks beyond 60 monthly complaints", () => {
    expect(checkQuota(PLANS.esencial, "complaintsThisMonth", 59).allowed).toBe(true);
    const blocked = checkQuota(PLANS.esencial, "complaintsThisMonth", 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Esencial");
  });

  it("esencial blocks the third user", () => {
    expect(checkQuota(PLANS.esencial, "users", 2).allowed).toBe(true);
    expect(checkQuota(PLANS.esencial, "users", 3).allowed).toBe(false);
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

  it("new businesses get a 7-day trial", () => {
    const defaults = newBusinessTrialDefaults(new Date("2026-01-01T00:00:00Z"));
    expect(defaults.subscriptionStatus).toBe("trialing");
    expect(defaults.trialEndsAt.toISOString()).toBe("2026-01-08T00:00:00.000Z");
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
