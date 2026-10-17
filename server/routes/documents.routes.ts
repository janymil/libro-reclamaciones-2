import type { Express } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { pdfService } from "../services/pdfService";
import { requireAuth } from "../middleware/requireAuth";
import { hasFeature } from "../services/subscriptionService";
import { emailIdentity } from "../services/emailIdentity";
import { deleteLogo, logoUpload, saveLogo } from "../services/logoService";
import { privacyPolicyUrlSchema } from "@shared/privacy-policy";

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

  // Print-ready blank "hoja de reclamación" with the Anexo I fields (Phase 1.4).
  // The endpoint name is historical: the hoja is Anexo I and the aviso is
  // Anexo II, so the labels the user sees say "Anexo I".
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
      console.error('Error generating the Anexo I form:', error);
      res.status(500).json({ message: "No se pudo generar la hoja de reclamación" });
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
    // Legal link (Ley 29733) used by the consent checkbox of the public form.
    // Not a template: a consumer must be able to open the privacy policy on
    // every plan, so it carries no plan gate. Empty clears it, absent leaves it.
    privacyPolicyUrl: privacyPolicyUrlSchema,
    // Sales channel. Not a template, so it carries no plan gate: it only decides
    // which guidance the Integraciones page shows (website vs social profiles),
    // and it is editable here because onboarding may have guessed wrong.
    businessType: z.enum(['tienda_virtual', 'local_fisico', 'servicios', 'mixto']).optional(),
    // Sender identity of the consumer-facing emails (Phase 2.8b). The display
    // name and the reply address are baseline - the consumer filed with the
    // business, so the message must name it and an answer must reach it. Only a
    // FROM address of the business's own needs its domain verified by the mail
    // host (see shared/email-identity.ts), so only that one carries a plan gate.
    emailFromName: z.string().max(120).nullable().optional(),
    emailFromAddress: z.string().max(255).nullable().optional(),
    emailReplyTo: z.string().max(255).nullable().optional(),
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

      // Template/branding fields are a Pro feature; the AI brand voice ships
      // with AI drafting, which also starts at Pro.
      const templateKeys = ['brandColor', 'emailSubjectPrefix', 'emailHeaderText', 'emailFooterText', 'confirmationMessage'];
      const touchesTemplates = templateKeys.some((key) => updates[key as keyof typeof updates] !== undefined);
      if (touchesTemplates && !(await hasFeature(req.user.businessId, 'templates'))) {
        return res.status(402).json({
          message: "Las plantillas personalizadas están disponibles a partir del plan Pro.",
          code: "plan_upgrade_required",
        });
      }

      const voiceKeys = ['brandTone', 'brandPolicies'];
      const touchesBrandVoice = voiceKeys.some((key) => updates[key as keyof typeof updates] !== undefined);
      if (touchesBrandVoice && !(await hasFeature(req.user.businessId, 'brandTone'))) {
        return res.status(402).json({
          message: "El tono de marca para la IA está disponible desde el plan Pro. Mejore su plan en \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      // A FROM address of the business's own is part of the branded-email set,
      // which starts at Pro (the platform must also verify the domain first).
      if (updates.emailFromAddress !== undefined && !(await hasFeature(req.user.businessId, 'templates'))) {
        return res.status(402).json({
          message: "Enviar con su propio correo como remitente está disponible desde el plan Pro. Mejore su plan en \"Plan y Cuotas\".",
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

  /**
   * Runs the logo upload middleware, translating its errors (wrong type, too
   * large) into a 400 instead of letting them reach the generic 500 handler.
   */
  const runLogoUpload = (req: any, res: any, next: any) => {
    logoUpload.single('logo')(req, res, (error: any) => {
      if (error) {
        return res.status(400).json({ message: error.message || "No se pudo leer el archivo" });
      }
      next();
    });
  };

  /**
   * Effective sender of the consumer-facing emails.
   *
   * The console needs this to tell the business whether the address it typed is
   * really being used: that depends on the mail host having the domain verified
   * (see shared/email-identity.ts), which only the server knows.
   */
  app.get('/api/libro-configuration/email-sender', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      const identity = emailIdentity(business, config);

      res.json({
        status: identity.senderStatus,
        fromName: identity.fromName,
        fromAddress: identity.fromAddress,
        replyTo: identity.replyTo,
        hasLogo: Boolean(config?.logoUrl),
      });
    } catch (error) {
      console.error('Error resolving the email sender:', error);
      res.status(500).json({ message: "No se pudo resolver el remitente" });
    }
  });

  /**
   * Business logo (PNG/JPG, max 1 MB).
   *
   * Not plan-gated, unlike the colour and the custom texts: the logo is what
   * makes a consumer recognize who holds their complaint - it shows on the
   * public book, in the confirmation email and on the constancia - so it must be
   * available on every plan.
   */
  app.post('/api/libro-configuration/logo', requireAuth, runLogoUpload, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede cambiar el logo" });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      if (!config) {
        return res.status(404).json({ message: "Primero configure su Libro de Reclamaciones" });
      }

      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ message: "No se recibió ningún archivo" });
      }

      const stored = saveLogo(file);
      if (!stored) {
        return res.status(400).json({ message: "El logo debe ser un archivo PNG o JPG" });
      }

      const previousFileName = config.logoFileName;
      const updated = await storage.updateLibroConfiguration(config.id, {
        logoFileName: stored.fileName,
        logoUrl: `/api/public/logos/${stored.fileName}`,
        logoFileSize: stored.size,
        logoMimeType: stored.mimeType,
      });

      // Replacing the logo must not leave the previous file behind forever.
      if (previousFileName && previousFileName !== stored.fileName) {
        deleteLogo(previousFileName);
      }

      res.json(updated);
    } catch (error) {
      console.error('Error uploading the logo:', error);
      res.status(500).json({ message: "No se pudo guardar el logo" });
    }
  });

  app.delete('/api/libro-configuration/logo', requireAuth, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede cambiar el logo" });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      if (!config) {
        return res.status(404).json({ message: "Primero configure su Libro de Reclamaciones" });
      }

      if (config.logoFileName) {
        deleteLogo(config.logoFileName);
      }

      const updated = await storage.updateLibroConfiguration(config.id, {
        logoFileName: null,
        logoUrl: null,
        logoFileSize: null,
        logoMimeType: null,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error removing the logo:', error);
      res.status(500).json({ message: "No se pudo quitar el logo" });
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
