import type { Express } from "express";
import { z } from "zod";

import { insertBusinessSchema } from "@shared/schema";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

/**
 * Business records: read the current tenant, list, create and update.
 */
export function registerBusinessesRoutes(app: Express): void {
  // Businesses routes
  app.get('/api/businesses/current', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.json(null);
      }

      const business = await storage.getBusiness(req.user.businessId);
      res.json(business ?? null);
    } catch (error) {
      console.error('Error fetching current business:', error);
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  app.get('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      const businesses = await storage.getAllBusinesses();
      res.json(businesses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.post('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      const businessData = req.body;
      const business = await storage.createBusiness(businessData);
      res.json(business);
    } catch (error) {
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  // Update a business ("Gestionar" on Empresas)
  app.patch('/api/businesses/:id', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const data = insertBusinessSchema.partial().parse(req.body);
      const updated = await storage.updateBusiness(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating business:', error);
      res.status(500).json({ message: "Failed to update business" });
    }
  });
}
