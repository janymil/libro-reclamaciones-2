import type { NextFunction, Request, Response } from "express";

import { storage } from "../storage";
import { hashApiKey } from "../storage/integration.storage";
import { hasFeature } from "./subscriptionService";

/**
 * API-key authentication for the public REST API (`/api/v1`).
 *
 * Shared by the complaint routes and the evidence upload route so both apply
 * exactly the same checks: the key must exist, not be revoked, and the tenant
 * must still hold the `api` feature. The plan is re-evaluated on every request
 * (not only when the key was created), so a downgrade or a lapsed paid period
 * takes effect immediately instead of leaving a working back door.
 */

export interface ApiKeyContext {
  id: string;
  businessId: string;
  name: string;
  keyPrefix: string;
}

type RequestWithApiKey = Request & { apiKey?: ApiKeyContext };

/** Resolves `Authorization: Bearer ld_...` to its tenant, or null. */
export async function resolveApiKey(req: Request): Promise<ApiKeyContext | null> {
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
  return { id: key.id, businessId: key.businessId, name: key.name, keyPrefix: key.keyPrefix };
}

/**
 * Express middleware: authenticates the key, enforces the `api` plan feature
 * and exposes the context as `req.apiKey`.
 */
export async function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const apiKey = await resolveApiKey(req);
    if (!apiKey) {
      res.status(401).json({
        error: 'invalid_api_key',
        message: 'Clave de API inválida o revocada',
      });
      return;
    }

    if (!(await hasFeature(apiKey.businessId, 'api'))) {
      res.status(402).json({
        error: 'plan_upgrade_required',
        message:
          'La API REST está disponible en el plan Empresarial. Mejore su plan en "Plan y Cuotas".',
      });
      return;
    }

    (req as RequestWithApiKey).apiKey = apiKey;
    next();
  } catch (error) {
    console.error('API key authentication failed:', error);
    res.status(500).json({ error: 'internal_error', message: 'Error interno' });
  }
}

export function getApiKeyContext(req: Request): ApiKeyContext {
  const apiKey = (req as RequestWithApiKey).apiKey;
  if (!apiKey) {
    // Only reachable if a route is wired without authenticateApiKey.
    throw new Error('API key context missing');
  }
  return apiKey;
}
