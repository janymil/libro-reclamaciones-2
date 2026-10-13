import { describe, it, expect, vi } from "vitest";

// The guard is pure; the data layer imported by this module is not needed.
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));

import { isSafeWebhookUrl, signPayload } from "./webhookService";

/**
 * Outgoing webhooks are fetched by this server with a customer-supplied URL,
 * so the URL must not be able to reach the internal network (SSRF).
 */
describe("isSafeWebhookUrl - SSRF guard", () => {
  it("accepts ordinary public https endpoints", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/libro")).toBe(true);
    expect(isSafeWebhookUrl("http://crm.acme.pe:8080/ingest")).toBe(true);
  });

  it("rejects loopback, private, link-local and metadata addresses", () => {
    for (const url of [
      "http://localhost:5000/api/status",
      "http://127.0.0.1/admin",
      "http://0.0.0.0/",
      "http://10.0.0.5/internal",
      "http://172.16.4.4/",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "http://100.64.0.1/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://vm.internal/",
      "http://printer.local/",
      "http://metadata.home.arpa/",
    ]) {
      expect(isSafeWebhookUrl(url), url).toBe(false);
    }
  });

  it("rejects non-http schemes and malformed URLs", () => {
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWebhookUrl("gopher://example.com/")).toBe(false);
    expect(isSafeWebhookUrl("not-a-url")).toBe(false);
  });
});

describe("signPayload", () => {
  it("is a stable HMAC-SHA256 of the body", () => {
    const signature = signPayload("secret", '{"a":1}');
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload("secret", '{"a":1}')).toBe(signature);
    expect(signPayload("other-secret", '{"a":1}')).not.toBe(signature);
  });
});