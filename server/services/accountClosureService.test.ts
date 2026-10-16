import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Closing / deleting a tenant ("abandon the app").
 *
 * The rule that must not drift: a tenant with NO complaints is erased, a tenant
 * WITH complaints is only closed (book offline, charge cancelled) and its records
 * stay for the legal 2-year retention. The subscription is always cancelled
 * first, so the customer stops being charged even if the purge is next.
 */

const h = vi.hoisted(() => {
  const calls = {
    cancels: [] as string[],
    purges: [] as string[],
    libroUpdates: [] as Array<{ id: string; updates: any }>,
    businessUpdates: [] as Array<{ id: string; updates: any }>,
    countCalls: 0,
  };
  const state = { complaints: 0, config: { id: "cfg1", businessId: "b1" } as any };
  return { calls, state };
});

vi.mock("../storage", () => ({
  storage: {
    countComplaintsSince: async () => {
      h.calls.countCalls += 1;
      return h.state.complaints;
    },
    purgeBusiness: async (businessId: string) => {
      h.calls.purges.push(businessId);
    },
    getLibroConfiguration: async () => h.state.config,
    updateLibroConfiguration: async (id: string, updates: any) => {
      h.calls.libroUpdates.push({ id, updates });
      return { ...h.state.config, ...updates };
    },
    updateBusiness: async (id: string, updates: any) => {
      h.calls.businessUpdates.push({ id, updates });
      return { id, ...updates };
    },
  },
}));

vi.mock("./paymentService", () => ({
  cancelSubscriptionForBusiness: async (businessId: string) => {
    h.calls.cancels.push(businessId);
    return undefined;
  },
}));

import { closeBusiness } from "./accountClosureService";

const business = () =>
  ({
    id: "b1",
    ruc: "20123456789",
    businessName: "Empresa SAC",
    isActive: true,
    subscriptionStatus: "active",
  }) as any;

beforeEach(() => {
  h.calls.cancels = [];
  h.calls.purges = [];
  h.calls.libroUpdates = [];
  h.calls.businessUpdates = [];
  h.calls.countCalls = 0;
  h.state.complaints = 0;
  h.state.config = { id: "cfg1", businessId: "b1" };
});

describe("closeBusiness", () => {
  it("erases a tenant that never received a complaint", async () => {
    const result = await closeBusiness(business());

    expect(result.purged).toBe(true);
    expect(result.complaintCount).toBe(0);
    expect(h.calls.cancels).toEqual(["b1"]);
    expect(h.calls.purges).toEqual(["b1"]);
    // Nothing to close: the rows are gone, not deactivated.
    expect(h.calls.businessUpdates).toEqual([]);
    expect(h.calls.libroUpdates).toEqual([]);
  });

  it("closes a tenant with records and keeps them for the legal retention", async () => {
    h.state.complaints = 3;

    const result = await closeBusiness(business());

    expect(result.purged).toBe(false);
    expect(result.complaintCount).toBe(3);
    expect(h.calls.purges).toEqual([]);

    // The book goes offline (the public portal 404s) ...
    expect(h.calls.libroUpdates).toEqual([{ id: "cfg1", updates: { isActive: false } }]);
    // ... and the subscription is marked cancelled.
    expect(h.calls.businessUpdates).toEqual([{ id: "b1", updates: { subscriptionStatus: "canceled" } }]);
    // The message must be honest about what was kept and why.
    expect(result.message).toContain("2 años");
  });

  it("stops the charge before touching any data", async () => {
    h.state.complaints = 1;
    const order: string[] = [];

    // Re-derive the calls' order through dedicated spying on the same mocks.
    const storageModule = await import("../storage");
    const paymentModule = await import("./paymentService");
    vi.spyOn(paymentModule, "cancelSubscriptionForBusiness").mockImplementation(async (businessId: string) => {
      order.push(`cancel:${businessId}`);
      return undefined;
    });
    vi.spyOn(storageModule.storage, "updateBusiness").mockImplementation(async (id: string) => {
      order.push(`update:${id}`);
      return { id } as any;
    });

    await closeBusiness(business());

    expect(order).toEqual(["cancel:b1", "update:b1"]);
    vi.restoreAllMocks();
  });

  it("tolerates a provider failure when cancelling", async () => {
    const paymentModule = await import("./paymentService");
    vi.spyOn(paymentModule, "cancelSubscriptionForBusiness").mockRejectedValue(new Error("provider down"));

    h.state.complaints = 2;
    const result = await closeBusiness(business());

    // The closure still happens; the failure is logged, not propagated.
    expect(result.purged).toBe(false);
    expect(h.calls.businessUpdates).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("closes a tenant with records even if no libro was ever configured", async () => {
    h.state.complaints = 2;
    h.state.config = undefined;

    const result = await closeBusiness(business());

    expect(result.purged).toBe(false);
    expect(h.calls.cancels).toEqual(["b1"]);
    expect(h.calls.libroUpdates).toEqual([]);
    expect(h.calls.businessUpdates).toEqual([{ id: "b1", updates: { subscriptionStatus: "canceled" } }]);
  });
});
