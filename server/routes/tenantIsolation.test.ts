import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * TWO-TENANT ISOLATION SUITE (tenants A and B).
 *
 * Storage and the auth service are mocked; the REAL requireAuth / requireRole
 * middleware and the REAL route handlers execute, so every assertion reflects
 * the production authorization chain.
 *
 * Tenant A: adminA (admin), staffA (user), viewerA (viewer)
 * Tenant B: adminB (admin)
 * multiAdmin: admin of A with an explicit grant on B
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
    users: [],
    businessAccess: {},
    businessById: {},
    complaintsById: {},
    attachmentsById: {},
    notificationOwner: {},
    usersByBusinessIds: [],
  };

  const storageMock: any = {
    getUsersByBusinessIds: async (ids: string[]) => {
      track("getUsersByBusinessIds", [ids]);
      // Filters like the real query does, so the assertions below hold at the
      // response level and not only on the requested tenant ids.
      return state.users.filter((u: any) => ids.includes(u.businessId));
    },
    getAllUsers: async () => {
      track("getAllUsers", []);
      return state.users;
    },
    getUserById: async (id: string) => {
      track("getUserById", [id]);
      return state.usersById[id];
    },
    getUserByEmail: async (email: string) => {
      track("getUserByEmail", [email]);
      return state.users.find((u: any) => u.email === email);
    },
    createUser: async (data: any) => {
      track("createUser", [data]);
      return { id: "new-user", ...data };
    },
    updateUserStatus: async (id: string, isActive: boolean) => {
      track("updateUserStatus", [id, isActive]);
      return { id, isActive };
    },
    updateUserProfile: async (id: string, data: any) => {
      track("updateUserProfile", [id, data]);
      return { id, ...data };
    },
    grantBusinessAccess: async (data: any) => {
      track("grantBusinessAccess", [data]);
      return { id: "grant", ...data };
    },
    getUserBusinessAccess: async (userId: string) => {
      track("getUserBusinessAccess", [userId]);
      return (state.businessAccess[userId] ?? []).map((businessId: string) => ({
        id: `grant-${businessId}`,
        userId,
        businessId,
        role: "admin",
        createdAt: new Date(),
        businessName: "Tenant",
        ruc: "20123456789",
      }));
    },
    hasBusinessAccess: async () => false,
    updateUser: async (id: string, updates: any) => {
      track("updateUser", [id, updates]);
      return { id, ...updates };
    },
    getBusiness: async (id: string) => {
      track("getBusiness", [id]);
      return state.businessById[id];
    },
    getAllBusinesses: async () => {
      track("getAllBusinesses", []);
      return Object.values(state.businessById);
    },
    getBusinessByRuc: async () => undefined,
    createBusiness: async (data: any) => {
      track("createBusiness", [data]);
      return { id: "new-business", ...data };
    },
    updateBusiness: async (id: string, data: any) => {
      track("updateBusiness", [id, data]);
      return { id, ...data };
    },
    getEstablishmentsByBusiness: async () => [],
    createEstablishment: async (data: any) => {
      track("createEstablishment", [data]);
      return { id: "new-est", ...data };
    },
    countComplaintsSince: async () => 0,
    getComplaint: async (id: string) => {
      track("getComplaint", [id]);
      return state.complaintsById[id];
    },
    updateComplaint: async (id: string, updates: any) => {
      track("updateComplaint", [id, updates]);
      return { id, ...updates };
    },
    createAuditLog: async (data: any) => {
      track("createAuditLog", [data]);
      return { id: "log", ...data };
    },
    getLibroConfiguration: async () => undefined,
    getComplaintsByBusiness: async () => [],
    getAttachmentsByComplaint: async () => [],
    getAttachment: async (id: string) => {
      track("getAttachment", [id]);
      return state.attachmentsById[id];
    },
    softDeleteAttachment: async (id: string) => {
      track("softDeleteAttachment", [id]);
      return { id };
    },
    getNotifications: async () => [],
    markNotificationAsRead: async (id: string, businessId: string) => {
      track("markNotificationAsRead", [id, businessId]);
      return state.notificationOwner[id] === businessId;
    },
    createNotification: async (data: any) => {
      track("createNotification", [data]);
      return { id: "notif", ...data };
    },
  };

  const authMock: any = {
    validateSessionUser: async (userId: string) => state.usersById[userId] ?? null,
    logoutUser: async () => {},
  };

  return { calls, state, storageMock, authMock };
});

vi.mock("../storage", () => ({ storage: h.storageMock }));
vi.mock("../services/authService", () => ({ authService: h.authMock }));

import { registerUsersRoutes } from "./users.routes";
import { registerBusinessesRoutes } from "./businesses.routes";
import { registerNotificationsRoutes } from "./notifications.routes";

function tenantBusiness(id: string, name: string) {
  return {
    id,
    ruc: id === A ? "20111111111" : "20222222222",
    businessName: name,
    commercialName: name,
    phone: "999888777",
    address: "Av. Siempre Viva 123",
    distrito: "Lima",
    provincia: "Lima",
    departamento: "Lima",
    website: null,
    isActive: true,
    subscriptionPlan: "corporativo",
    // Active Empresarial (unlimited users) => these tests exercise
    // authorization, not quota rejections.
    subscriptionStatus: "active",
    trialEndsAt: null,
    planPeriod: "monthly",
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const users = {
  adminA: { id: "aaaaaaaa-1111-4111-8111-111111111111", email: "admin.a@example.com", firstName: "Admin", lastName: "A", role: "admin", businessId: A, isActive: true, isDemo: false },
  staffA: { id: "aaaaaaaa-2222-4222-8222-222222222222", email: "staff.a@example.com", firstName: "Staff", lastName: "A", role: "user", businessId: A, isActive: true, isDemo: false },
  viewerA: { id: "aaaaaaaa-3333-4333-8333-333333333333", email: "viewer.a@example.com", firstName: "Viewer", lastName: "A", role: "viewer", businessId: A, isActive: true, isDemo: false },
  adminB: { id: "bbbbbbbb-1111-4111-8111-111111111111", email: "admin.b@example.com", firstName: "Admin", lastName: "B", role: "admin", businessId: B, isActive: true, isDemo: false },
  multiAdmin: { id: "cccccccc-1111-4111-8111-111111111111", email: "multi@example.com", firstName: "Multi", lastName: "Admin", role: "admin", businessId: A, isActive: true, isDemo: false },
  // The publicly shared demo account (credentials published with the product).
  demoAdmin: { id: "dddddddd-1111-4111-8111-111111111111", email: "demo@librovirtual.pe", firstName: "Usuario", lastName: "Demo", role: "admin", businessId: A, isActive: true, isDemo: true },
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.usersById = Object.fromEntries(Object.values(users).map((u) => [u.id, u]));
  h.state.users = Object.values(users);
  h.state.businessById = { [A]: tenantBusiness(A, "Tenant A"), [B]: tenantBusiness(B, "Tenant B") };
  h.state.businessAccess = {
    [users.adminA.id]: [A],
    [users.staffA.id]: [A],
    [users.viewerA.id]: [A],
    [users.adminB.id]: [B],
    [users.multiAdmin.id]: [A, B],
    // Deliberate misconfiguration: a stray grant on the demo account must NOT
    // widen what the publicly shared demo login can see.
    [users.demoAdmin.id]: [A, B],
  };
  h.state.complaintsById = {};
  h.state.attachmentsById = {};
  h.state.notificationOwner = {};

  app = await startTestApp((expressApp) => {
    registerUsersRoutes(expressApp);
    registerBusinessesRoutes(expressApp);
    registerNotificationsRoutes(expressApp);
  });
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/users - cross-tenant staff PII disclosure", () => {
  it("scopes the listing to the caller's tenants instead of every tenant", async () => {
    const res = await call(app.url, "/api/users", { userId: users.adminA.id });

    expect(res.status).toBe(200);
    expect(h.calls.getUsersByBusinessIds).toHaveLength(1);
    expect(h.calls.getUsersByBusinessIds[0][0]).toEqual([A]);
    // The unscoped, platform-wide listing must never be reachable over HTTP.
    expect(h.calls.getAllUsers).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("admin.b@example.com");
  });

  it("includes granted tenants for a multi-RUC admin", async () => {
    const res = await call(app.url, "/api/users", { userId: users.multiAdmin.id });

    expect(res.status).toBe(200);
    expect(h.calls.getUsersByBusinessIds[0][0].slice().sort()).toEqual([A, B].sort());
  });

  it("rejects anonymous callers", async () => {
    const res = await call(app.url, "/api/users", { userId: null });
    expect(res.status).toBe(401);
    expect(h.calls.getUsersByBusinessIds).toBeUndefined();
  });

  it("never lists another company's staff on the public demo tenant (F1 regression)", async () => {
    // Reproduces the reported bug: logged in as "Empresa Demo S.A.C." the
    // Users page showed a user belonging to a different company.
    const res = await call(app.url, "/api/users", { userId: users.demoAdmin.id });

    expect(res.status).toBe(200);
    expect(h.calls.getUsersByBusinessIds).toHaveLength(1);
    expect(h.calls.getUsersByBusinessIds[0][0]).toEqual([A]);

    const body = JSON.stringify(res.body);
    expect(body).toContain("demo@librovirtual.pe"); // its own staff is visible
    expect(body).not.toContain("admin.b@example.com"); // tenant B staff is not
    expect(body).not.toContain(B);
  });

  it("pins the demo account to its own tenant even if a stray grant exists", async () => {
    // businessAccess above deliberately grants the demo login tenant B.
    const res = await call(app.url, "/api/users", { userId: users.demoAdmin.id });

    expect(res.status).toBe(200);
    expect(h.calls.getUsersByBusinessIds[0][0]).toEqual([A]);
    // The demo account's grants are never even consulted.
    expect(h.calls.getUserBusinessAccess).toBeUndefined();
  });
});

describe("POST /api/users - privilege escalation / tenant spoofing", () => {
  const payload = {
    username: "nuevo.usuario",
    email: "nuevo@example.com",
    password: "ClaveSegura123",
    role: "user",
  };

  it("denies non-admin staff (403)", async () => {
    const res = await call(app.url, "/api/users", { method: "POST", userId: users.staffA.id, body: payload });
    expect(res.status).toBe(403);
    expect(h.calls.createUser).toBeUndefined();
  });

  it("denies read-only viewers (403)", async () => {
    const res = await call(app.url, "/api/users", { method: "POST", userId: users.viewerA.id, body: payload });
    expect(res.status).toBe(403);
    expect(h.calls.createUser).toBeUndefined();
  });

  it("rejects enrolling an admin into a foreign tenant (403)", async () => {
    const res = await call(app.url, "/api/users", {
      method: "POST",
      userId: users.adminB.id,
      body: { ...payload, role: "admin", businessId: A },
    });
    expect(res.status).toBe(403);
    expect(h.calls.createUser).toBeUndefined();
  });

  it("rejects a businessId the caller does not manage (403)", async () => {
    const res = await call(app.url, "/api/users", {
      method: "POST",
      userId: users.adminA.id,
      body: { ...payload, businessId: B },
    });
    expect(res.status).toBe(403);
    expect(h.calls.createUser).toBeUndefined();
  });

  it("allows an admin to create staff in its own tenant", async () => {
    const res = await call(app.url, "/api/users", { method: "POST", userId: users.adminA.id, body: payload });

    expect(res.status).toBe(201);
    expect(h.calls.createUser[0][0].businessId).toBe(A);
    expect(res.body.password).toBeUndefined(); // never echo credentials
  });

  it("allows a granted multi-RUC admin to staff its second tenant", async () => {
    const res = await call(app.url, "/api/users", {
      method: "POST",
      userId: users.multiAdmin.id,
      body: { ...payload, businessId: B },
    });

    expect(res.status).toBe(201);
    expect(h.calls.createUser[0][0].businessId).toBe(B);
    expect(h.calls.grantBusinessAccess[0][0].businessId).toBe(B);
  });

  it("enforces a minimum password length", async () => {
    const res = await call(app.url, "/api/users", {
      method: "POST",
      userId: users.adminA.id,
      body: { ...payload, password: "corta" },
    });
    expect(res.status).toBe(400);
    expect(h.calls.createUser).toBeUndefined();
  });
});

describe("PATCH /api/users/:id/status - cross-tenant account lockout", () => {
  it("denies non-admin staff (403)", async () => {
    const res = await call(app.url, `/api/users/${users.staffA.id}/status`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { isActive: false },
    });
    expect(res.status).toBe(403);
    expect(h.calls.updateUserStatus).toBeUndefined();
  });

  it("hides users of other tenants (404) and does not touch them", async () => {
    const res = await call(app.url, `/api/users/${users.adminB.id}/status`, {
      method: "PATCH",
      userId: users.adminA.id,
      body: { isActive: false },
    });
    expect(res.status).toBe(404);
    expect(h.calls.updateUserStatus).toBeUndefined();
  });

  it("blocks deactivating your own account", async () => {
    const res = await call(app.url, `/api/users/${users.adminA.id}/status`, {
      method: "PATCH",
      userId: users.adminA.id,
      body: { isActive: false },
    });
    expect(res.status).toBe(400);
    expect(h.calls.updateUserStatus).toBeUndefined();
  });

  it("lets an admin manage its own tenant's staff", async () => {
    const res = await call(app.url, `/api/users/${users.staffA.id}/status`, {
      method: "PATCH",
      userId: users.adminA.id,
      body: { isActive: false },
    });
    expect(res.status).toBe(200);
    expect(h.calls.updateUserStatus[0]).toEqual([users.staffA.id, false]);
  });
});

describe("PATCH /api/businesses/:id - cross-tenant writes and plan escalation", () => {
  it("denies non-admin staff (403)", async () => {
    const res = await call(app.url, `/api/businesses/${A}`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { businessName: "Robado" },
    });
    expect(res.status).toBe(403);
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("cannot modify another tenant (404)", async () => {
    const res = await call(app.url, `/api/businesses/${B}`, {
      method: "PATCH",
      userId: users.adminA.id,
      body: { businessName: "Secuestrado" },
    });
    expect(res.status).toBe(404);
    expect(h.calls.updateBusiness).toBeUndefined();
  });

  it("strips subscription/plan fields from the update (mass assignment)", async () => {
    const res = await call(app.url, `/api/businesses/${A}`, {
      method: "PATCH",
      userId: users.adminA.id,
      body: {
        businessName: "Tenant A Renombrado",
        subscriptionPlan: "corporativo",
        subscriptionStatus: "active",
        trialEndsAt: null,
        isActive: true,
      },
    });

    expect(res.status).toBe(200);
    const [, updates] = h.calls.updateBusiness[0];
    expect(updates.businessName).toBe("Tenant A Renombrado");
    expect(updates.subscriptionPlan).toBeUndefined();
    expect(updates.subscriptionStatus).toBeUndefined();
    expect(updates.trialEndsAt).toBeUndefined();
  });
});

describe("PATCH /api/notifications/:id/read - cross-tenant IDOR", () => {
  it("scopes the update to the caller's tenant", async () => {
    h.state.notificationOwner = { "notif-a": A };

    const res = await call(app.url, "/api/notifications/notif-a/read", { method: "PATCH", userId: users.adminA.id });
    expect(res.status).toBe(200);
    expect(h.calls.markNotificationAsRead[0]).toEqual(["notif-a", A]);
  });

  it("cannot mark another tenant's notification as read", async () => {
    h.state.notificationOwner = { "notif-b": B };

    const res = await call(app.url, "/api/notifications/notif-b/read", { method: "PATCH", userId: users.adminA.id });
    expect(res.status).toBe(404);
  });
});
