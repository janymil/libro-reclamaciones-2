import type { Express } from "express";
import { z } from "zod";

import { insertDataProcessingActivitySchema } from "@shared/schema";

import { pdfService } from "../services/pdfService";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../middleware/requireAuth";

/**
 * Legal compliance reporting and the RNPD activity register.
 */
export function registerComplianceRoutes(app: Express): void {
  // Compliance routes
  app.get('/api/compliance/report', requireAuth, async (req: any, res) => {
    try {
      const report = await storage.generateComplianceReport(req.user.businessId);
      res.json(report);
    } catch (error) {
      console.error('Error generating compliance report:', error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });

  app.get('/api/compliance/tracking', requireAuth, async (req: any, res) => {
    try {
      const tracking = await storage.getComplianceTracking(req.user.businessId);
      res.json(tracking);
    } catch (error) {
      console.error('Error fetching compliance tracking:', error);
      res.status(500).json({ message: "Failed to fetch compliance tracking" });
    }
  });

  // Data processing activities register (RNPD assistant)
  app.get('/api/data-processing-activities', requireAuth, async (req: any, res) => {
    try {
      const activities = await storage.getDataProcessingActivities(req.user.businessId);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching data processing activities:', error);
      res.status(500).json({ message: "Failed to fetch data processing activities" });
    }
  });

  // The RNPD register is a legal declaration of the business: admin only.
  app.post('/api/data-processing-activities', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const data = insertDataProcessingActivitySchema.parse({
        ...req.body,
        businessId: req.user.businessId,
      });

      const activity = await storage.createDataProcessingActivity(data);
      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating data processing activity:', error);
      res.status(500).json({ message: "Failed to create data processing activity" });
    }
  });

  // Compliance report as a downloadable PDF
  app.get('/api/compliance/report/download', requireAuth, async (req: any, res) => {
    try {
      const report = await storage.generateComplianceReport(req.user.businessId);
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const pdf = await pdfService.generateComplianceReportPdf(report, business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="reporte-cumplimiento.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating compliance report PDF:', error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });
}
