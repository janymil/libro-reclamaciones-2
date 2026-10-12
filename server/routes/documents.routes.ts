import type { Express } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { pdfService } from "../services/pdfService";
import { requireAuth } from "../middleware/requireAuth";
import { hasFeature } from "../services/subscriptionService";

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

  // Anexo II of DS 011-2011-PCM: print-ready blank "hoja de reclamación"
  // (Phase 1.4). Print it for consumers who prefer the physical format.
  app.get('/api/documents/anexo-ii', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const pdf = await pdfService.generateAnexoRegistroForm(business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="anexo-ii-hoja-de-reclamacion.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating Anexo II form:', error);
      res.status(500).json({ message: "No se pudo generar el formato Anexo II" });
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

  // Update the per-business templates and AI brand voice (Phase 2.8 / 3.10).
  // The customizable fields are whitelisted; the plan gates the template
  // fields behind Profesional, while the AI voice is available to everyone
  // with AI drafting.
  const customizationSchema = z.object({
    brandColor: z.string().max(20).nullable().optional(),
    emailSubjectPrefix: z.string().max(120).nullable().optional(),
    emailHeaderText: z.string().max(2000).nullable().optional(),
    emailFooterText: z.string().max(2000).nullable().optional(),
    confirmationMessage: z.string().max(2000).nullable().optional(),
    brandTone: z.string().max(2000).nullable().optional(),
    brandPolicies: z.string().max(5000).nullable().optional(),
  });

  app.patch('/api/libro-configuration', requireAuth, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede cambiar la personalización" });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      if (!config) {
        return res.status(404).json({ message: "Primero configure su Libro de Reclamaciones" });
      }

      const updates = customizationSchema.parse(req.body);

      // Template/branding fields are a Profesional feature; the AI brand voice
      // is available to any plan with AI drafting
      const templateKeys = ['brandColor', 'emailSubjectPrefix', 'emailHeaderText', 'emailFooterText', 'confirmationMessage'];
      const touchesTemplates = templateKeys.some((key) => updates[key as keyof typeof updates] !== undefined);
      if (touchesTemplates && !(await hasFeature(req.user.businessId, 'templates'))) {
        return res.status(402).json({
          message: "Las plantillas personalizadas están disponibles a partir del plan Profesional.",
          code: "plan_upgrade_required",
        });
      }

      const updated = await storage.updateLibroConfiguration(config.id, updates);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating libro configuration:', error);
      res.status(500).json({ message: "No se pudo actualizar la configuración" });
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
