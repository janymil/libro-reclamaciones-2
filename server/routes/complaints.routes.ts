import type { Express } from "express";
import { z } from "zod";

import { complaintSubmissionSchema, type InsertComplaint } from "@shared/schema";

import { aiService } from "../services/aiService";
import { businessDayCalculator } from "../services/businessDayCalculator";
import { emailService } from "../services/emailService";
import { pdfService } from "../services/pdfService";
import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

const complaintFormSchema = complaintSubmissionSchema;

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
      
      // Send response to consumer if provided
      if (updates.providerResponse) {
        await emailService.sendComplaintResponse(
          updatedComplaint.consumerEmail,
          updatedComplaint,
          updates.providerResponse
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

  // Public complaint submission (no auth required)
  app.post('/api/public/complaints', async (req, res) => {
    try {
      const data = complaintFormSchema.parse(req.body);
      
      // Get business and establishment
      const business = await storage.getBusiness(data.businessId);
      const establishment = await storage.getEstablishment(data.establishmentId);
      
      if (!business || !establishment || establishment.businessId !== business.id) {
        return res.status(404).json({ message: "Business or establishment not found" });
      }
      
      // Generate correlative number
      const year = new Date().getFullYear();
      const count = (await storage.getComplaintsByBusiness(data.businessId)).length + 1;
      const correlativeNumber = `${year}-${count.toString().padStart(4, '0')}`;
      
      // Calculate due date (15 business days)
      const dueDate = businessDayCalculator.addBusinessDays(new Date(), 15);
      
      // AI classification
      const aiAnalysis = await aiService.classifyComplaint(data.complaintDetail);
      
      const complaint = await storage.createComplaint({
        ...data,
        correlativeNumber,
        dueDate,
        submissionDate: new Date(),
        status: 'new',
        priority: aiAnalysis.priority || 'normal',
        aiClassification: aiAnalysis,
        aiSuggestedResponse: aiAnalysis.suggestedResponse,
        aiRiskLevel: aiAnalysis.riskLevel,
      });
      
      // Generate and send confirmation PDF
      const confirmationPdf = await pdfService.generateComplaintConfirmation(complaint, business, establishment);
      
      await emailService.sendComplaintConfirmation(
        data.consumerEmail,
        complaint,
        confirmationPdf
      );
      
      // Create notification for business
      await storage.createNotification({
        businessId: data.businessId,
        type: 'complaint_new',
        title: 'Nueva reclamación recibida',
        message: `Se ha recibido una nueva ${data.complaintType} de ${data.consumerFullName}`,
        relatedEntityType: 'complaint',
        relatedEntityId: complaint.id,
      });
      
      res.json({
        success: true,
        complaintId: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        dueDate: complaint.dueDate,
      });
    } catch (error) {
      console.error('Error creating complaint:', error);
      res.status(500).json({ message: "Failed to create complaint" });
    }
  });
}
