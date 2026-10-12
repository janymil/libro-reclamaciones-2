import { getPeruYear } from "@shared/peru-time";
import type { Complaint, ComplaintSubmission } from "@shared/schema";
import { storage } from "../storage";
import { aiService } from "./aiService";
import { businessDayCalculator } from "./businessDayCalculator";
import { buildConsultUrl } from "./consultUrl";
import { emailService } from "./emailService";
import { pdfService } from "./pdfService";
import { routingService } from "./routingService";
import { complaintCreatedPayload, dispatchWebhookEvent } from "./webhookService";

/**
 * Shared complaint intake (Phases 2.6, 2.8 and 3.12).
 *
 * One code path for every intake channel:
 *   - the public form (POST /api/public/complaints, with CAPTCHA),
 *   - the REST API for CRM/ERP (POST /api/v1/complaints, with an API key).
 *
 * Quota enforcement happens in the routes (they have different response
 * formats); everything after that - correlative, SLA due date, baseline
 * classification, background AI enrichment, constancia email with the
 * business's templates, notification and webhooks - lives here.
 */

export interface IntakeResult {
  complaint: Complaint;
  correlativeNumber: string;
}

export class IntakeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function intakeComplaint(data: ComplaintSubmission): Promise<IntakeResult> {
  const business = await storage.getBusiness(data.businessId);
  const establishment = await storage.getEstablishment(data.establishmentId);

  if (!business || !establishment || establishment.businessId !== business.id) {
    throw new IntakeError("Empresa o establecimiento no encontrado", 404);
  }

  // Correlative number: year + running count
  const year = getPeruYear(new Date());
  const count = (await storage.getComplaintsByBusiness(data.businessId)).length + 1;
  const correlativeNumber = `${year}-${count.toString().padStart(4, '0')}`;

  // 15-business-day legal deadline (Peru calendar, holidays included)
  const dueDate = businessDayCalculator.addBusinessDays(new Date(), 15);

  // Baseline classification: instant local heuristics so the intake is never
  // blocked by an upstream AI call (same behavior as the original route).
  const baseline = aiService.classifyComplaintLocally(data.complaintDetail);

  const complaint = await storage.createComplaint({
    ...data,
    correlativeNumber,
    dueDate,
    submissionDate: new Date(),
    status: 'new',
    priority: baseline.priority,
    aiClassification: baseline,
    aiRiskLevel: baseline.riskLevel,
  });

  // Per-business email templates (Phase 2.8) and AI brand voice (Phase 3.10)
  const config = await storage.getLibroConfiguration(business.id);
  const customization = config
    ? {
        subjectPrefix: config.emailSubjectPrefix,
        headerText: config.emailHeaderText,
        footerText: config.emailFooterText,
      }
    : undefined;
  const brandContext = config
    ? { brandTone: config.brandTone, brandPolicies: config.brandPolicies }
    : undefined;

  // Background AI enrichment with the business's brand voice (Phase 3.10)
  void aiService
    .classifyComplaint(data.complaintDetail)
    .then(async (aiAnalysis) => {
      const current = await storage.getComplaint(complaint.id);
      if (!current || current.status !== 'new' || current.assignedToUserId) {
        return; // staff already picked it up; don't overwrite their work
      }

      if (aiAnalysis.source === 'ai') {
        // Brand-voiced draft: regenerate the suggestion with the business's
        // tone/policies when configured, otherwise keep the classifier's draft
        let suggestedResponse = aiAnalysis.suggestedResponse ?? null;
        if (suggestedResponse && (brandContext?.brandTone || brandContext?.brandPolicies)) {
          const branded = await aiService.suggestResponse(
            `${data.complaintDetail}\n\nPedido del consumidor: ${data.consumerRequest ?? 'No especificado'}`,
            data.complaintType as 'reclamo' | 'queja',
            brandContext,
          );
          if (branded.source === 'ai') {
            suggestedResponse = branded.suggestion;
          }
        }

        await storage.updateComplaint(complaint.id, {
          priority: aiAnalysis.priority,
          aiClassification: aiAnalysis,
          aiSuggestedResponse: suggestedResponse,
          aiRiskLevel: aiAnalysis.riskLevel,
        });
      }

      // Auto-assignment by category, load-balanced among active staff
      const assignee = await routingService.autoAssign(complaint, aiAnalysis.category);
      if (assignee) {
        await storage.updateComplaint(complaint.id, { assignedToUserId: assignee.userId });
        await storage.createNotification({
          businessId: data.businessId,
          type: 'complaint_assigned',
          title: 'Reclamación asignada automáticamente',
          message: `${complaint.correlativeNumber} (categoría: ${aiAnalysis.category}) fue asignada a ${assignee.userName}.`,
          relatedEntityType: 'complaint',
          relatedEntityId: complaint.id,
        });
      }
    })
    .catch((error) => console.error('Background AI enrichment failed:', error));

  // Constancia PDF + confirmation email (with per-business templates).
  // The constancia carries a verification code and a QR to the public status
  // page so the consumer can track the complaint without calling.
  const confirmationPdf = await pdfService.generateComplaintConfirmation(complaint, business, establishment, {
    consultUrl: buildConsultUrl(config?.urlSlug, complaint.correlativeNumber),
  });

  await emailService.sendComplaintConfirmation(
    data.consumerEmail,
    complaint,
    confirmationPdf,
    customization,
  );

  // In-app notification for the business
  await storage.createNotification({
    businessId: data.businessId,
    type: 'complaint_new',
    title: 'Nueva reclamación recibida',
    message: `Se ha recibido una nueva ${data.complaintType} de ${data.consumerFullName}`,
    relatedEntityType: 'complaint',
    relatedEntityId: complaint.id,
  });

  // Webhooks (Corporativo) - fire and forget
  void dispatchWebhookEvent(business.id, 'complaint.created', complaintCreatedPayload(complaint)).catch(() => {});

  return { complaint, correlativeNumber };
}

