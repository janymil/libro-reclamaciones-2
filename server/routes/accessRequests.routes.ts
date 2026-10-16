import type { Express } from "express";
import { z } from "zod";

import { businessAccessDecisionSchema, businessAccessRequestSchema } from "@shared/schema";

import { storage } from "../storage";
import { emailService } from "../services/emailService";
import { getManageableBusinessIds } from "../services/tenantAccess";
import { requireAdmin, requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { accessRequestLimiter } from "../middleware/rateLimits";

/**
 * Access requests: the way out of a duplicate RUC.
 *
 * `POST /api/businesses` answers 409 when the RUC already exists, which is
 * correct - one RUC is one tenant, and RUCs must never be duplicated. What was
 * missing is what a legitimate second person does next: the accountant of a
 * client, staff turnover, a partner who is not the login that registered the
 * empresa. They now ask for access, and an administrator of that empresa decides.
 *
 * Tenant boundary: a requester only ever supplies a RUC (never a business id),
 * and only an administrator of the affected tenant can decide a request.
 */
export function registerAccessRequestRoutes(app: Express): void {
  // Ask the current administrators of an already-registered RUC for access.
  app.post(
    '/api/businesses/access-requests',
    requireAuth,
    requireAdmin,
    requireNonDemo,
    accessRequestLimiter,
    async (req: any, res) => {
      try {
        const { ruc, message } = businessAccessRequestSchema.parse(req.body);

        const business = await storage.getBusinessByRuc(ruc);

        // Deliberately specific: the requester typed the RUC from a real
        // document, so "that RUC is not registered here" is the useful answer.
        if (!business) {
          return res.status(404).json({
            message: "No existe una empresa con ese RUC en LibroDigital.pe. Regístrala como empresa nueva.",
            code: "ruc_not_found",
          });
        }

        // Already one of ours: nothing to request.
        const manageable = await getManageableBusinessIds(req.user);
        if (manageable.has(business.id)) {
          return res.status(409).json({
            message: `Ya tienes acceso a ${business.businessName}.`,
            code: "already_has_access",
          });
        }

        // Idempotent: a double click must not queue (or email) twice.
        const pending = await storage.getPendingAccessRequest(business.id, req.user.id);
        if (pending) {
          return res.json({
            message: `Tu solicitud a ${business.businessName} ya está pendiente de aprobación.`,
            request: pending,
            alreadyPending: true,
          });
        }

        const request = await storage.createAccessRequest({
          businessId: business.id,
          requesterUserId: req.user.id,
          requesterEmail: req.user.email,
          requesterName: `${req.user.firstName} ${req.user.lastName}`.trim(),
          message: message ?? null,
        });

        // Notify every active administrator of that tenant. A notification
        // failure never loses the request: it is already stored.
        const requesterName = `${req.user.firstName} ${req.user.lastName}`.trim();
        const admins = await storage.getUsersByBusinessIds([business.id]);
        await Promise.all(
          admins
            .filter((admin) => admin.role === 'admin' && admin.isActive && admin.id !== req.user.id)
            .map((admin) =>
              emailService.sendAccessRequestReceived({
                to: admin.email,
                businessName: business.businessName,
                requesterName,
                requesterEmail: req.user.email,
                message: message ?? null,
              }),
            ),
        );

        res.status(201).json({
          message: `Solicitud enviada. Un administrador de ${business.businessName} debe aprobarla.`,
          request,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
        }
        console.error('Error creating access request:', error);
        res.status(500).json({ message: "No se pudo enviar la solicitud de acceso" });
      }
    },
  );

  // Requests this login sent, so the UI can show their state.
  app.get('/api/businesses/access-requests/mine', requireAuth, async (req: any, res) => {
    try {
      res.json(await storage.getAccessRequestsByRequester(req.user.id));
    } catch (error) {
      console.error('Error listing own access requests:', error);
      res.status(500).json({ message: "No se pudieron cargar tus solicitudes" });
    }
  });

  // Requests waiting on the tenants this login administers.
  app.get('/api/businesses/access-requests', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const manageable = [...(await getManageableBusinessIds(req.user))];
      res.json(await storage.getAccessRequestsByBusinessIds(manageable));
    } catch (error) {
      console.error('Error listing incoming access requests:', error);
      res.status(500).json({ message: "No se pudieron cargar las solicitudes recibidas" });
    }
  });

  // Approve: grants the requester administrator access to that tenant.
  app.post(
    '/api/businesses/access-requests/:id/approve',
    requireAuth,
    requireAdmin,
    requireNonDemo,
    async (req: any, res) => {
      try {
        const { note } = businessAccessDecisionSchema.parse(req.body ?? {});

        const request = await storage.getAccessRequest(req.params.id);
        if (!request) {
          return res.status(404).json({ message: "Solicitud no encontrada" });
        }

        // Only an administrator of the affected tenant (404, not 403: the
        // existence of another tenant's request is not this caller's business).
        const manageable = await getManageableBusinessIds(req.user);
        if (!manageable.has(request.businessId)) {
          return res.status(404).json({ message: "Solicitud no encontrada" });
        }

        // Approving your own request would be self-service tenant access.
        if (request.requesterUserId === req.user.id) {
          return res.status(400).json({
            message: "No puedes aprobar tu propia solicitud de acceso.",
            code: "self_approval",
          });
        }

        const decided = await storage.decideAccessRequest(request.id, {
          status: 'approved',
          decidedByUserId: req.user.id,
        });

        // Lost the race against another administrator: nothing is granted twice.
        if (!decided) {
          return res.status(409).json({
            message: "Esta solicitud ya fue atendida.",
            code: "already_decided",
          });
        }

        await storage.grantBusinessAccess({
          userId: request.requesterUserId,
          businessId: request.businessId,
          role: 'admin',
        });

        // If the requester never finished onboarding (no tenant of their own),
        // approving IS their onboarding: without this the wizard would send them
        // back to create a business whose RUC already exists - the very dead end
        // this feature removes.
        const requester = await storage.getUserById(request.requesterUserId);
        if (requester && !requester.businessId && !requester.onboardingCompleted) {
          await storage.updateUser(requester.id, {
            businessId: request.businessId,
            onboardingStep: 2,
            onboardingCompleted: true,
          });
        }

        await emailService.sendAccessRequestDecision({
          to: request.requesterEmail,
          requesterName: request.requesterName ?? request.requesterEmail,
          businessName: request.businessName,
          approved: true,
          note: note ?? null,
        });

        res.json({
          message: `Acceso aprobado para ${request.requesterEmail}.`,
          request: decided,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
        }
        console.error('Error approving access request:', error);
        res.status(500).json({ message: "No se pudo aprobar la solicitud" });
      }
    },
  );

  // Reject: no access is granted. The requester may ask again later (a new
  // pending row, which the unique index allows).
  app.post(
    '/api/businesses/access-requests/:id/reject',
    requireAuth,
    requireAdmin,
    requireNonDemo,
    async (req: any, res) => {
      try {
        const { note } = businessAccessDecisionSchema.parse(req.body ?? {});

        const request = await storage.getAccessRequest(req.params.id);
        if (!request) {
          return res.status(404).json({ message: "Solicitud no encontrada" });
        }

        const manageable = await getManageableBusinessIds(req.user);
        if (!manageable.has(request.businessId)) {
          return res.status(404).json({ message: "Solicitud no encontrada" });
        }

        const decided = await storage.decideAccessRequest(request.id, {
          status: 'rejected',
          decidedByUserId: req.user.id,
        });

        if (!decided) {
          return res.status(409).json({
            message: "Esta solicitud ya fue atendida.",
            code: "already_decided",
          });
        }

        await emailService.sendAccessRequestDecision({
          to: request.requesterEmail,
          requesterName: request.requesterName ?? request.requesterEmail,
          businessName: request.businessName,
          approved: false,
          note: note ?? null,
        });

        res.json({
          message: `Solicitud de ${request.requesterEmail} rechazada.`,
          request: decided,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
        }
        console.error('Error rejecting access request:', error);
        res.status(500).json({ message: "No se pudo rechazar la solicitud" });
      }
    },
  );
}
