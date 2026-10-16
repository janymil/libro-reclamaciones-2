import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tenant publication rule: a Libro de Reclamaciones goes live only once an
 * ACTIVE ADMINISTRATOR of the tenant has confirmed the mailbox that receives
 * every complaint notification. Anything else is "not published", and
 * ALLOW_UNVERIFIED_BUSINESSES is the documented escape hatch for legacy tenants.
 */

const h = vi.hoisted(() => ({ state: { members: [] as any[] } }));

vi.mock("../storage", () => ({
  storage: {
    getUsersByBusinessIds: async () => h.state.members,
  },
}));

import { allowsUnverifiedBusinesses, isBusinessPublished } from "./verificationService";

const member = (overrides: Record<string, unknown> = {}) => ({
  id: "u1",
  businessId: "b1",
  role: "admin",
  isActive: true,
  isEmailVerified: true,
  ...overrides,
});

beforeEach(() => {
  h.state.members = [];
  vi.unstubAllEnvs();
});

describe("isBusinessPublished", () => {
  it("publishes when an active administrator confirmed the mailbox", async () => {
    h.state.members = [member()];

    await expect(isBusinessPublished("b1")).resolves.toBe(true);
  });

  it("does not publish when the administrator never confirmed it", async () => {
    h.state.members = [member({ isEmailVerified: false })];

    await expect(isBusinessPublished("b1")).resolves.toBe(false);
  });

  it("ignores a verified member who is not an administrator", async () => {
    // Staff can confirm their own mailbox; the tenant still cannot be published
    // on their behalf, because the book's notification inbox belongs to the
    // company.
    h.state.members = [
      member({ id: "u2", role: "user" }),
      member({ id: "u3", role: "viewer" }),
    ];

    await expect(isBusinessPublished("b1")).resolves.toBe(false);
  });

  it("ignores a deactivated administrator", async () => {
    h.state.members = [member({ isActive: false })];

    await expect(isBusinessPublished("b1")).resolves.toBe(false);
  });

  it("treats a tenant with no members as unpublished", async () => {
    h.state.members = [];

    await expect(isBusinessPublished("b1")).resolves.toBe(false);
  });

  it("publishes once ANY administrator is verified", async () => {
    h.state.members = [
      member({ id: "u1", isEmailVerified: false }),
      member({ id: "u2", isEmailVerified: true }),
    ];

    await expect(isBusinessPublished("b1")).resolves.toBe(true);
  });

  it("publishes the shared demo tenant, where nobody can confirm anything", async () => {
    h.state.members = [member({ isDemo: true, isEmailVerified: false })];

    await expect(isBusinessPublished("b1")).resolves.toBe(true);
  });

  it("always publishes when ALLOW_UNVERIFIED_BUSINESSES is set", async () => {
    vi.stubEnv("ALLOW_UNVERIFIED_BUSINESSES", "true");
    h.state.members = [member({ isEmailVerified: false })];

    expect(allowsUnverifiedBusinesses()).toBe(true);
    await expect(isBusinessPublished("b1")).resolves.toBe(true);
  });
});
