import { getPeruYear } from "@shared/peru-time";
import type { Complaint, ComplaintSubmission } from "@shared/schema";
import { storage } from "../storage";
import { aiService } from "./aiService";
import { businessDayCalculator } from "./businessDayCalculator";
import { buildConsultUrl } from "./consultUrl";
import { emailService } from "./emailService";
import { emailIdentity } from "./emailIdentity";
import { readLogoBuffer } from "./logoService";
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

/**
 * Picks the first free correlative number (`YYYY-NNNN`) for a tenant.
 *
 * The previous implementation used `complaintCount + 1` directly, so two
 * concurrent submissions could be handed the same folio - a duplicate legal
 * identifier in the Libro. Here the candidate sequence is probed for
 * availability and advanced until a free slot is found.
 *
 * (A database unique constraint on (business_id, correlative_number) plus
 * retry-on-conflict is the complementary hardening; it needs a reviewed
 * migration, see migrations/manual/0004_tenant_integrity_hardening.sql.)
 */
export async function nextCorrelativeNumber(
  year: number,
  startingSequence: number,
  isTaken: (correlativeNumber: string) => Promise<boolean>,
  maxAttempts: number = 200,
): Promise<string> {
  let sequence = Number.isFinite(startingSequence) && startingSequence > 0
    ? Math.floor(startingSequence)
    : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `${year}-${sequence.toString().padStart(4, '0')}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
    sequence += 1;
  }

  // Pathological (200 consecutive folios taken): refuse rather than issue a
  // duplicate correlative. The consumer can retry immediately.
  throw new IntakeError(
    "No se pudo asignar un número correlativo libre en este momento. Intente nuevamente.",
    503,
  );
}

export async function intakeComplaint(data: ComplaintSubmission): Promise<IntakeResult> {
  const business = await storage.getBusiness(data.businessId);
  const establishment = await storage.getEstablishment(data.establishmentId);

  if (!business || !establishment || establishment.businessId !== business.id) {
    throw new IntakeError("Empresa o establecimiento no encontrado", 404);
  }

  // A closed local must not accept complaints, even from a printed QR or a cached
  // page: deactivating it in Sucursales is meant to take its book offline, which is
  // also the only way to stop a local that stopped serving the public.
  if (!establishment.isActive) {
    throw new IntakeError(
      "Este local ya no está recibiendo reclamos. Elige otro local o contacta a la empresa.",
      409,
    );
  }

  // Correlative number: year + first free running sequence for this tenant.
  const year = getPeruYear(new Date());
  const existingCount = (await storage.getComplaintsByBusiness(data.businessId)).length;
  const correlativeNumber = await nextCorrelativeNumber(
    year,
    existingCount + 1,
    (candidate) => storage.complaintCorrelativeExists(data.businessId, candidate),
  );

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

  // Per-business email templates (Phase 2.8), the business's own identity in the
  // message (logo, contact data, reply address) and AI brand voice (Phase 3.10).
  // The identity is always built: the consumer filed with the business, so even
  // an unconfigured tenant must not receive a platform-looking confirmation.
  const config = await storage.getLibroConfiguration(business.id);
  const customization = {
    subjectPrefix: config?.emailSubjectPrefix ?? null,
    headerText: config?.emailHeaderText ?? null,
    footerText: config?.emailFooterText ?? null,
    identity: emailIdentity(business, config),
  };
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
    // The same logo the email shows, so the printed constancia is recognizable
    // as coming from the business too.
    logo: config?.logoFileName ? readLogoBuffer(config.logoFileName) : null,
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

