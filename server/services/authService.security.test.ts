import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Registration credential + session validation hardening.
 *
 * The password emailed to a new user must come from a CSPRNG: the previous
 * implementation used Math.random(), which is predictable and therefore an
 * account-takeover vector. The crypto spy below fails the test if the code
 * stops using crypto.randomInt.
 */

const h = vi.hoisted(() => {
  const state: any = { userById: undefined, userByEmail: undefined };
  const captured: {
    passwords: string[];
    verificationTokens: Array<{ userId: string; token: string; expires: Date }>;
    emailedVerificationTokens: string[];
    userInserts: any[];
  } = { passwords: [], verificationTokens: [], emailedVerificationTokens: [], userInserts: [] };
  const cryptoUsage = { randomIntCalls: 0 };
  return { state, captured, cryptoUsage };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomInt: (...args: any[]) => {
      h.cryptoUsage.randomIntCalls += 1;
      return (actual.randomInt as any)(...args);
    },
  };
});

vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: async () => h.state.userByEmail,
    getUserById: async () => h.state.userById,
    createUser: async (data: any) => {
      h.captured.userInserts.push(data);
      return { id: "new-user", ...data };
    },
    // Signup also issues the email-verification link through this writer.
    setEmailVerificationToken: async (userId: string, token: string, expires: Date) => {
      h.captured.verificationTokens.push({ userId, token, expires });
    },
    createAuthAuditLog: async (data: any) => data,
    createLoginAttempt: async (data: any) => data,
  },
}));

vi.mock("./emailService", () => ({
  emailService: {
    sendWelcomePassword: async (
      _email: string,
      _name: string,
      password: string,
      verificationToken?: string,
    ) => {
      h.captured.passwords.push(password);
      if (verificationToken) {
        h.captured.emailedVerificationTokens.push(verificationToken);
      }
    },
  },
}));

// bcrypt at cost 14 is far too slow to run dozens of times in a unit test and
// is irrelevant to the property under test.
vi.mock("bcrypt", () => ({
  default: {
    hash: async (value: string) => `hashed:${value}`,
    compare: async () => true,
  },
}));

import { authService } from "./authService";

beforeEach(() => {
  h.captured.passwords = [];
  h.captured.verificationTokens = [];
  h.captured.emailedVerificationTokens = [];
  h.captured.userInserts = [];
});

describe("registration passwords are generated with a CSPRNG", () => {
  it("uses crypto.randomInt for every generated password", async () => {
    h.cryptoUsage.randomIntCalls = 0;

    const result = await authService.registerUser(
      { firstName: "Juana", lastName: "Pérez", email: "juana@example.com" },
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(true);
    expect(h.cryptoUsage.randomIntCalls).toBeGreaterThan(0);
  });

  it("produces long, complex and unique passwords", async () => {
    for (let i = 0; i < 25; i++) {
      await authService.registerUser(
        { firstName: "User", lastName: String(i), email: `user${i}@example.com` },
        "127.0.0.1",
        "vitest",
      );
    }

    const passwords = h.captured.passwords;
    expect(passwords).toHaveLength(25);

    for (const password of passwords) {
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
    }

    // No collisions across 25 registrations.
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});

describe("signup confirms the mailbox it will notify", () => {
  it("issues a CSPRNG email-verification token bound to the new account", async () => {
    const result = await authService.registerUser(
      { firstName: "Juana", lastName: "Pérez", email: "juana@example.com" },
      "127.0.0.1",
      "vitest",
    );

    expect(result.success).toBe(true);

    // Exactly one token written, for the account just created: 32 bytes as hex.
    expect(h.captured.verificationTokens).toHaveLength(1);
    const issued = h.captured.verificationTokens[0];
    expect(issued.userId).toBe("new-user");
    expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    // ~24 hours out, so the link is never already expired when it is opened.
    expect(issued.expires.getTime()).toBeGreaterThan(Date.now());

    // The email carries exactly the stored token, which is what makes the
    // confirmation page able to consume it.
    expect(h.captured.emailedVerificationTokens).toEqual([issued.token]);
  });

  it("makes the new account the admin of its own tenant, explicitly", async () => {
    await authService.registerUser(
      { firstName: "Juana", lastName: "Pérez", email: "juana@example.com" },
      "127.0.0.1",
      "vitest",
    );

    // Never rely on a column DEFAULT here: on a database where users.role lost
    // its default, a signup with role NULL is locked out of every admin endpoint.
    expect(h.captured.userInserts[0].role).toBe("admin");
    expect(h.captured.userInserts[0].onboardingCompleted).toBe(false);
    expect(h.captured.userInserts[0].isEmailVerified).toBe(false);
  });
});

describe("validateSessionUser - revoked/disabled sessions", () => {
  it("rejects a deactivated account", async () => {
    h.state.userById = { id: "u1", isActive: false, password: "hash" };
    expect(await authService.validateSessionUser("u1")).toBeNull();
  });

  it("rejects a locked account", async () => {
    h.state.userById = {
      id: "u1",
      isActive: true,
      accountLockedUntil: new Date(Date.now() + 60_000),
      password: "hash",
    };
    expect(await authService.validateSessionUser("u1")).toBeNull();
  });

  it("returns the user without the password hash when the account is valid", async () => {
    h.state.userById = { id: "u1", isActive: true, accountLockedUntil: null, password: "hash" };

    const user = await authService.validateSessionUser("u1");
    expect(user).not.toBeNull();
    expect((user as any).password).toBeUndefined();
  });
});