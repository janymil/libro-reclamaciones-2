import { describe, it, expect, vi } from "vitest";

// security.ts imports the data layer only to decide between the PostgreSQL and
// in-memory session stores; the pure helpers below need none of that. Mocking it
// keeps the suite from booting PGlite (server/db.ts has a top-level await).
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));

import { parseTrustProxy } from "./security";

/**
 * `trust proxy` decides which peer Express believes when it reads the client
 * address off `X-Forwarded-For`. In production that peer is Cloudflare, so the
 * value has to be explicit: too low and every request looks like it came from the
 * CDN (one login-limit bucket for the whole country), too high/`true` and a client
 * that reaches the origin directly can forge the header and bypass every limiter.
 */
describe("parseTrustProxy", () => {
  it("defaults to a single hop when unset or blank", () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy("")).toBe(1);
    expect(parseTrustProxy("   ")).toBe(1);
  });

  it("accepts an explicit hop count, so a host that adds its own proxy works", () => {
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("3")).toBe(3);
    expect(parseTrustProxy("0")).toBe(0);
    expect(parseTrustProxy(" 2 ")).toBe(2);
  });

  it("accepts the boolean spellings Express understands", () => {
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("true")).toBe(true);
  });

  it("turns a comma-separated CIDR list into ranges (the safest Cloudflare form)", () => {
    expect(parseTrustProxy("173.245.48.0/20,103.21.244.0/22")).toEqual([
      "173.245.48.0/20",
      "103.21.244.0/22",
    ]);
    // Cloudflare publishes IPv6 ranges too, and a hand-pasted list has spaces.
    expect(parseTrustProxy("2400:cb00::/32, 2606:4700::/32")).toEqual([
      "2400:cb00::/32",
      "2606:4700::/32",
    ]);
  });

  it("falls back to the safe default for an unusable value", () => {
    // A stray comma would otherwise produce an empty range list, i.e. "trust
    // nobody", and silently break the client IP for the whole deployment.
    expect(parseTrustProxy(",")).toBe(1);
  });
});
