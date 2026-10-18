import { describe, it, expect, vi } from "vitest";

// This test only exercises pure functions; the data layer is not needed.
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));
vi.mock("./subscriptionService", () => ({ hasFeature: vi.fn() }));

import {
  MAX_WEBHOOK_ATTEMPTS,
  WEBHOOK_EVENTS,
  buildWebhookPayload,
  isWebhookEvent,
  webhookRetryDelayMs,
} from "./webhookService";
import { buildOpenApiDocument } from "../openapi";

const complaint = {
  id: "8f14e45f-ea4b-4c9a-9b1e-2b6f5f2d3a10",
  businessId: "b1",
  establishmentId: "e1",
  correlativeNumber: "2026-0001",
  complaintType: "reclamo",
  consumerFullName: "Juan Pérez",
  consumerDocumentType: "DNI",
  consumerDocumentNumber: "12345678",
  consumerAddress: "Av. Siempre Viva 123",
  consumerPhone: "999888777",
  consumerEmail: "juan@example.com",
  guardianFullName: null,
  guardianDocumentType: null,
  guardianDocumentNumber: null,
  guardianRelationship: null,
  productServiceName: "Laptop",
  productServiceDescription: null,
  purchaseAmount: "149.90",
  purchaseDate: null,
  receiptNumber: null,
  complaintDetail: "Pantalla rota",
  consumerRequest: "Cambio",
  status: "new",
  priority: "normal",
  assignedToUserId: null,
  providerActions: null,
  providerResponse: null,
  responseDate: null,
  responseMethod: null,
  submissionDate: new Date("2026-10-01T00:00:00Z"),
  dueDate: new Date("2026-10-22T00:00:00Z"),
  isOverdue: false,
  archivedAt: null,
  retentionPurgedAt: null,
  aiClassification: null,
  aiSuggestedResponse: null,
  aiRiskLevel: null,
  attachments: null,
  consentGiven: true,
  privacyPolicyVersion: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
} as any;

describe("webhook retry policy", () => {
  it("backs off exponentially and caps at the last delay", () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(2)).toBe(5 * 60_000);
    expect(webhookRetryDelayMs(3)).toBe(30 * 60_000);
    expect(webhookRetryDelayMs(4)).toBe(2 * 60 * 60_000);
    expect(webhookRetryDelayMs(5)).toBe(2 * 60 * 60_000);
    expect(webhookRetryDelayMs(99)).toBe(2 * 60 * 60_000);
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(5);
  });

  it("knows the supported events", () => {
    expect(WEBHOOK_EVENTS).toEqual([
      "complaint.created",
      "complaint.updated",
      "complaint.responded",
    ]);
    expect(isWebhookEvent("complaint.created")).toBe(true);
    expect(isWebhookEvent("complaint.deleted")).toBe(false);
  });
});

describe("webhook payload PII opt-out", () => {
  it("includes the consumer block by default", () => {
    const payload = buildWebhookPayload("complaint.created", complaint);
    expect(payload.event).toBe("complaint.created");
    expect(payload.data.consumer).toMatchObject({
      fullName: "Juan Pérez",
      documentNumber: "12345678",
      email: "juan@example.com",
    });
    expect(payload.data.hasConsumerData).toBe(true);
  });

  it("omits the consumer block when the receiver opted out", () => {
    const payload = buildWebhookPayload("complaint.created", complaint, false);
    expect(payload.data).not.toHaveProperty("consumer");
    expect(payload.data.hasConsumerData).toBe(false);
    // Operational fields stay so the receiver can still fetch the detail.
    expect(payload.data.id).toBe(complaint.id);
    expect(payload.data.correlativeNumber).toBe("2026-0001");
  });
});

describe("OpenAPI document", () => {
  it("documents every public endpoint and the bearer scheme", () => {
    const document = buildOpenApiDocument("https://librodigital.pe") as any;

    expect(document.components.securitySchemes.ApiKeyBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    for (const path of [
      "/api/v1/establishments",
      "/api/v1/complaints",
      "/api/v1/complaints/{id}",
      "/api/v1/complaints/{id}/response",
      "/api/v1/complaints/{id}/attachments",
      "/api/v1/attachments/{id}/file",
      "/api/v1/ping",
      "/api/v1/openapi.json",
    ]) {
      expect(document.paths[path], path).toBeDefined();
    }
    expect(document.servers[0].url).toBe("https://librodigital.pe");
  });
});
