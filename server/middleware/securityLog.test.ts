import { describe, it, expect, vi, afterEach } from "vitest";

import { buildDenialEvent, logSecurityEvent } from "./securityLog";

/**
 * Authorization denials must be observable (alerting on tenant-probing) without
 * copying personal data into the log stream.
 */
describe("buildDenialEvent - redaction rules", () => {
  const request = {
    method: "PATCH",
    path: "/api/complaints",
    originalUrl: "/api/complaints?documento=12345678&token=secret",
    query: { documento: "12345678", token: "secret" },
    body: { providerResponse: "contenido sensible", consumerEmail: "juana@example.com" },
    ip: "203.0.113.9",
    session: { userId: "11111111-1111-4111-8111-111111111111" },
    user: { role: "viewer", email: "juana@example.com", firstName: "Juana" },
  };

  it("captures the audit essentials", () => {
    const event = buildDenialEvent(request, 403);

    expect(event.type).toBe("authz_denial");
    expect(event.method).toBe("PATCH");
    expect(event.path).toBe("/api/complaints");
    expect(event.status).toBe(403);
    expect(event.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(event.role).toBe("viewer");
    expect(event.ip).toBe("203.0.113.9");
  });

  it("never records the query string, the body, emails or names", () => {
    const serialized = JSON.stringify(buildDenialEvent(request, 403));

    expect(serialized).not.toContain("documento");
    expect(serialized).not.toContain("12345678");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("contenido sensible");
    expect(serialized).not.toContain("juana@example.com");
    expect(serialized).not.toContain("Juana");
    expect(serialized).not.toContain("originalUrl");
  });

  it("works for anonymous requests", () => {
    const event = buildDenialEvent({ method: "GET", path: "/api/users", ip: "198.51.100.4" }, 401);

    expect(event.userId).toBeNull();
    expect(event.role).toBeNull();
    expect(event.status).toBe(401);
  });
});

describe("logSecurityEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a single JSON line tagged [security]", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logSecurityEvent(buildDenialEvent({ method: "GET", path: "/api/users" }, 403));

    expect(warn).toHaveBeenCalledOnce();
    const line = warn.mock.calls[0][0] as string;
    expect(line).toMatch(/^\[security\] \{/);
    expect(JSON.parse(line.replace("[security] ", ""))).toMatchObject({
      type: "authz_denial",
      path: "/api/users",
      status: 403,
    });
  });
});