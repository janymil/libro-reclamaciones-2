import type { Complaint } from "@shared/schema";
import { businessDayCalculator } from "./businessDayCalculator";

/**
 * SLA-breach prediction for the 15-business-day legal response deadline
 * (DS 101-2022-PCM).
 *
 * Deterministic scoring (no AI call needed, so it is free and instant):
 *   - deadline pressure (business days remaining)
 *   - complaint priority
 *   - AI-assessed legal risk level
 *   - inactivity (still "new" after several business days)
 * The output ranks open complaints so staff can work the riskiest first.
 */

export interface SlaRiskAssessment {
  complaintId: string;
  correlativeNumber: string;
  consumerFullName: string;
  productServiceName: string | null;
  priority: string;
  status: string;
  businessDaysRemaining: number;
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  reasons: string[];
}

export function predictSlaRisk(complaint: Complaint, now: Date = new Date()): SlaRiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  const daysRemaining = businessDayCalculator.getRemainingBusinessDays(
    new Date(complaint.dueDate),
    now
  );

  if (daysRemaining <= 0) {
    score += 60;
    reasons.push('El plazo legal ya venció o vence hoy');
  } else if (daysRemaining <= 3) {
    score += 40;
    reasons.push(`Vence en ${daysRemaining} día(s) hábil(es)`);
  } else if (daysRemaining <= 7) {
    score += 20;
    reasons.push(`Vence en ${daysRemaining} días hábiles`);
  }

  if (complaint.priority === 'urgent') {
    score += 25;
    reasons.push('Prioridad urgente');
  } else if (complaint.priority === 'high') {
    score += 15;
    reasons.push('Prioridad alta');
  }

  if (complaint.aiRiskLevel === 'high') {
    score += 20;
    reasons.push('Riesgo legal alto (posible escalada a INDECOPI)');
  } else if (complaint.aiRiskLevel === 'medium') {
    score += 10;
    reasons.push('Riesgo legal medio');
  }

  const ageInBusinessDays = businessDayCalculator.getBusinessDaysBetween(
    new Date(complaint.submissionDate),
    now
  );

  if (complaint.status === 'new' && ageInBusinessDays >= 5) {
    score += 15;
    reasons.push(`Sin movimiento durante ${ageInBusinessDays} días hábiles`);
  }

  if (reasons.length === 0) {
    reasons.push('En plazo y sin factores de riesgo');
  }

  score = Math.min(100, score);
  const riskLevel: SlaRiskAssessment['riskLevel'] = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';

  return {
    complaintId: complaint.id,
    correlativeNumber: complaint.correlativeNumber,
    consumerFullName: complaint.consumerFullName,
    productServiceName: complaint.productServiceName,
    priority: complaint.priority,
    status: complaint.status,
    businessDaysRemaining: daysRemaining,
    riskLevel,
    score,
    reasons,
  };
}

/** Ranks a business's open complaints by SLA-breach risk (highest first). */
export function rankSlaRisk(complaints: Complaint[], now: Date = new Date()): SlaRiskAssessment[] {
  return complaints
    .map((complaint) => predictSlaRisk(complaint, now))
    .sort((a, b) => b.score - a.score);
}
