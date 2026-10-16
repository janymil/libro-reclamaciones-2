import type { Express, Request } from "express";
import crypto from "crypto";

import { complaintSubmissionSchema } from "@shared/schema";
import { storage } from "../storage";
import { apiV1Limiter } from "../middleware/rateLimits";
import { hashApiKey } from "../storage/integration.storage";
import { intakeComplaint, IntakeError } from "../services/complaintIntakeService";
import { enforceQuota, enforceComplaintType } from "../services/subscriptionService";

/**
 * Public REST API v1 (Phase 3.12): CRM/ERP systems create and sync complaints
 * with an API key (Corporativo plan) instead of a session.
 *
 *   POST /api/v1/complaints   - register a complaint
 *   GET  /api/v1/complaints   - list recent complaints (safe fields)
 *
 * Auth: `Authorization: Bearer ld_...`
 */
interface AuthenticatedApiKey {
  id: string;
  businessId: string;
}

async function resolveApiKey(req: Request): Promise<AuthenticatedApiKey | null> {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const keyHash = hashApiKey(match[1].trim());
  const key = await storage.getApiKeyByKeyHash(keyHash);
  if (!key || key.revokedAt) {
    return null;
  }

  void storage.markApiKeyUsed(key.id);
  return { id: key.id, businessId: key.businessId };
}

export function registerApiV1Routes(app: Express): void {
  app.post('/api/v1/complaints', apiV1Limiter, async (req, res) => {
    try {
      const apiKey = await resolveApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: 'invalid_api_key', message: 'Clave de API inválida o revocada' });
      }

      const data = complaintSubmissionSchema.parse({ ...req.body, businessId: apiKey.businessId });

      const quota = await enforceQuota(apiKey.businessId, null, 'complaintsThisMonth');
      if (!quota.allowed) {
        return res.status(402).json({ error: 'quota_exceeded', message: quota.reason });
      }

      // Complaint-type gate: the Gratis plan accepts Reclamos only.
      const typeCheck = await enforceComplaintType(apiKey.businessId, data.complaintType);
      if (!typeCheck.allowed) {
        return res.status(402).json({ error: 'complaint_type_not_allowed', message: typeCheck.reason });
      }

      // Lifetime gate: Gratis includes 5 complaints in total, not per month.
      const lifetime = await enforceQuota(apiKey.businessId, null, 'complaintsTotal');
      if (!lifetime.allowed) {
        return res.status(402).json({ error: 'quota_exceeded', message: lifetime.reason });
      }

      const { complaint } = await intakeComplaint(data);

      res.status(201).json({
        id: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        dueDate: complaint.dueDate,
        status: complaint.status,
      });
    } catch (error) {
      if (error instanceof IntakeError) {
        return res.status(error.status).json({ error: 'intake_failed', message: error.message });
      }
      console.error('API v1 complaint creation failed:', error);
      res.status(400).json({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Solicitud inválida',
      });
    }
  });

  app.get('/api/v1/complaints', apiV1Limiter, async (req, res) => {
    try {
      const apiKey = await resolveApiKey(req);
      if (!apiKey) {
        return res.status(401).json({ error: 'invalid_api_key', message: 'Clave de API inválida o revocada' });
      }

      const complaints = await storage.getComplaintsByBusiness(apiKey.businessId);
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      res.json(
        complaints.slice(0, limit).map((complaint) => ({
          id: complaint.id,
          correlativeNumber: complaint.correlativeNumber,
          complaintType: complaint.complaintType,
          status: complaint.status,
          priority: complaint.priority,
          productServiceName: complaint.productServiceName,
          submissionDate: complaint.submissionDate,
          dueDate: complaint.dueDate,
          responseDate: complaint.responseDate,
          isOverdue: complaint.isOverdue,
        })),
      );
    } catch (error) {
      console.error('API v1 complaint listing failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // API health probe (also used by the status page)
  app.get('/api/v1/ping', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), nonce: crypto.randomBytes(4).toString('hex') });
  });
}
