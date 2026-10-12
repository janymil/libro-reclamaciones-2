import type { Express } from "express";

import { storage } from "../storage";
import { captchaLimiter } from "../middleware/rateLimits";
import { issueCaptcha } from "../services/captchaService";

/**
 * Consumer facing endpoints. Deliberately unauthenticated: only public-safe fields are returned.
 */
export function registerPublicRoutes(app: Express): void {
  // CAPTCHA challenge for the public complaint form (Phase 1.5)
  app.get('/api/public/captcha', captchaLimiter, (_req, res) => {
    res.json(issueCaptcha());
  });

  // Public Libro de Reclamaciones (consumer facing, no authentication)
  app.get('/api/public/libro/:slug', async (req, res) => {
    try {
      const config = await storage.getLibroConfigurationBySlug(req.params.slug);

      if (!config || !config.isActive) {
        return res.status(404).json({ message: "Libro de Reclamaciones no encontrado" });
      }

      const business = await storage.getBusinessById(config.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const establishments = await storage.getEstablishmentsByBusiness(business.id);

      res.json({
        libro: {
          name: config.libroName,
          slug: config.urlSlug,
          whatsappNumber: config.whatsappNumber,
          websiteUrl: config.websiteUrl,
          logoUrl: config.logoUrl,
          notificationEmail: config.notificationEmail,
          // Per-business branding and confirmation text (Phase 2.8)
          brandColor: config.brandColor,
          confirmationMessage: config.confirmationMessage,
        },
        business: {
          id: business.id,
          businessName: business.businessName,
          commercialName: business.commercialName,
          ruc: business.ruc,
          address: business.address,
          distrito: business.distrito,
          provincia: business.provincia,
          departamento: business.departamento,
        },
        establishments: establishments.map(e => ({
          id: e.id,
          name: e.name,
          address: e.address,
        })),
      });
    } catch (error) {
      console.error('Error fetching public libro:', error);
      res.status(500).json({ message: "Error al cargar el Libro de Reclamaciones" });
    }
  });

  // Public tracking of a registered complaint (requires correlative + document)
  app.get('/api/public/libro/:slug/consultar/:correlative', async (req, res) => {
    try {
      const config = await storage.getLibroConfigurationBySlug(req.params.slug);
      if (!config) {
        return res.status(404).json({ message: "Libro de Reclamaciones no encontrado" });
      }

      const documentNumber = String(req.query.documento || '').trim();
      if (!documentNumber) {
        return res.status(400).json({ message: "Ingrese el número de documento del consumidor" });
      }

      const complaint = await storage.findComplaintByCorrelative(
        config.businessId,
        req.params.correlative,
        documentNumber
      );

      if (!complaint) {
        return res.status(404).json({ message: "No se encontró una reclamación con esos datos" });
      }

      // Only consumer-safe fields are exposed publicly
      res.json({
        correlativeNumber: complaint.correlativeNumber,
        complaintType: complaint.complaintType,
        status: complaint.status,
        productServiceName: complaint.productServiceName,
        submissionDate: complaint.submissionDate,
        dueDate: complaint.dueDate,
        responseDate: complaint.responseDate,
        providerResponse: complaint.providerResponse,
        isOverdue: complaint.isOverdue,
      });
    } catch (error) {
      console.error('Error consulting complaint:', error);
      res.status(500).json({ message: "Error al consultar la reclamación" });
    }
  });

  // Public business info (for complaint form)
  app.get('/api/public/business/:businessId', async (req, res) => {
    try {
      const business = await storage.getBusinessById(req.params.businessId);
      
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      
      const establishments = await storage.getEstablishmentsByBusiness(business.id);
      
      res.json({
        business: {
          id: business.id,
          businessName: business.businessName,
          ruc: business.ruc,
          address: business.address,
        },
        establishments: establishments.map(e => ({
          id: e.id,
          name: e.name,
          address: e.address,
        })),
      });
    } catch (error) {
      console.error('Error fetching public business info:', error);
      res.status(500).json({ message: "Failed to fetch business info" });
    }
  });
}
