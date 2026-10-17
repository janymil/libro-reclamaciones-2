import type { Express } from "express";
import { z } from "zod";

import { complaintSubmissionSchema, type InsertComplaint } from "@shared/schema";

import { emailService } from "../services/emailService";
import { emailIdentityForBusiness } from "../services/emailIdentity";
import { similarityService } from "../services/similarityService";
import { storage } from "../storage";
import { requireAuth, requireStaff } from "../middleware/requireAuth";
import { publicComplaintLimiter } from "../middleware/rateLimits";
import { intakeComplaint, IntakeError } from "../services/complaintIntakeService";
import { enforceQuota, enforceComplaintType, hasFeature } from "../services/subscriptionService";
import { isBusinessPublished } from "../services/verificationService";
import { verifyCaptcha, isHoneypotTriggered, consumeCaptchaToken } from "../services/captchaService";
import { buildExpedienteZip } from "../services/expedienteService";

// Whitelisted fields a business user can change on an existing complaint.
const complaintUpdateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'responded', 'resolved', 'overdue']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  providerActions: z.string().max(5000).nullable().optional(),
  providerResponse: z.string().max(20000).nullable().optional(),
  responseMethod: z.enum(['email', 'letter', 'phone']).nullable().optional(),
});

/** 402 for the AI features that plans group under `aiDrafting` (Pro and up). */
const AI_DRAFTING_REQUIRED = {
  message:
    "Esta función de IA está disponible desde el plan Pro. Mejore su plan en \"Plan y Cuotas\".",
  code: "plan_upgrade_required",
};

/**
 * Complaints: listing, detail, updates, audit log and public submission.
 */
export function registerComplaintsRoutes(app: Express): void {
  // Complaints routes
  app.get('/api/complaints', requireAuth, async (req: any, res) => {
    try {
      const { status, type, priority, establishmentId, dateFrom, dateTo } = req.query;
      
      const filters = {
        status: status as string,
        type: type as string,
        priority: priority as string,
        establishmentId: establishmentId as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };
      
      const complaints = await storage.getComplaintsByBusiness(req.user.businessId, filters);
      res.json(complaints);
    } catch (error) {
      console.error('Error fetching complaints:', error);
      res.status(500).json({ message: "Failed to fetch complaints" });
    }
  });

  // Similar-complaint detection: surfaces past complaints of the same business
  // that resemble this one, so staff can reuse an already-sent response.
  app.get('/api/complaints/:id/similar', requireAuth, async (req: any, res) => {
    try {
      // Similar cases are part of the aiDrafting feature set in shared/plans.ts.
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const complaint = await storage.getComplaint(req.params.id);

      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const businessComplaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const similar = await similarityService.findSimilarComplaints(
        complaint,
        businessComplaints,
        5,
        {
          businessId: req.user.businessId,
          userId: req.user.id,
          feature: 'similar',
        },
      );
      res.json(similar);
    } catch (error) {
      console.error('Error finding similar complaints:', error);
      res.status(500).json({ message: "Failed to find similar complaints" });
    }
  });

  app.get('/api/complaints/:id', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }
      
      res.json(complaint);
    } catch (error) {
      console.error('Error fetching complaint:', error);
      res.status(500).json({ message: "Failed to fetch complaint" });
    }
  });

  app.patch('/api/complaints/:id', requireAuth, requireStaff, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);

      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const complaintUpdates = complaintUpdateSchema.safeParse(req.body);
      if (!complaintUpdates.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: complaintUpdates.error.errors });
      }

      const updates: Partial<InsertComplaint> = { ...complaintUpdates.data };

      // Cross-tenant relationship defense: the assignee must be an active
      // member of THIS business. Assigning another tenant's user would leak
      // the complaint (incl. consumer contact data) through that user's SLA
      // reminder/escalation emails and notifications.
      if (updates.assignedToUserId) {
        const assignee = await storage.getUserById(updates.assignedToUserId);
        if (!assignee || !assignee.isActive || assignee.businessId !== complaint.businessId) {
          return res.status(400).json({ message: "El usuario asignado no pertenece a su empresa" });
        }
      }

      // If providing a response, set response date and update status
      if (updates.providerResponse) {
        updates.responseDate = new Date();
        updates.status = updates.status ?? 'responded';
      }
      
      const updatedComplaint = await storage.updateComplaint(req.params.id, updates);
      
      // Log the update
      await storage.createAuditLog({
        complaintId: req.params.id,
        userId: req.user.id,
        action: 'complaint_updated',
        oldValues: complaint,
        newValues: updatedComplaint,
        notes: null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('User-Agent') ?? null,
      });
      
      // Send response to consumer if provided (with the business's templates and
      // its own identity: the consumer must see who is answering them).
      if (updates.providerResponse) {
        const config = await storage.getLibroConfiguration(complaint.businessId);
        await emailService.sendComplaintResponse(
          updatedComplaint.consumerEmail,
          updatedComplaint,
          updates.providerResponse,
          {
            subjectPrefix: config?.emailSubjectPrefix ?? null,
            headerText: config?.emailHeaderText ?? null,
            footerText: config?.emailFooterText ?? null,
            identity: await emailIdentityForBusiness(complaint.businessId),
          },
        );
      }
      
      res.json(updatedComplaint);
    } catch (error) {
      console.error('Error updating complaint:', error);
      res.status(500).json({ message: "Failed to update complaint" });
    }
  });

  app.get('/api/complaints/:id/audit', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      // Audit trail is an Empresarial feature (checked after ownership, so a
      // cross-tenant probe still gets 404 and never learns the plan).
      if (!(await hasFeature(req.user.businessId, 'auditLog'))) {
        return res.status(402).json({
          message: "El registro de auditoría está disponible en el plan Empresarial. Mejore su plan en \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }
      
      const auditLogs = await storage.getAuditLogsByComplaint(req.params.id);
      res.json(auditLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // INDECOPI expediente digital (Phase 1.3): one-click ZIP with the constancia
  // PDFs, the evidence files, the SIREC CSV and a timestamped manifest with a
  // verification code. Filterable by establishment, date range and type.
  app.get('/api/complaints/expediente/descargar', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const filters = {
        establishmentId: (req.query.establishmentId as string) || undefined,
        type: (req.query.type as string) || undefined,
        dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
        dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      };

      const complaints = await storage.getComplaintsByBusiness(req.user.businessId, {
        establishmentId: filters.establishmentId,
        type: filters.type,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      const { buffer, verificationCode } = await buildExpedienteZip({
        business,
        complaints,
        filters,
      });

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="expediente-indecopi-${stamp}.zip"`);
      res.setHeader('X-Verification-Code', verificationCode);
      res.send(buffer);
    } catch (error) {
      console.error('Error building expediente:', error);
      res.status(500).json({ message: "No se pudo generar el expediente" });
    }
  });

  // Public complaint submission (no auth required).
  //
  // Phase 1.5: every submission must pass the proof-of-work CAPTCHA (solved by
  // the visitor's browser while the form is filled in, so there is nothing to
  // read or type) and leave the honeypot field empty; the rate limits in
  // middleware/rateLimits.ts still apply. Phase 2.6: the business's monthly
  // complaint quota is enforced.
  app.post('/api/public/complaints', publicComplaintLimiter, async (req, res) => {
    try {
      const data = complaintSubmissionSchema.parse(req.body);

      // Honeypot: bots that fill the hidden "website" input are rejected
      // silently-ish (404 keeps them guessing).
      if (isHoneypotTriggered(req.body)) {
        return res.status(404).json({ message: "Recurso no encontrado" });
      }

      // CAPTCHA: the challenge is issued by GET /api/public/captcha
      const captcha = verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer);
      if (!captcha.ok) {
        return res.status(400).json({ message: captcha.reason, code: "captcha_invalid" });
      }

      // Published book? The tenant must have a confirmed notification mailbox
      // (verificationService.ts): recording a legal notice whose email nobody
      // can receive would start the response clock against the company without
      // it ever finding out.
      if (!(await isBusinessPublished(data.businessId))) {
        return res.status(403).json({
          message:
            "Este Libro de Reclamaciones aún no está publicado. La empresa debe confirmar su correo de notificaciones antes de recibir reclamos.",
          code: "libro_not_published",
        });
      }

      // Quota (Phase 2.6)
      const quota = await enforceQuota(data.businessId, null, 'complaintsThisMonth');
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      // Complaint-type gate: the Gratis plan accepts Reclamos only.
      const typeCheck = await enforceComplaintType(data.businessId, data.complaintType);
      if (!typeCheck.allowed) {
        return res.status(402).json({ message: typeCheck.reason, code: "complaint_type_not_allowed" });
      }

      // Lifetime gate: Gratis includes 5 complaints in total, not per month.
      const lifetime = await enforceQuota(data.businessId, null, 'complaintsTotal');
      if (!lifetime.allowed) {
        return res.status(402).json({ message: lifetime.reason, code: "quota_exceeded" });
      }

      const { complaint } = await intakeComplaint(data);

      // The challenge is single-use: burn it now that it produced a record.
      consumeCaptchaToken(req.body.captchaToken);

      res.json({
        success: true,
        complaintId: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        dueDate: complaint.dueDate,
      });
    } catch (error) {
      if (error instanceof IntakeError) {
        return res.status(error.status).json({ message: error.message });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating complaint:', error);
      res.status(500).json({ message: "Failed to create complaint" });
    }
  });
}
