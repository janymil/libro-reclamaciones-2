import { describe, it, expect, beforeEach, vi } from "vitest";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * Sucursales (`/api/establishments`).
 *
 * The regression pinned here: a sucursal was created alone, so it appeared on
 * /sucursales while /libros stayed empty and the establishment could never
 * receive a complaint - DS 011-2011-PCM requires one Libro per establishment
 * open to the public. `POST` now registers both rows in one transaction, and the
 * edit route (which the UI has always called) must stay tenant-scoped.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const calls: Record<string, any[][]> = {};
  const track = (name: string, args: any[]) => {
    (calls[name] ??= []).push(args);
  };

  const state: any = {
    user: null,
    establishment: undefined,
    listed: [],
    /** Active establishments of the tenant (`getEstablishmentsByBusiness`). */
    active: [],
    quota: { allowed: true, reason: "" },
    createResult: undefined,
  };

  return { calls, state, track };
});

vi.mock("../storage", () => ({
  storage: {
    getEstablishment: async (id: string) => {
      h.track("getEstablishment", [id]);
      return h.state.establishment?.id === id ? h.state.establishment : undefined;
    },
    getEstablishmentsByBusiness: async (businessId: string) => {
      h.track("getEstablishmentsByBusiness", [businessId]);
      return h.state.active;
    },
    getAllEstablishmentsByBusiness: async (businessId: string) => {
      h.track("getAllEstablishmentsByBusiness", [businessId]);
      return h.state.listed;
    },
    createEstablishmentWithBook: async (data: any) => {
      h.track("createEstablishmentWithBook", [data]);
      return h.state.createResult;
    },
    updateEstablishment: async (id: string, updates: any) => {
      h.track("updateEstablishment", [id, updates]);
      return { id, ...updates };
    },
  },
}));

vi.mock("../services/authService", () => ({
  authService: { validateSessionUser: async () => h.state.user },
}));

vi.mock("../services/subscriptionService", () => ({
  enforceQuota: async () => h.state.quota,
}));

import { registerEstablishmentsRoutes } from "./establishments.routes";

const accountUser = (overrides: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  email: "admin@example.com",
  role: "admin",
  businessId: A,
  isActive: true,
  isDemo: false,
  isEmailVerified: true,
  ...overrides,
});

const newSucursal = {
  name: "Sucursal Norte",
  address: "Av. Los Álamos 120",
  phone: "999888777",
  identificationCode: "SUC-002",
};

let app: { url: string; close: () => Promise<void> };

beforeEach(async () => {
  for (const key of Object.keys(h.calls)) delete h.calls[key];

  h.state.user = accountUser();
  h.state.establishment = undefined;
  h.state.listed = [];
  // By default the tenant has other active locals, so closing one is allowed.
  h.state.active = [
    { id: "est-a", businessId: A, name: "Casa Matriz", isActive: true },
    { id: "est-b", businessId: A, name: "Sucursal Norte", isActive: true },
  ];
  h.state.quota = { allowed: true, reason: "" };
  h.state.createResult = {
    establishment: { id: "est-new", businessId: A, ...newSucursal },
    book: { id: "book-new", establishmentId: "est-new", bookType: "reclamos" },
  };

  app = await startTestApp(registerEstablishmentsRoutes);
});

describe("GET /api/establishments", () => {
  it("lists the tenant's sucursales, inactive ones included", async () => {
    // A closed local has to stay visible to be reactivated; the public portal does
    // not use this route (it reads only the active ones).
    h.state.listed = [
      { id: "est-a", businessId: A, name: "Casa Matriz", isActive: true },
      { id: "est-old", businessId: A, name: "Local verano", isActive: false },
    ];

    const response = await call(app.url, "/api/establishments", { userId: h.state.user.id });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(h.calls.getAllEstablishmentsByBusiness[0]).toEqual([A]);
  });
});

describe("POST /api/establishments", () => {
  it("registers the sucursal together with its Libro de Reclamaciones", async () => {
    const response = await call(app.url, "/api/establishments", {
      method: "POST",
      userId: h.state.user.id,
      body: newSucursal,
    });

    expect(response.status).toBe(201);

    // One storage call: the establishment and its book are committed together.
    const [data] = h.calls.createEstablishmentWithBook[0];
    expect(data.name).toBe("Sucursal Norte");
    // The tenant comes from the session, never from the payload.
    expect(data.businessId).toBe(A);
    expect(response.body.book.bookType).toBe("reclamos");
    expect(response.body.message).toContain("Libro de Reclamaciones");
  });

  it("ignores a businessId sent by the client (tenant spoofing)", async () => {
    await call(app.url, "/api/establishments", {
      method: "POST",
      userId: h.state.user.id,
      body: { ...newSucursal, businessId: B },
    });

    expect(h.calls.createEstablishmentWithBook[0][0].businessId).toBe(A);
  });

  it("denies non-admin staff (403)", async () => {
    h.state.user = accountUser({ role: "user" });

    const response = await call(app.url, "/api/establishments", {
      method: "POST",
      userId: h.state.user.id,
      body: newSucursal,
    });

    expect(response.status).toBe(403);
    expect(h.calls.createEstablishmentWithBook).toBeUndefined();
  });

  it("blocks the creation when the plan's sucursal quota is reached", async () => {
    h.state.quota = { allowed: false, reason: "Su plan permite hasta 1 establecimiento." };

    const response = await call(app.url, "/api/establishments", {
      method: "POST",
      userId: h.state.user.id,
      body: newSucursal,
    });

    expect(response.status).toBe(402);
    expect(response.body.code).toBe("quota_exceeded");
    expect(h.calls.createEstablishmentWithBook).toBeUndefined();
  });

  it("rejects an incomplete sucursal with 400, not 500", async () => {
    const response = await call(app.url, "/api/establishments", {
      method: "POST",
      userId: h.state.user.id,
      body: { name: "Sin dirección ni código" },
    });

    expect(response.status).toBe(400);
    expect(h.calls.createEstablishmentWithBook).toBeUndefined();
  });
});

describe("PATCH /api/establishments/:id", () => {
  it("renames a sucursal of the caller's tenant", async () => {
    h.state.establishment = { id: "est-a", businessId: A, name: "Casa Matriz" };

    const response = await call(app.url, "/api/establishments/est-a", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { name: "Wong" },
    });

    expect(response.status).toBe(200);
    const [id, updates] = h.calls.updateEstablishment[0];
    expect(id).toBe("est-a");
    expect(updates.name).toBe("Wong");
  });

  it("hides another tenant's sucursal (404) and never touches it", async () => {
    h.state.establishment = { id: "est-b", businessId: B, name: "Ajena" };

    const response = await call(app.url, "/api/establishments/est-b", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { name: "Robada" },
    });

    expect(response.status).toBe(404);
    expect(h.calls.updateEstablishment).toBeUndefined();
  });

  it("cannot move a sucursal to another tenant (businessId is stripped)", async () => {
    h.state.establishment = { id: "est-a", businessId: A, name: "Casa Matriz" };

    await call(app.url, "/api/establishments/est-a", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { name: "Wong", businessId: B },
    });

    const [, updates] = h.calls.updateEstablishment[0];
    expect(updates.businessId).toBeUndefined();
  });

  it("closes a local by deactivating it (and can reopen it)", async () => {
    // The only way to stop a local that no longer serves the public: it leaves the
    // public list and the intake refuses it, while its records stay.
    h.state.establishment = { id: "est-a", businessId: A, name: "Local verano", isActive: true };
    h.state.active = [
      { id: "est-madre", businessId: A, name: "Casa Matriz", isActive: true },
      { id: "est-a", businessId: A, name: "Local verano", isActive: true },
    ];

    const closed = await call(app.url, "/api/establishments/est-a", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { isActive: false },
    });

    expect(closed.status).toBe(200);
    expect(h.calls.updateEstablishment[0]).toEqual(["est-a", { isActive: false }]);

    const reopened = await call(app.url, "/api/establishments/est-a", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { isActive: true },
    });

    expect(reopened.status).toBe(200);
    expect(h.calls.updateEstablishment[1]).toEqual(["est-a", { isActive: true }]);
  });

  it("refuses to close the only active local", async () => {
    // With no active local the consumer form has no "¿dónde ocurrió?" to choose,
    // so the public book could not accept a single complaint.
    h.state.establishment = { id: "est-solo", businessId: A, name: "Único local", isActive: true };
    h.state.active = [{ id: "est-solo", businessId: A, name: "Único local", isActive: true }];

    const response = await call(app.url, "/api/establishments/est-solo", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { isActive: false },
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("last_establishment");
    expect(h.calls.updateEstablishment).toBeUndefined();
  });

  it("denies non-admin staff (403)", async () => {
    h.state.user = accountUser({ role: "viewer" });
    h.state.establishment = { id: "est-a", businessId: A, name: "Casa Matriz" };

    const response = await call(app.url, "/api/establishments/est-a", {
      method: "PATCH",
      userId: h.state.user.id,
      body: { isActive: false },
    });

    expect(response.status).toBe(403);
    expect(h.calls.updateEstablishment).toBeUndefined();
  });
});
