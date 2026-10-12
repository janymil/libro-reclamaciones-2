import { describe, expect, it } from "vitest";
import type { Complaint } from "@shared/schema";

import { businessDayCalculator } from "./businessDayCalculator";
import { predictSlaRisk, rankSlaRisk } from "./slaPredictionService";
import { similarityService } from "./similarityService";

/**
 * Unit tests for the deterministic AI-adjacent services: SLA-breach
 * prediction and similar-complaint detection (local TF-IDF path, since no
 * AI_EMBEDDINGS_MODEL is configured in tests).
 */

function makeComplaint(overrides: Partial<Complaint>): Complaint {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    businessId: '00000000-0000-0000-0000-000000000010',
    correlativeNumber: '2026-0001',
    complaintType: 'reclamo',
    status: 'new',
    priority: 'normal',
    complaintDetail: 'detalle',
    submissionDate: new Date(),
    dueDate: businessDayCalculator.addBusinessDays(new Date(), 15),
    ...overrides,
  } as Complaint;
}

describe("predictSlaRisk", () => {
  it("marks a fresh complaint as low risk", () => {
    const assessment = predictSlaRisk(makeComplaint({}));

    expect(assessment.riskLevel).toBe('low');
    expect(assessment.score).toBe(0);
    expect(assessment.businessDaysRemaining).toBeGreaterThan(10);
  });

  it("marks an overdue complaint as high risk", () => {
    const assessment = predictSlaRisk(
      makeComplaint({ dueDate: businessDayCalculator.subtractBusinessDays(new Date(), 1) })
    );

    expect(assessment.riskLevel).toBe('high');
    expect(assessment.reasons.some((reason) => reason.includes('venció'))).toBe(true);
  });

  it("escalates urgency and legal risk", () => {
    const assessment = predictSlaRisk(
      makeComplaint({
        priority: 'urgent',
        aiRiskLevel: 'high',
        dueDate: businessDayCalculator.addBusinessDays(new Date(), 2),
      })
    );

    expect(assessment.riskLevel).toBe('high');
    expect(assessment.score).toBeGreaterThanOrEqual(60);
    expect(assessment.reasons).toContain('Prioridad urgente');
  });

  it("ranks the riskiest complaints first", () => {
    const ranked = rankSlaRisk([
      makeComplaint({ id: 'a', correlativeNumber: '2026-0001' }),
      makeComplaint({
        id: 'b',
        correlativeNumber: '2026-0002',
        priority: 'urgent',
        dueDate: businessDayCalculator.addBusinessDays(new Date(), 1),
      }),
    ]);

    expect(ranked[0].correlativeNumber).toBe('2026-0002');
  });
});

describe("similarityService.findSimilarComplaints", () => {
  it("finds related complaints and filters unrelated ones", async () => {
    const target = makeComplaint({
      id: 'target',
      complaintDetail: 'El delivery llegó tarde y la comida llegó fría. Pido un reembolso del pedido.',
      productServiceName: 'Delivery de comida',
    });

    const candidates = [
      makeComplaint({
        id: 'similar',
        correlativeNumber: '2026-0100',
        complaintDetail: 'Mi pedido de comida por delivery llegó con retraso y frío. Solicito reembolso.',
        productServiceName: 'Delivery de comida',
        status: 'resolved',
        providerResponse: 'Estimado cliente, le reembolsamos el pedido...',
      }),
      makeComplaint({
        id: 'unrelated',
        correlativeNumber: '2026-0101',
        complaintDetail: 'La facturación me cobró dos veces el mismo mes con recargos distintos.',
        productServiceName: 'Facturación',
      }),
    ];

    const matches = await similarityService.findSimilarComplaints(target, candidates);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].complaintId).toBe('similar');
    expect(matches[0].similarity).toBeGreaterThan(0.2);
    expect(matches[0].providerResponse).toContain('reembolsamos');
    expect(matches.find((match) => match.complaintId === 'unrelated')).toBeUndefined();
  });

  it("returns empty when there are no candidates", async () => {
    const target = makeComplaint({ id: 'target' });
    const matches = await similarityService.findSimilarComplaints(target, []);

    expect(matches).toEqual([]);
  });
});
