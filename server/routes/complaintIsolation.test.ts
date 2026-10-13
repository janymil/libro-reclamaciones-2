import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * TWO-TENANT ISOLATION SUITE for complaint handling (tenants A and B):
 * complaint reads/updates, audit trail, evidence attachments.
 *
 * Same philosophy as tenantIsolation.test.ts: storage and the external
 * services are mocked, while the real auth middleware and handlers run.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const COMPLAINT_A = "aaaa1111-1111-4111-8111-111111111111";
const COMPLAINT_B = "bbbb1111-1111-4111-8111-111111111111";
const ATTACHMENT_A = "aaaa2222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    usersById: {},
    businessAccess: {},
    complaintsById: {},
    attachmentsById: {},
  };

  const storageMock: any = {
    getComplaint: async (id: string) => {
      track("getComplaint", [id]);
      return state.complaintsById[id];
    },
    getComplaintsByBusiness: async (businessId: string) => {
      track("getComplaintsByBusiness", [businessId]);
      return Object.values(state.complaintsById).filter((c: any) => c.businessId === businessId);
    },
    getUserById: async (id: string) => {
      track("getUserById", [id]);
      return state.usersById[id];
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
    updateComplaint: async (id: string, updates: any) => {
      track("updateComplaint", [id, updates]);
      return { ...state.complaintsById[id], ...updates };
    },
    createAuditLog: async (data: any) => {
      track("createAuditLog", [data]);
      return { id: "log", ...data };
    },
    getAuditLogsByComplaint: async (id: string) => {
      track("getAuditLogsByComplaint", [id]);
      return [];
    },
    getLibroConfiguration: async () => undefined,
    getAttachmentsByComplaint: async (complaintId: string) => {
      track("getAttachmentsByComplaint", [complaintId]);
      return Object.values(state.attachmentsById).filter((a: any) => a.complaintId === complaintId);
    },
    getAttachment: async (id: string) => {
      track("getAttachment", [id]);
      return state.attachmentsById[id];
    },
    softDeleteAttachment: async (id: string) => {
      track("softDeleteAttachment", [id]);
      return { id };
    },
    countAttachmentsByComplaint: async () => 0,
    countComplaintsSince: async () => 0,
    getBusiness: async (id: string) => ({
      id,
      businessName: "Tenant",
      ruc: "20123456789",
      subscriptionPlan: "esencial",
      subscriptionStatus: "active",
      trialEndsAt: null,
    }),
    getAllUsers: async () => Object.values(state.usersById),
    getEstablishmentsByBusiness: async () => [],
  };

  const authMock: any = {
    validateSessionUser: async (userId: string) => state.usersById[userId] ?? null,
  };

  return { calls, state, storageMock, authMock };
});

vi.mock("../storage", () => ({ storage: h.storageMock }));
// Keeps the real database client (and therefore the production DATABASE_URL)
// completely out of the test process: some services imported transitively by
// the route modules (routingService) touch `db` at call time, never here.
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));
vi.mock("../services/authService", () => ({ authService: h.authMock }));
vi.mock("../services/emailService", () => ({
  emailService: { sendComplaintResponse: async () => {}, sendComplaintConfirmation: async () => {} },
}));

import { registerComplaintsRoutes } from "./complaints.routes";
import { registerAttachmentsRoutes } from "./attachments.routes";

const users = {
  staffA: { id: "aaaaaaaa-2222-4222-8222-222222222222", email: "staff.a@example.com", firstName: "Staff", lastName: "A", role: "user", businessId: A, isActive: true, isDemo: false },
  viewerA: { id: "aaaaaaaa-3333-4333-8333-333333333333", email: "viewer.a@example.com", firstName: "Viewer", lastName: "A", role: "viewer", businessId: A, isActive: true, isDemo: false },
  adminB: { id: "bbbbbbbb-1111-4111-8111-111111111111", email: "admin.b@example.com", firstName: "Admin", lastName: "B", role: "admin", businessId: B, isActive: true, isDemo: false },
};

function complaintOf(businessId: string, id: string) {
  return {
    id,
    businessId,
    establishmentId: businessId === A ? "aaaa3333-3333-4333-8333-333333333333" : "bbbb3333-3333-4333-8333-333333333333",
    correlativeNumber: "2026-0001",
    complaintType: "reclamo",
    consumerFullName: businessId === A ? "Consumidor A" : "Consumidor B",
    consumerDocumentNumber: "12345678",
    consumerEmail: "consumidor@example.com",
    productServiceName: "Producto",
    complaintDetail: "Detalle del caso",
    status: "new",
    priority: "normal",
    assignedToUserId: null,
    submissionDate: new Date(),
    dueDate: new Date(),
    isOverdue: false,
  };
}

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.usersById = Object.fromEntries(Object.values(users).map((u) => [u.id, u]));
  h.state.businessAccess = { [users.staffA.id]: [A], [users.viewerA.id]: [A], [users.adminB.id]: [B] };
  h.state.complaintsById = {
    [COMPLAINT_A]: complaintOf(A, COMPLAINT_A),
    [COMPLAINT_B]: complaintOf(B, COMPLAINT_B),
  };
  h.state.attachmentsById = {
    [ATTACHMENT_A]: {
      id: ATTACHMENT_A,
      complaintId: COMPLAINT_A,
      fileName: "2026/01/evidencia.pdf",
      originalName: "evidencia.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      deletedAt: null,
    },
  };

  app = await startTestApp((expressApp) => {
    registerComplaintsRoutes(expressApp);
    registerAttachmentsRoutes(expressApp);
  });
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/complaints - tenant-scoped listing", () => {
  it("queries only the caller's business", async () => {
    const res = await call(app.url, "/api/complaints", { userId: users.staffA.id });

    expect(res.status).toBe(200);
    expect(h.calls.getComplaintsByBusiness[0][0]).toBe(A);
    expect(JSON.stringify(res.body)).not.toContain("Consumidor B");
  });
});

describe("GET /api/complaints/:id - cross-tenant BOLA", () => {
  it("returns the complaint to its own tenant", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, { userId: users.staffA.id });
    expect(res.status).toBe(200);
    expect(res.body.consumerFullName).toBe("Consumidor A");
  });

  it("denies tenant B reading tenant A's complaint (404, no data)", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, { userId: users.adminB.id });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Consumidor A");
    expect(res.body.consumerDocumentNumber).toBeUndefined();
  });

  it("denies reading the audit trail of another tenant's complaint", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}/audit`, { userId: users.adminB.id });
    expect(res.status).toBe(404);
    expect(h.calls.getAuditLogsByComplaint).toBeUndefined();
  });
});

describe("PATCH /api/complaints/:id - writes and cross-tenant relationships", () => {
  it("denies read-only viewers (403)", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.viewerA.id,
      body: { status: "resolved" },
    });
    expect(res.status).toBe(403);
    expect(h.calls.updateComplaint).toBeUndefined();
  });

  it("denies another tenant's staff (404)", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.adminB.id,
      body: { status: "resolved" },
    });
    expect(res.status).toBe(404);
    expect(h.calls.updateComplaint).toBeUndefined();
  });

  it("refuses assigning a user from another tenant", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { assignedToUserId: users.adminB.id },
    });

    expect(res.status).toBe(400);
    expect(h.calls.updateComplaint).toBeUndefined();
  });

  it("allows assigning a colleague of the same tenant", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { assignedToUserId: users.staffA.id, status: "in_progress" },
    });

    expect(res.status).toBe(200);
    expect(h.calls.updateComplaint[0][1].assignedToUserId).toBe(users.staffA.id);
    expect(h.calls.updateComplaint[0][1].status).toBe("in_progress");
  });

  it("accepts a provider response from staff and audits it", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { providerResponse: "Atendido según lo solicitado." },
    });

    expect(res.status).toBe(200);
    expect(h.calls.createAuditLog).toHaveLength(1);
    expect(h.calls.createAuditLog[0][0].businessId).toBeUndefined(); // audit is keyed by complaint
    expect(h.calls.createAuditLog[0][0].complaintId).toBe(COMPLAINT_A);
  });

  it("drops non-whitelisted fields such as tenant identity (mass assignment)", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}`, {
      method: "PATCH",
      userId: users.staffA.id,
      body: { businessId: B, correlativeNumber: "2026-9999", status: "in_progress" },
    });

    expect(res.status).toBe(200);
    const [, updates] = h.calls.updateComplaint[0];
    expect(updates.status).toBe("in_progress");
    // A client can never move a complaint to another tenant or rewrite its
    // legal correlative number.
    expect(updates.businessId).toBeUndefined();
    expect(updates.correlativeNumber).toBeUndefined();
  });
});

describe("evidence attachments - cross-tenant file access", () => {
  it("lists attachments only for the owning tenant", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}/attachments`, { userId: users.staffA.id });
    expect(res.status).toBe(200);
    expect(h.calls.getAttachmentsByComplaint[0][0]).toBe(COMPLAINT_A);
  });

  it("denies listing another tenant's attachments (404)", async () => {
    const res = await call(app.url, `/api/complaints/${COMPLAINT_A}/attachments`, { userId: users.adminB.id });
    expect(res.status).toBe(404);
    expect(h.calls.getAttachmentsByComplaint).toBeUndefined();
  });

  it("denies downloading another tenant's evidence file (404)", async () => {
    const res = await call(app.url, `/api/attachments/${ATTACHMENT_A}/file`, { userId: users.adminB.id });
    expect(res.status).toBe(404);
  });

  it("denies viewers deleting evidence (403)", async () => {
    const res = await call(app.url, `/api/attachments/${ATTACHMENT_A}`, { method: "DELETE", userId: users.viewerA.id });
    expect(res.status).toBe(403);
    expect(h.calls.softDeleteAttachment).toBeUndefined();
  });

  it("denies deleting another tenant's evidence (404)", async () => {
    const res = await call(app.url, `/api/attachments/${ATTACHMENT_A}`, { method: "DELETE", userId: users.adminB.id });
    expect(res.status).toBe(404);
    expect(h.calls.softDeleteAttachment).toBeUndefined();
  });

  it("lets the owning tenant's staff delete its own evidence", async () => {
    const res = await call(app.url, `/api/attachments/${ATTACHMENT_A}`, { method: "DELETE", userId: users.staffA.id });
    expect(res.status).toBe(200);
    expect(h.calls.softDeleteAttachment[0][0]).toBe(ATTACHMENT_A);
  });

  it("caps repeated evidence-upload attempts against one complaint (429)", async () => {
    // The public upload is authorized only by the consumer's document number,
    // so a single complaint id must not become a brute-force oracle.
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt++) {
      const res = await call(app.url, `/api/public/complaints/${COMPLAINT_A}/attachments`, { method: "POST" });
      statuses.push(res.status);
    }

    // Wrong/absent document => 403 for the first attempts, then the limiter
    // refuses further attempts for that complaint.
    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(403));
    expect(statuses[10]).toBe(429);
    expect(h.calls.createAttachment).toBeUndefined();
  });
});


