import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Self-service password recovery.
 *
 * Two properties matter here and are easy to regress:
 *
 *   1. `requestPasswordReset` must never reveal whether an address exists
 *      (account enumeration is the classic flaw of "forgot password"), and must
 *      never issue a reset link for a deactivated account.
 *   2. `resetPassword` must refuse missing/expired tokens and must persist the
 *      NEW password HASHED — the cleartext must never reach storage.
 */

const h = vi.hoisted(() => {
  const state: { userByEmail: any; userByToken: any } = {
    userByEmail: undefined,
    userByToken: undefined,
  };

  const calls = {
    tokensSet: [] as Array<{ email: string; token: string; expires: Date }>,
    emailsSent: [] as Array<{ email: string; firstName: string; token: string }>,
    completions: [] as Array<{ userId: string; hashedPassword: string }>,
    audit: [] as any[],
  };

  return { state, calls };
});

vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: async () => h.state.userByEmail,
    getUserByPasswordResetToken: async () => h.state.userByToken,
    setPasswordResetToken: async (email: string, token: string, expires: Date) => {
      h.calls.tokensSet.push({ email, token, expires });
    },
    completePasswordReset: async (userId: string, hashedPassword: string) => {
      h.calls.completions.push({ userId, hashedPassword });
    },
    createAuthAuditLog: async (data: any) => {
      h.calls.audit.push(data);
      return data;
    },
    createLoginAttempt: async (data: any) => data,
  },
}));

vi.mock("./emailService", () => ({
  emailService: {
    sendPasswordReset: async (email: string, firstName: string, token: string) => {
      h.calls.emailsSent.push({ email, firstName, token });
    },
  },
}));

// bcrypt at cost 14 is far too slow to run repeatedly in a unit test and is
// irrelevant to the properties under test.
vi.mock("bcrypt", () => ({
  default: {
    hash: async (value: string) => `hashed:${value}`,
    compare: async () => true,
  },
}));

import { authService } from "./authService";

const activeUser = {
  id: "u1",
  email: "juana@example.com",
  firstName: "Juana",
  isActive: true,
  passwordResetExpires: null as Date | null,
};

beforeEach(() => {
  h.state.userByEmail = undefined;
  h.state.userByToken = undefined;
  h.calls.tokensSet = [];
  h.calls.emailsSent = [];
  h.calls.completions = [];
  h.calls.audit = [];
});

describe("requestPasswordReset", () => {
  it("issues a CSPRNG token and emails the reset link for an active account", async () => {
    h.state.userByEmail = activeUser;

    await authService.requestPasswordReset("juana@example.com", "127.0.0.1", "vitest");

    expect(h.calls.tokensSet).toHaveLength(1);
    expect(h.calls.tokensSet[0].email).toBe("juana@example.com");
    // 32 random bytes rendered as hex => 64 chars, i.e. 256 bits of entropy.
    expect(h.calls.tokensSet[0].token).toMatch(/^[0-9a-f]{64}$/);
    expect(h.calls.tokensSet[0].expires.getTime()).toBeGreaterThan(Date.now());

    expect(h.calls.emailsSent).toHaveLength(1);
    expect(h.calls.emailsSent[0].token).toBe(h.calls.tokensSet[0].token);
  });

  it("does nothing observable for an unknown address (no enumeration oracle)", async () => {
    h.state.userByEmail = undefined;

    await expect(
      authService.requestPasswordReset("nadie@example.com", "127.0.0.1", "vitest"),
    ).resolves.toBeUndefined();

    expect(h.calls.tokensSet).toHaveLength(0);
    expect(h.calls.emailsSent).toHaveLength(0);
  });

  it("refuses to issue a reset link for a deactivated account", async () => {
    h.state.userByEmail = { ...activeUser, isActive: false };

    await authService.requestPasswordReset("juana@example.com", "127.0.0.1", "vitest");

    expect(h.calls.tokensSet).toHaveLength(0);
    expect(h.calls.emailsSent).toHaveLength(0);
  });

  it("swallows delivery failures instead of surfacing them to the caller", async () => {
    h.state.userByEmail = activeUser;

    const emailModule = await import("./emailService");
    const spy = vi
      .spyOn(emailModule.emailService, "sendPasswordReset")
      .mockRejectedValueOnce(new Error("SMTP down"));

    await expect(
      authService.requestPasswordReset("juana@example.com", "127.0.0.1", "vitest"),
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});

describe("resetPassword", () => {
  it("rejects an unknown token", async () => {
    h.state.userByToken = undefined;

    const result = await authService.resetPassword(
      "a".repeat(64),
      "NewPassw0rd!",
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(false);
    expect(h.calls.completions).toHaveLength(0);
  });

  it("rejects an expired token", async () => {
    h.state.userByToken = {
      ...activeUser,
      passwordResetExpires: new Date(Date.now() - 60_000),
    };

    const result = await authService.resetPassword(
      "a".repeat(64),
      "NewPassw0rd!",
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(false);
    expect(h.calls.completions).toHaveLength(0);
  });

  it("stores the new password HASHED and completes the reset", async () => {
    h.state.userByToken = {
      ...activeUser,
      passwordResetExpires: new Date(Date.now() + 60_000),
    };

    const result = await authService.resetPassword(
      "a".repeat(64),
      "NewPassw0rd!",
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(true);
    expect(h.calls.completions).toHaveLength(1);
    expect(h.calls.completions[0].userId).toBe("u1");
    expect(h.calls.completions[0].hashedPassword).toBe("hashed:NewPassw0rd!");
    // The cleartext password must never reach the data layer.
    expect(h.calls.completions[0].hashedPassword).not.toBe("NewPassw0rd!");
  });
});
