import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  businessProfileSchema,
  businessUpdateSchema,
  complaintSubmissionSchema,
  insertArcoRequestSchema,
} from "./schema";

/**
 * Regression tests for the payload hardenings (mass assignment defense).
 *
 * A consumer or API-key client must never be able to pre-set the workflow
 * state, forge a provider response, or mint itself a paid plan.
 */

describe("complaintSubmissionSchema - public intake hardening", () => {
  const validSubmission = {
    businessId: "11111111-1111-4111-8111-111111111111",
    establishmentId: "22222222-2222-4222-8222-222222222222",
    complaintType: "reclamo",
    consumerFullName: "Juana Pérez",
    consumerDocumentType: "DNI",
    consumerDocumentNumber: "12345678",
    consumerAddress: "Av. Siempre Viva 123",
    consumerPhone: "999888777",
    consumerEmail: "juana@example.com",
    productServiceName: "Producto",
    complaintDetail: "El producto llegó dañado",
  };

  it("accepts a legitimate consumer submission", () => {
    const parsed = complaintSubmissionSchema.parse(validSubmission);
    expect(parsed.consumerFullName).toBe("Juana Pérez");
    expect(parsed.businessId).toBe(validSubmission.businessId);
  });

  it("strips staff workflow fields (status, priority, assignee)", () => {
    const parsed = complaintSubmissionSchema.parse({
      ...validSubmission,
      status: "resolved",
      priority: "urgent",
      assignedToUserId: "33333333-3333-4333-8333-333333333333",
    }) as Record<string, unknown>;

    expect(parsed.status).toBeUndefined();
    expect(parsed.priority).toBeUndefined();
    expect(parsed.assignedToUserId).toBeUndefined();
  });

  it("strips a forged provider response", () => {
    const parsed = complaintSubmissionSchema.parse({
      ...validSubmission,
      providerResponse: "Respuesta inventada por el consumidor",
      responseDate: "2026-01-01T00:00:00.000Z",
      providerActions: "Acciones inventadas",
      isOverdue: false,
      archivedAt: "2026-01-01T00:00:00.000Z",
      aiSuggestedResponse: "inyectado",
    }) as Record<string, unknown>;

    expect(parsed.providerResponse).toBeUndefined();
    expect(parsed.responseDate).toBeUndefined();
    expect(parsed.providerActions).toBeUndefined();
    expect(parsed.isOverdue).toBeUndefined();
    expect(parsed.archivedAt).toBeUndefined();
    expect(parsed.aiSuggestedResponse).toBeUndefined();
  });

  it("still rejects an invalid businessId", () => {
    expect(() => complaintSubmissionSchema.parse({ ...validSubmission, businessId: "no-es-uuid" }))
      .toThrow(z.ZodError);
  });
});

describe("business payload schemas - commercial lifecycle protection", () => {
  const business = {
    ruc: "20123456789",
    businessName: "Empresa SAC",
    address: "Av. Siempre Viva 123",
    distrito: "Lima",
    provincia: "Lima",
    departamento: "Lima",
  };

  it("businessProfileSchema strips plan/subscription fields on signup", () => {
    const parsed = businessProfileSchema.parse({
      ...business,
      subscriptionPlan: "corporativo",
      subscriptionStatus: "active",
      trialEndsAt: "2027-01-01T00:00:00.000Z",
      planPeriod: "annual",
      currentPeriodEnd: "2028-01-01T00:00:00.000Z",
      isActive: false,
    }) as Record<string, unknown>;

    expect(parsed.businessName).toBe("Empresa SAC");
    expect(parsed.subscriptionPlan).toBeUndefined();
    expect(parsed.subscriptionStatus).toBeUndefined();
    expect(parsed.trialEndsAt).toBeUndefined();
    expect(parsed.planPeriod).toBeUndefined();
    expect(parsed.currentPeriodEnd).toBeUndefined();
    expect(parsed.isActive).toBeUndefined();
  });

  it("businessUpdateSchema cannot change the RUC or the plan", () => {
    const parsed = businessUpdateSchema.parse({
      businessName: "Empresa Renombrada",
      ruc: "20999999999",
      subscriptionPlan: "corporativo",
      isActive: true,
    }) as Record<string, unknown>;

    expect(parsed.businessName).toBe("Empresa Renombrada");
    expect(parsed.isActive).toBe(true);
    expect(parsed.ruc).toBeUndefined();
    expect(parsed.subscriptionPlan).toBeUndefined();
  });
});

describe("ARCO intake schema", () => {
  it("lets the caller submit its own data-rights request fields only", () => {
    const requestSchema = insertArcoRequestSchema.omit({
      status: true,
      response: true,
      responseDate: true,
      dueDate: true,
    });

    const parsed = requestSchema.parse({
      businessId: "11111111-1111-4111-8111-111111111111",
      requestType: "access",
      requesterName: "Juana Pérez",
      requesterEmail: "juana@example.com",
      requesterDocumentType: "DNI",
      requesterDocumentNumber: "12345678",
      requestDetail: "Solicito acceso a mis datos",
      status: "completed",
      response: "resuelto",
    }) as Record<string, unknown>;

    expect(parsed.requesterName).toBe("Juana Pérez");
    expect(parsed.status).toBeUndefined();
    expect(parsed.response).toBeUndefined();
  });
});