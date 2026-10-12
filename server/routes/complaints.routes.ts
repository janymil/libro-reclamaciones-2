import type { Express } from "express";
import { z } from "zod";

import { complaintSubmissionSchema, type InsertComplaint } from "@shared/schema";

import { emailService } from "../services/emailService";
import { similarityService } from "../services/similarityService";
import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";
import { intakeComplaint, IntakeError } from "../services/complaintIntakeService";
import { enforceQuota } from "../services/subscriptionService";
import { verifyCaptcha, isHoneypotTriggered } from "../services/captchaService";
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
      const complaint = await storage.getComplaint(req.params.id);

      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const businessComplaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const similar = await similarityService.findSimilarComplaints(complaint, businessComplaints);
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

  app.patch('/api/complaints/:id', requireAuth, async (req: any, res) => {
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
      
      // Send response to consumer if provided (with the business's templates)
      if (updates.providerResponse) {
        const config = await storage.getLibroConfiguration(complaint.businessId);
        await emailService.sendComplaintResponse(
          updatedComplaint.consumerEmail,
          updatedComplaint,
          updates.providerResponse,
          config
            ? {
                subjectPrefix: config.emailSubjectPrefix,
                headerText: config.emailHeaderText,
                footerText: config.emailFooterText,
              }
            : undefined,
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
  // Phase 1.5: every submission must pass the math CAPTCHA and leave the
  // honeypot field empty; the rate limits in middleware/rateLimits.ts still
  // apply. Phase 2.6: the business's monthly complaint quota is enforced.
  app.post('/api/public/complaints', async (req, res) => {
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

      // Quota (Phase 2.6)
      const quota = await enforceQuota(data.businessId, null, 'complaintsThisMonth');
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const { complaint } = await intakeComplaint(data);

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
