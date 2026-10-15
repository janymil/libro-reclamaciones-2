import { describe, it, expect, beforeEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * Access requests: the escape hatch for a duplicate RUC.
 *
 * Before this, a login that needed a RUC somebody else had registered got a bare
 * 409 with no way forward. These tests pin both the happy path and the three
 * abuses it must not allow: deciding on another tenant's request, approving your
 * own request, and deciding twice.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    usersById: {},
    businessAccess: {},
    businessesByRuc: {},
    requestById: {} as Record<string, any>,
    pendingRequest: undefined as any,
    decideResult: undefined as any,
  };

  return { calls, state, track };
});

vi.mock("../storage", () => ({
  storage: {
    getUserById: async (id: string) => {
      h.track("getUserById", [id]);
      return h.state.usersById[id];
    },
    updateUser: async (id: string, updates: any) => {
      h.track("updateUser", [id, updates]);
      return { id, ...updates };
    },
    getUserBusinessAccess: async (userId: string) => {
      h.track("getUserBusinessAccess", [userId]);
      return (h.state.businessAccess[userId] ?? []).map((businessId: string) => ({
        businessId,
      }));
    },
    getBusinessByRuc: async (ruc: string) => {
      h.track("getBusinessByRuc", [ruc]);
      return h.state.businessesByRuc[ruc];
    },
    getPendingAccessRequest: async (businessId: string, requesterUserId: string) => {
      h.track("getPendingAccessRequest", [businessId, requesterUserId]);
      return h.state.pendingRequest;
    },
    createAccessRequest: async (data: any) => {
      h.track("createAccessRequest", [data]);
      return { id: "req-new", status: "pending", ...data };
    },
    getAccessRequest: async (id: string) => {
      h.track("getAccessRequest", [id]);
      return h.state.requestById[id];
    },
    decideAccessRequest: async (id: string, decision: any) => {
      h.track("decideAccessRequest", [id, decision]);
      return h.state.decideResult;
    },
    grantBusinessAccess: async (data: any) => {
      h.track("grantBusinessAccess", [data]);
      return { id: "grant", ...data };
    },
    getAccessRequestsByRequester: async (userId: string) => {
      h.track("getAccessRequestsByRequester", [userId]);
      return [];
    },
    getAccessRequestsByBusinessIds: async (ids: string[]) => {
      h.track("getAccessRequestsByBusinessIds", [ids]);
      return [];
    },
    getUsersByBusinessIds: async (ids: string[]) => {
      h.track("getUsersByBusinessIds", [ids]);
      return Object.values(h.state.usersById).filter((u: any) => ids.includes(u.businessId));
    },
  },
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async (id: string) => h.state.usersById[id] ?? null },
}));

vi.mock("../services/emailService", () => ({
  emailService: {
    sendAccessRequestReceived: async (params: any) => {
      h.track("sendAccessRequestReceived", [params]);
    },
    sendAccessRequestDecision: async (params: any) => {
      h.track("sendAccessRequestDecision", [params]);
    },
  },
}));

import { registerAccessRequestRoutes } from "./accessRequests.routes";

const adminA = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  email: "admin.a@example.com",
  firstName: "Admin",
  lastName: "A",
  role: "admin",
  businessId: A,
  isActive: true,
  isDemo: false,
  onboardingCompleted: true,
};

const adminB = {
  id: "bbbbbbbb-1111-4111-8111-111111111111",
  email: "admin.b@example.com",
  firstName: "Admin",
  lastName: "B",
  role: "admin",
  businessId: B,
  isActive: true,
  isDemo: false,
  onboardingCompleted: true,
};

// A fresh signup with no tenant yet: exactly the user the access flow exists for.
const newcomer = {
  id: "cccccccc-1111-4111-8111-111111111111",
  email: "contador@example.com",
  firstName: "Conta",
  lastName: "Dor",
  role: "admin",
  businessId: null,
  isActive: true,
  isDemo: false,
  onboardingStep: 1,
  onboardingCompleted: false,
};

const pendingRequest = {
  id: "req-1",
  businessId: A,
  requesterUserId: newcomer.id,
  requesterEmail: newcomer.email,
  requesterName: "Conta Dor",
  message: "Llevo la contabilidad",
  status: "pending",
  businessName: "Tenant A",
  ruc: "20111111111",
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.usersById = { [adminA.id]: adminA, [adminB.id]: adminB, [newcomer.id]: newcomer };
  h.state.businessAccess = { [adminA.id]: [A], [adminB.id]: [B] };
  h.state.businessesByRuc = {
    "20111111111": { id: A, businessName: "Tenant A" },
  };
  h.state.requestById = { [pendingRequest.id]: pendingRequest };
  h.state.pendingRequest = undefined;
  h.state.decideResult = { ...pendingRequest, status: "approved" };

  app = await startTestApp(registerAccessRequestRoutes);
});
describe("POST /api/businesses/access-requests", () => {
  it("answers 404 for a RUC that is not registered here", async () => {
    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: newcomer.id,
      body: { ruc: "20999999999" },
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("ruc_not_found");
    expect(h.calls.createAccessRequest).toBeUndefined();
  });

  it("answers 409 when the caller already manages that RUC", async () => {
    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: adminA.id,
      body: { ruc: "20111111111" },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("already_has_access");
    expect(h.calls.createAccessRequest).toBeUndefined();
  });

  it("is idempotent while a request is pending (no duplicate, no second email)", async () => {
    h.state.pendingRequest = pendingRequest;

    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: newcomer.id,
      body: { ruc: "20111111111" },
    });

    expect(response.status).toBe(200);
    expect(response.body.alreadyPending).toBe(true);
    expect(h.calls.createAccessRequest).toBeUndefined();
    expect(h.calls.sendAccessRequestReceived).toBeUndefined();
  });

  it("stores the request and notifies the tenant administrators, not the requester", async () => {
    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: newcomer.id,
      body: { ruc: "20111111111", message: "Llevo su contabilidad" },
    });

    expect(response.status).toBe(201);

    const [created] = h.calls.createAccessRequest[0];
    expect(created.businessId).toBe(A);
    expect(created.requesterUserId).toBe(newcomer.id);
    expect(created.requesterEmail).toBe(newcomer.email);

    // The administrator of tenant A is told; nobody else is.
    const notified = h.calls.sendAccessRequestReceived.map(([params]) => params.to);
    expect(notified).toEqual([adminA.email]);
  });

  it("rejects a malformed RUC before touching the database", async () => {
    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: newcomer.id,
      body: { ruc: "123" },
    });

    expect(response.status).toBe(400);
    expect(h.calls.getBusinessByRuc).toBeUndefined();
  });

  it("keeps the shared demo account out of it", async () => {
    h.state.usersById = { ...h.state.usersById, [newcomer.id]: { ...newcomer, isDemo: true } };

    const response = await call(app.url, "/api/businesses/access-requests", {
      method: "POST",
      userId: newcomer.id,
      body: { ruc: "20111111111" },
    });

    expect(response.status).toBe(403);
    expect(h.calls.createAccessRequest).toBeUndefined();
  });
});

describe("POST /api/businesses/access-requests/:id/approve", () => {
  it("answers 404 to an administrator of a different tenant", async () => {
    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/approve`,
      { method: "POST", userId: adminB.id },
    );

    expect(response.status).toBe(404);
    expect(h.calls.grantBusinessAccess).toBeUndefined();
    expect(h.calls.decideAccessRequest).toBeUndefined();
  });

  it("refuses self-approval", async () => {
    // The requester is an admin of the target tenant: without this check they
    // could grant themselves access to any empresa they could name.
    h.state.usersById = {
      ...h.state.usersById,
      [newcomer.id]: { ...newcomer, businessId: A, role: "admin" },
    };
    h.state.businessAccess = { ...h.state.businessAccess, [newcomer.id]: [A] };
    h.state.requestById = {
      [pendingRequest.id]: { ...pendingRequest, requesterUserId: newcomer.id },
    };

    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/approve`,
      { method: "POST", userId: newcomer.id },
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("self_approval");
    expect(h.calls.grantBusinessAccess).toBeUndefined();
  });

  it("grants access, finishes the requester's onboarding and notifies them", async () => {
    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/approve`,
      { method: "POST", userId: adminA.id, body: { note: "Bienvenido" } },
    );

    expect(response.status).toBe(200);

    const [grant] = h.calls.grantBusinessAccess[0];
    expect(grant).toEqual({ userId: newcomer.id, businessId: A, role: "admin" });

    // The requester has no tenant of their own: approving IS their onboarding,
    // otherwise the wizard would send them to register a RUC that already exists.
    const [updatedId, updates] = h.calls.updateUser[0];
    expect(updatedId).toBe(newcomer.id);
    expect(updates.businessId).toBe(A);
    expect(updates.onboardingCompleted).toBe(true);

    const [decision] = h.calls.sendAccessRequestDecision[0];
    expect(decision.to).toBe(newcomer.email);
    expect(decision.approved).toBe(true);
  });

  it("does not re-point a user who already has their own active tenant", async () => {
    h.state.usersById = {
      ...h.state.usersById,
      [newcomer.id]: { ...newcomer, businessId: B, onboardingCompleted: true },
    };

    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/approve`,
      { method: "POST", userId: adminA.id },
    );

    expect(response.status).toBe(200);
    expect(h.calls.updateUser).toBeUndefined();
    // Access is still granted: it becomes a tenant to switch to.
    expect(h.calls.grantBusinessAccess).toHaveLength(1);
  });

  it("answers 409 when another administrator already decided", async () => {
    h.state.decideResult = undefined;

    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/approve`,
      { method: "POST", userId: adminA.id },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("already_decided");
    expect(h.calls.grantBusinessAccess).toBeUndefined();
  });

  it("answers 404 for an unknown request id", async () => {
    const response = await call(app.url, "/api/businesses/access-requests/nope/approve", {
      method: "POST",
      userId: adminA.id,
    });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/businesses/access-requests/:id/reject", () => {
  it("records the rejection without granting anything", async () => {
    h.state.decideResult = { ...pendingRequest, status: "rejected" };

    const response = await call(
      app.url,
      `/api/businesses/access-requests/${pendingRequest.id}/reject`,
      { method: "POST", userId: adminA.id, body: { note: "No lo conocemos" } },
    );

    expect(response.status).toBe(200);
    expect(h.calls.decideAccessRequest[0][1]).toEqual({
      status: "rejected",
      decidedByUserId: adminA.id,
    });
    expect(h.calls.grantBusinessAccess).toBeUndefined();

    const [decision] = h.calls.sendAccessRequestDecision[0];
    expect(decision.approved).toBe(false);
    expect(decision.note).toBe("No lo conocemos");
  });
});

