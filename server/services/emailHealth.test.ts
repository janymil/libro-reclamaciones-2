import { afterEach, describe, expect, it } from "vitest";

import { getEmailHealth, resetEmailHealthCache } from "./emailService";

/**
 * Email is the component that used to lie: the status page called it
 * "Operativo" when SMTP_USER/SMTP_PASSWORD merely existed. `getEmailHealth()`
 * must distinguish "not configured" from "configured but failing".
 */

const originalUser = process.env.SMTP_USER;
const originalPassword = process.env.SMTP_PASSWORD;

afterEach(() => {
  if (originalUser === undefined) {
    delete process.env.SMTP_USER;
  } else {
    process.env.SMTP_USER = originalUser;
  }
  if (originalPassword === undefined) {
    delete process.env.SMTP_PASSWORD;
  } else {
    process.env.SMTP_PASSWORD = originalPassword;
  }
  resetEmailHealthCache();
});

describe("getEmailHealth", () => {
  it("reports disabled, not degraded, when SMTP is not configured", () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    resetEmailHealthCache();

    expect(getEmailHealth()).toMatchObject({
      status: "disabled",
      configured: false,
      latencyMs: null,
    });
  });
});
