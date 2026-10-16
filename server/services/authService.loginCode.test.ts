import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Code login ("entra con un código por email").
 *
 * The properties that matter: the code is never stored in clear, it is
 * single-use, a wrong code is counted (and burns the code after too many tries),
 * the failure counter and lockout are SHARED with the password path, and nothing
 * credential-shaped reaches the client. The endpoint must also answer the same
 * for known and unknown addresses.
 */

const h = vi.hoisted(() => {
  const state: {
    userByEmail: any;
    userById: any;
    recentFailed: number;
  } = { userByEmail: undefined, userById: undefined, recentFailed: 0 };

  const calls = {
    storedCodes: [] as Array<{ userId: string; codeHash: string; expires: Date }>,
    clearedCodes: [] as string[],
    failedCodeAttempts: [] as string[],
    incrementedFailures: [] as string[],
    resets: [] as string[],
    lastLogins: [] as string[],
    lockouts: [] as Array<{ userId: string; until: Date }>,
    emailedCodes: [] as Array<{ email: string; code: string; ttl: number }>,
    loginNotices: [] as string[],
    audits: [] as Array<{ event: string; email: string; reason?: string }>,
  };

  return { state, calls };
});

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ana@example.com",
  firstName: "Ana",
  password: "hashed:secret",
  role: "admin",
  businessId: "b1",
  isActive: true,
  isEmailVerified: false,
  failedLoginAttempts: 0,
  accountLockedUntil: null,
  loginCodeHash: null as string | null,
  loginCodeExpires: null as Date | null,
  loginCodeAttempts: 0,
  onboardingStep: 2,
  onboardingCompleted: true,
  ...overrides,
});

vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: async () => h.state.userByEmail,
    getUserById: async () => h.state.userById,
    getFailedLoginAttempts: async () => h.state.recentFailed,
    setLoginCode: async (userId: string, codeHash: string, expires: Date) => {
      h.calls.storedCodes.push({ userId, codeHash, expires });
    },
    clearLoginCode: async (userId: string) => {
      h.calls.clearedCodes.push(userId);
    },
    registerFailedLoginCodeAttempt: async (userId: string) => {
      h.calls.failedCodeAttempts.push(userId);
      return h.calls.failedCodeAttempts.filter((id) => id === userId).length;
    },
    incrementFailedLoginAttempts: async (userId: string) => {
      h.calls.incrementedFailures.push(userId);
    },
    resetFailedLoginAttempts: async (userId: string) => {
      h.calls.resets.push(userId);
    },
    updateLastLogin: async (userId: string) => {
      h.calls.lastLogins.push(userId);
    },
    lockUserAccount: async (userId: string, until: Date) => {
      h.calls.lockouts.push({ userId, until });
    },
    createAuthAuditLog: async (data: any) => {
      h.calls.audits.push({ event: data.eventType, email: data.email, reason: data.failureReason });
      return data;
    },
    createLoginAttempt: async (data: any) => data,
  },
}));

vi.mock("./emailService", () => ({
  emailService: {
    sendLoginCode: async (email: string, _name: string, code: string, ttl: number) => {
      h.calls.emailedCodes.push({ email, code, ttl });
    },
    sendLoginNotification: async (email: string) => {
      h.calls.loginNotices.push(email);
    },
    sendAccountLockedNotification: async () => undefined,
  },
}));

// Cost-14 bcrypt is far too slow for a unit test; the comparison still behaves
// like bcrypt (a hash only matches the value it was made from).
vi.mock("bcrypt", () => ({
  default: {
    hash: async (value: string) => `hashed:${value}`,
    compare: async (value: string, hash: string) => hash === `hashed:${value}`,
  },
}));

import { authService } from "./authService";

const validCode = { email: "ana@example.com", code: "123456" };

beforeEach(() => {
  h.state.userByEmail = undefined;
  h.state.userById = undefined;
  h.state.recentFailed = 0;
  h.calls.storedCodes = [];
  h.calls.clearedCodes = [];
  h.calls.failedCodeAttempts = [];
  h.calls.incrementedFailures = [];
  h.calls.resets = [];
  h.calls.lastLogins = [];
  h.calls.lockouts = [];
  h.calls.emailedCodes = [];
  h.calls.loginNotices = [];
  h.calls.audits = [];
});

describe("requestLoginCode", () => {
  it("stores a hashed code with a short expiry and emails the code itself", async () => {
    h.state.userByEmail = baseUser();

    await authService.requestLoginCode("ana@example.com", "127.0.0.1", "vitest");

    expect(h.calls.storedCodes).toHaveLength(1);
    const stored = h.calls.storedCodes[0];
    expect(stored.userId).toBe("u1");

    // Never the code in clear, and what was sent is a six-digit code.
    const emailed = h.calls.emailedCodes[0];
    expect(emailed.email).toBe("ana@example.com");
    expect(emailed.code).toMatch(/^\d{6}$/);
    expect(emailed.ttl).toBe(10);
    expect(stored.codeHash).toBe(`hashed:${emailed.code}`);
    expect(stored.codeHash).not.toBe(emailed.code);

    // Valid for minutes, not days.
    const minutes = (stored.expires.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(8);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it("answers the same for an unknown address: nothing stored, nothing sent", async () => {
    h.state.userByEmail = undefined;

    await expect(
      authService.requestLoginCode("nadie@example.com", "127.0.0.1", "vitest"),
    ).resolves.toBeUndefined();

    expect(h.calls.storedCodes).toHaveLength(0);
    expect(h.calls.emailedCodes).toHaveLength(0);
    // Still audited, so probing for accounts leaves a trail.
    expect(h.calls.audits.some((entry) => entry.reason === "no_active_account")).toBe(true);
  });

  it("sends no code to a deactivated account", async () => {
    h.state.userByEmail = baseUser({ isActive: false });

    await authService.requestLoginCode("ana@example.com", "127.0.0.1", "vitest");

    expect(h.calls.storedCodes).toHaveLength(0);
    expect(h.calls.emailedCodes).toHaveLength(0);
  });

  it("does not throw when the email fails to send", async () => {
    h.state.userByEmail = baseUser();
    const emailModule = await import("./emailService");
    const spy = vi
      .spyOn(emailModule.emailService, "sendLoginCode")
      .mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      authService.requestLoginCode("ana@example.com", "127.0.0.1", "vitest"),
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("loginWithCode", () => {
  const withValidCode = () =>
    baseUser({
      loginCodeHash: `hashed:${validCode.code}`,
      loginCodeExpires: new Date(Date.now() + 5 * 60_000),
    });

  it("consumes the code, resets the counters and returns no credential material", async () => {
    h.state.userByEmail = withValidCode();

    const result = await authService.loginWithCode(validCode, "127.0.0.1", "vitest");

    expect(result.success).toBe(true);
    expect(h.calls.clearedCodes).toEqual(["u1"]);
    expect(h.calls.resets).toEqual(["u1"]);
    expect(h.calls.lastLogins).toEqual(["u1"]);
    expect(h.calls.loginNotices).toEqual(["ana@example.com"]);

    // The session payload must carry neither the password nor the code.
    const returned = result.user as Record<string, unknown>;
    expect(returned).toBeDefined();
    expect(returned.password).toBeUndefined();
    expect(returned.loginCodeHash).toBeUndefined();
    expect(returned.loginCodeExpires).toBeUndefined();
  });

  it("counts a wrong code against both counters and asks for a new one", async () => {
    h.state.userByEmail = withValidCode();

    const result = await authService.loginWithCode(
      { email: validCode.email, code: "000000" },
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Solicita uno nuevo");
    expect(h.calls.failedCodeAttempts).toEqual(["u1"]);
    expect(h.calls.incrementedFailures).toEqual(["u1"]);
    expect(h.calls.resets).toEqual([]);
    expect(h.calls.clearedCodes).toEqual([]);
  });

  it("burns the code after five wrong tries", async () => {
    h.state.userByEmail = withValidCode();

    for (let attempt = 0; attempt < 5; attempt++) {
      await authService.loginWithCode(
        { email: validCode.email, code: "000000" },
        "127.0.0.1",
        "vitest",
      );
    }

    expect(h.calls.failedCodeAttempts).toHaveLength(5);
    expect(h.calls.clearedCodes).toEqual(["u1"]);
  });

  it("locks the account at the shared limit and clears the code", async () => {
    h.state.userByEmail = { ...withValidCode(), failedLoginAttempts: 4 };

    const result = await authService.loginWithCode(
      { email: validCode.email, code: "000000" },
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(false);
    expect(h.calls.lockouts).toHaveLength(1);
    expect(h.calls.lockouts[0].userId).toBe("u1");
    expect(h.calls.clearedCodes).toEqual(["u1"]);
  });

  it("refuses an expired code", async () => {
    h.state.userByEmail = baseUser({
      loginCodeHash: `hashed:${validCode.code}`,
      loginCodeExpires: new Date(Date.now() - 60_000),
    });

    const result = await authService.loginWithCode(validCode, "127.0.0.1", "vitest");

    expect(result.success).toBe(false);
    expect(h.calls.resets).toEqual([]);
    expect(h.calls.lastLogins).toEqual([]);
  });

  it("refuses when no code was ever requested", async () => {
    h.state.userByEmail = baseUser();

    const result = await authService.loginWithCode(validCode, "127.0.0.1", "vitest");

    expect(result.success).toBe(false);
  });

  it("respects the shared lockout before even looking at the code", async () => {
    h.state.userByEmail = baseUser({
      loginCodeHash: `hashed:${validCode.code}`,
      loginCodeExpires: new Date(Date.now() + 5 * 60_000),
      accountLockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    const result = await authService.loginWithCode(validCode, "127.0.0.1", "vitest");

    expect(result.success).toBe(false);
    expect(result.message).toContain("bloqueada");
    expect(h.calls.lastLogins).toEqual([]);
  });

  it("rate limits when the recent failures reach the shared maximum", async () => {
    h.state.recentFailed = 5;
    h.state.userByEmail = withValidCode();

    const result = await authService.loginWithCode(validCode, "127.0.0.1", "vitest");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Demasiados intentos");
  });
});

describe("validateSessionUser", () => {
  it("strips the password and the login code before the row becomes req.user", async () => {
    h.state.userById = baseUser({
      loginCodeHash: "hashed:123456",
      loginCodeExpires: new Date(Date.now() + 60_000),
    });

    const sessionUser = (await authService.validateSessionUser("u1")) as Record<string, unknown>;

    expect(sessionUser.email).toBe("ana@example.com");
    expect(sessionUser.password).toBeUndefined();
    expect(sessionUser.loginCodeHash).toBeUndefined();
    expect(sessionUser.loginCodeExpires).toBeUndefined();
  });
});
