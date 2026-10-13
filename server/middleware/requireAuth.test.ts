import { describe, it, expect, vi } from "vitest";

// requireAuth imports the auth service, which pulls the data layer; neither is
// needed to exercise the pure authorization helpers below.
vi.mock("../services/authService", () => ({ authService: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));

import { requireNonDemo, requireRole, requireAdmin, requireStaff } from "./requireAuth";

function mockRes() {
  const res: any = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: any) => {
    res.body = body;
    return res;
  });
  return res;
}

function run(middleware: any, req: any) {
  const res = mockRes();
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
}

describe("requireRole - deny by default", () => {
  it("answers 401 when there is no authenticated user", () => {
    const { res, next } = run(requireAdmin, {});

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 403 for an unauthorized role and never calls next", () => {
    const { res, next } = run(requireAdmin, { user: { role: "viewer" } });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows an admin", () => {
    const { next } = run(requireAdmin, { user: { role: "admin" } });
    expect(next).toHaveBeenCalledOnce();
  });

  it("lets staff and admins through on staff routes, but not viewers", () => {
    expect(run(requireStaff, { user: { role: "admin" } }).next).toHaveBeenCalledOnce();
    expect(run(requireStaff, { user: { role: "user" } }).next).toHaveBeenCalledOnce();
    expect(run(requireStaff, { user: { role: "viewer" } }).next).not.toHaveBeenCalled();
  });

  it("ignores a role supplied by the client (only req.user counts)", () => {
    const { res, next } = run(requireAdmin, {
      user: { role: "viewer" },
      body: { role: "admin" },
      query: { role: "admin" },
    });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("supports custom role combinations", () => {
    const middleware = requireRole("admin", "viewer");
    expect(run(middleware, { user: { role: "viewer" } }).next).toHaveBeenCalledOnce();
    expect(run(middleware, { user: { role: "user" } }).next).not.toHaveBeenCalled();
  });
});

describe("requireNonDemo", () => {
  it("blocks the shared public demo account", () => {
    const { res, next } = run(requireNonDemo, { user: { isDemo: true } });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets regular accounts through", () => {
    const { next } = run(requireNonDemo, { user: { isDemo: false } });
    expect(next).toHaveBeenCalledOnce();
  });
});