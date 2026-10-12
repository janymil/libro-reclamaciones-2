import type { Express } from "express";

import { storage } from "../storage";
import { pdfService } from "../services/pdfService";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Generated legal documents and the public Libro configuration.
 */
export function registerDocumentsRoutes(app: Express): void {
  // Legal document generation routes
  app.get('/api/documents/complaint-notice', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      
      const noticePdf = await pdfService.generateComplaintNotice(business);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="aviso-libro-reclamaciones.pdf"');
      res.send(noticePdf);
    } catch (error) {
      console.error('Error generating complaint notice:', error);
      res.status(500).json({ message: "Failed to generate complaint notice" });
    }
  });

  // Libro configuration of the authenticated business. Used to build the public
  // URL and the QR code of the Libro de Reclamaciones.
  app.get('/api/libro-configuration', requireAuth, async (req: any, res) => {
    try {
      const config = await storage.getLibroConfiguration(req.user.businessId);
      res.json(config ?? null);
    } catch (error) {
      console.error('Error fetching libro configuration:', error);
      res.status(500).json({ message: "Failed to fetch libro configuration" });
    }
  });

  // Privacy policy draft (Ley 29733 / DS 016-2024-JUS)
  app.get('/api/documents/privacy-policy', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const pdf = await pdfService.generatePrivacyPolicy(business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="politica-privacidad.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating privacy policy:', error);
      res.status(500).json({ message: "Failed to generate privacy policy" });
    }
  });

  // Registro de Actividades de Tratamiento (RNPD)
  app.get('/api/documents/rnpd-register', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const activities = await storage.getDataProcessingActivities(req.user.businessId);
      const pdf = await pdfService.generateRnpdRegister(activities, business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="registro-actividades-tratamiento.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating RNPD register:', error);
      res.status(500).json({ message: "Failed to generate RNPD register" });
    }
  });
}
