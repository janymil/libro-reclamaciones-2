import type { Express } from "express";

import { insertArcoRequestSchema } from "@shared/schema";

import { businessDayCalculator } from "../services/businessDayCalculator";
import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

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

  app.post('/api/arco-requests', async (req, res) => {
    try {
      const data = insertArcoRequestSchema.parse(req.body);
      
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
      
      res.json(request);
    } catch (error) {
      console.error('Error creating ARCO request:', error);
      res.status(500).json({ message: "Failed to create ARCO request" });
    }
  });
}
