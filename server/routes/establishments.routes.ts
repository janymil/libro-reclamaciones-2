import type { Express } from "express";
import { z } from "zod";

import { insertEstablishmentSchema } from "@shared/schema";

import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../middleware/requireAuth";
import { enforceQuota } from "../services/subscriptionService";

/**
 * Establishments (sucursales) belonging to the authenticated business.
 */
export function registerEstablishmentsRoutes(app: Express): void {
  // Establishments routes
  /**
   * The admin list includes INACTIVE sucursales: a local that was deactivated
   * (closed for a renovation, moved) has to stay visible to be reactivated, and
   * hiding it made "deactivate" a one-way door. The public portal does not use
   * this route: it reads only the active ones.
   */
  app.get('/api/establishments', requireAuth, async (req: any, res) => {
    try {
      const establishments = await storage.getAllEstablishmentsByBusiness(req.user.businessId);
      res.json(establishments);
    } catch (error) {
      console.error('Error fetching establishments:', error);
      res.status(500).json({ message: "Failed to fetch establishments" });
    }
  });

  /**
   * Registers a sucursal ("Nuevo Establecimiento" on /sucursales) WITH its Libro
   * de Reclamaciones, in one transaction.
   *
   * A sucursal without a book has no operational meaning in Peru: it could never
   * receive a complaint (DS 011-2011-PCM requires one Libro per establishment
   * open to the public), and it used to show up on /sucursales while /libros
   * stayed empty - the same "no se creó el libro" complaint. Creating both here
   * also means the customer does not have to remember a second, easy-to-miss step.
   */
  app.post('/api/establishments', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const data = insertEstablishmentSchema.parse({
        ...req.body,
        businessId: req.user.businessId,
      });

      // Plan quota on sucursales (Phase 2.6)
      const quota = await enforceQuota(req.user.businessId, req.user.id, 'establishments');
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const { establishment, book } = await storage.createEstablishmentWithBook(data);

      res.status(201).json({
        message: `${establishment.name} quedó registrada con su Libro de Reclamaciones.`,
        establishment,
        // The caller may show it, and /libros must list it after the invalidation.
        book,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating establishment:', error);
      res.status(500).json({ message: "Failed to create establishment" });
    }
  });

  /**
   * Edit a sucursal ("Editar Establecimiento" on /sucursales), including closing
   * and reopening a local.
   *
   * Was missing entirely, so the edit form that has always been in the UI
   * answered 404. That mattered as soon as a name came from the auto-provisioning
   * rule: a tenant whose book is named after its company could not correct a
   * wrong or generic name (the old hard-coded "Casa Matriz").
   *
   * Tenant-scoped: the establishment must belong to the caller's active business,
   * and `businessId` itself is never accepted from the client.
   */
  app.patch('/api/establishments/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const establishment = await storage.getEstablishment(req.params.id);
      if (!establishment || establishment.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Establecimiento no encontrado" });
      }

      const data = insertEstablishmentSchema
        .omit({ businessId: true })
        .partial()
        .parse(req.body);

      // Closing the LAST local would take the public book offline: the consumer
      // form asks "¿dónde ocurrió?" from the local list, so with none active there
      // is nowhere to file. Refused with an explanation instead of leaving the
      // customer with a link that cannot accept anything.
      if (data.isActive === false) {
        const active = await storage.getEstablishmentsByBusiness(establishment.businessId);
        if (active.length <= 1) {
          return res.status(409).json({
            message:
              "Este es tu único local activo. Registra otro antes de cerrarlo: si no, tu Libro de Reclamaciones se quedaría sin lugares donde reclamar.",
            code: "last_establishment",
          });
        }
      }

      const updated = await storage.updateEstablishment(establishment.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating establishment:', error);
      res.status(500).json({ message: "Failed to update establishment" });
    }
  });
}
