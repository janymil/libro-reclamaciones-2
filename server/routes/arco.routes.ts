import type { Express } from "express";

import { insertArcoRequestSchema } from "@shared/schema";

import { businessDayCalculator } from "../services/businessDayCalculator";
import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";
import { arcoLimiter } from "../middleware/rateLimits";

/**
 * ARCO requests (Ley 29733 personal data rights).
 */
export function registerArcoRoutes(app: Express): void {
  // ARCO requests routes
  app.get('/api/arco-requests', requireAuth, async (req: any, res) => {
    try {
      const requests = await storage.getArcoRequests(req.user.businessId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching ARCO requests:', error);
      res.status(500).json({ message: "Failed to fetch ARCO requests" });
    }
  });

  // Public intake (unauthenticated by design): rate-limited, and the target
  // business must exist and be active - otherwise anyone could attach PII
  // requests (and in-app notifications) to arbitrary or nonexistent tenants.
  app.post('/api/arco-requests', arcoLimiter, async (req, res) => {
    try {
      // Only the requester's own fields: status/response/dueDate are managed
      // by the business and the server, never by the public caller.
      const data = insertArcoRequestSchema
        .omit({ status: true, response: true, responseDate: true, dueDate: true })
        .parse(req.body);

      const business = await storage.getBusiness(data.businessId);
      if (!business || !business.isActive) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      // Calculate due date based on request type (typically 10-20 business days)
      const dueDate = businessDayCalculator.addBusinessDays(new Date(), 15);

      const request = await storage.createArcoRequest({
        ...data,
        dueDate,
      });

      // Notify business
      await storage.createNotification({
        businessId: data.businessId,
        type: 'arco_request_new',
        title: 'Nueva solicitud de derechos ARCO',
        message: `Se ha recibido una solicitud de ${data.requestType} de ${data.requesterName}`,
        relatedEntityType: 'arco_request',
        relatedEntityId: request.id,
      });

      // Minimal acknowledgement: do not echo the full PII record back.
      res.status(201).json({
        id: request.id,
        requestType: request.requestType,
        status: request.status,
        dueDate: request.dueDate,
      });
    } catch (error) {
      console.error('Error creating ARCO request:', error);
      res.status(500).json({ message: "Failed to create ARCO request" });
    }
  });
}
