import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

import { startTestApp, call } from "../test/routeTestHarness";
import { registerWhatsAppRoutes } from "./whatsapp.routes";

/**
 * WhatsApp webhook security.
 *
 * The endpoint is unauthenticated by necessity (Meta calls it), so the verify
 * token and the `X-Hub-Signature-256` HMAC are the only things standing between
 * a public URL and a per-conversation billing/notification path.
 */
describe("WhatsApp webhook", () => {
  let app: { url: string; close: () => Promise<void> };
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    app = await startTestApp(registerWhatsAppRoutes);
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it("echoes the challenge for Meta's subscription handshake", async () => {
    const response = await call(
      app.url,
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444",
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe(1158201444);
  });

  it("rejects a wrong verify token", async () => {
    const response = await call(
      app.url,
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1",
    );

    expect(response.status).toBe(403);
  });

  it("rejects an unsigned payload once the app secret is configured", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };

    const response = await call(app.url, "/api/whatsapp/webhook", { method: "POST", body: payload });

    expect(response.status).toBe(401);
  });

  it("rejects a payload signed with a different secret", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const forged = `sha256=${createHmac("sha256", "not-the-secret").update(JSON.stringify(payload)).digest("hex")}`;

    const response = await call(app.url, "/api/whatsapp/webhook", {
      method: "POST",
      body: payload,
      headers: { "x-hub-signature-256": forged },
    });

    expect(response.status).toBe(401);
  });

  it("accepts a correctly signed payload and always acks", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const signature = `sha256=${createHmac("sha256", "app-secret").update(JSON.stringify(payload)).digest("hex")}`;

    const response = await call(app.url, "/api/whatsapp/webhook", {
      method: "POST",
      body: payload,
      headers: { "x-hub-signature-256": signature },
    });

    expect(response.status).toBe(200);
  });

  it("accepts unsigned payloads only while no app secret is configured (local dev)", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const payload = { object: "whatsapp_business_account", entry: [] };

    const response = await call(app.url, "/api/whatsapp/webhook", { method: "POST", body: payload });

    expect(response.status).toBe(200);
  });
});
