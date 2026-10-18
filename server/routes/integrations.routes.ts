import type { Express } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { requireAuth, requireNonDemo, requireAdmin } from "../middleware/requireAuth";
import { hasFeature } from "../services/subscriptionService";
import { generateApiKey, generateWebhookSecret } from "../storage/integration.storage";
import {
  signPayload,
  isSafeWebhookUrl,
  isWebhookEvent,
  processWebhookDeliveries,
} from "../services/webhookService";

/**
 * Integrations (Phase 3.12): API keys, outgoing webhooks and the embeddable
 * widget snippet. Corporativo-gated features.
 */
export function registerIntegrationsRoutes(app: Express): void {
  // ---- API keys --------------------------------------------------------------

  app.get('/api/api-keys', requireAuth, async (req: any, res) => {
    try {
      res.json(await storage.getApiKeysByBusiness(req.user.businessId));
    } catch (error) {
      console.error('Error listing API keys:', error);
      res.status(500).json({ message: "Failed to list API keys" });
    }
  });

  app.post('/api/api-keys', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede crear claves de API" });
      }

      if (!(await hasFeature(req.user.businessId, 'api'))) {
        return res.status(402).json({
          message: "Las claves de API están disponibles en el plan Empresarial. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);

      const generated = generateApiKey();
      const created = await storage.createApiKey({
        businessId: req.user.businessId,
        name,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
      });

      // The full key is shown exactly once
      res.status(201).json({ ...created, fullKey: generated.fullKey });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating API key:', error);
      res.status(500).json({ message: "No se pudo crear la clave" });
    }
  });

  // Revoking a key is an admin action (it kills a CRM/ERP integration).
  app.delete('/api/api-keys/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const revoked = await storage.revokeApiKey(req.params.id, req.user.businessId);
      if (!revoked) {
        return res.status(404).json({ message: "Clave no encontrada" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error revoking API key:', error);
      res.status(500).json({ message: "No se pudo revocar la clave" });
    }
  });

  // Rotating a key is safer than deleting + recreating: the name is preserved
  // and the old secret stops working the moment the new one is issued.
  app.post('/api/api-keys/:id/rotate', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'api'))) {
        return res.status(402).json({
          message: "Las claves de API están disponibles en el plan Empresarial. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const generated = generateApiKey();
      const rotated = await storage.rotateApiKey(req.params.id, req.user.businessId, {
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
      });

      if (!rotated) {
        return res.status(404).json({ message: "Clave no encontrada" });
      }

      res.json({ ...rotated, fullKey: generated.fullKey });
    } catch (error) {
      console.error('Error rotating API key:', error);
      res.status(500).json({ message: "No se pudo rotar la clave" });
    }
  });

  // ---- Webhooks ---------------------------------------------------------------

  app.get('/api/webhooks', requireAuth, async (req: any, res) => {
    try {
      const webhooks = await storage.getWebhooksByBusiness(req.user.businessId);
      // Never expose the signing secret to the browser again
      res.json(webhooks.map(({ secret: _secret, ...safe }) => safe));
    } catch (error) {
      console.error('Error listing webhooks:', error);
      res.status(500).json({ message: "Failed to list webhooks" });
    }
  });

  app.post('/api/webhooks', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Solo un administrador puede configurar webhooks" });
      }

      if (!(await hasFeature(req.user.businessId, 'webhooks'))) {
        return res.status(402).json({
          message: "Los webhooks están disponibles en el plan Empresarial. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const { url, events, includeConsumerData } = z.object({
        url: z.string().url().max(500),
        events: z
          .array(z.string())
          .min(1)
          .default(['complaint.created'])
          .refine(
            (list) => list.every(isWebhookEvent),
            'Evento desconocido. Use complaint.created, complaint.updated o complaint.responded.',
          ),
        includeConsumerData: z.boolean().default(true),
      }).parse(req.body);

      // SSRF guard: the endpoint is fetched by this server, so it must be a
      // public http(s) destination - never the internal network or metadata
      // service of the hosting platform.
      if (!isSafeWebhookUrl(url)) {
        return res.status(400).json({
          message: "La URL del webhook debe ser un destino público (http/https) accesible desde Internet.",
        });
      }

      const secret = generateWebhookSecret();
      const webhook = await storage.createWebhook({
        businessId: req.user.businessId,
        url,
        secret,
        events,
        includeConsumerData,
        isActive: true,
      });

      res.status(201).json({ ...webhook, secret }); // shown once, like API keys
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating webhook:', error);
      res.status(500).json({ message: "No se pudo crear el webhook" });
    }
  });

  const webhookUpdateSchema = z
    .object({
      url: z.string().url().max(500).optional(),
      events: z
        .array(z.string())
        .min(1)
        .refine(
          (list) => list.every(isWebhookEvent),
          'Evento desconocido. Use complaint.created, complaint.updated o complaint.responded.',
        )
        .optional(),
      includeConsumerData: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .strict();

  app.patch('/api/webhooks/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'webhooks'))) {
        return res.status(402).json({
          message: "Los webhooks están disponibles en el plan Empresarial. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const parsed = webhookUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.errors });
      }

      if (parsed.data.url && !isSafeWebhookUrl(parsed.data.url)) {
        return res.status(400).json({
          message: "La URL del webhook debe ser un destino público (http/https) accesible desde Internet.",
        });
      }

      const webhook = await storage.updateWebhook(req.params.id, req.user.businessId, parsed.data);
      if (!webhook) {
        return res.status(404).json({ message: "Webhook no encontrado" });
      }

      const { secret: _secret, ...safe } = webhook;
      res.json(safe);
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({ message: "No se pudo actualizar el webhook" });
    }
  });

  /** Issues a new signing secret in place; the old one stops working at once. */
  app.post('/api/webhooks/:id/rotate-secret', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'webhooks'))) {
        return res.status(402).json({
          message: "Los webhooks están disponibles en el plan Empresarial. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const secret = generateWebhookSecret();
      const webhook = await storage.updateWebhook(req.params.id, req.user.businessId, { secret });
      if (!webhook) {
        return res.status(404).json({ message: "Webhook no encontrado" });
      }

      res.json({ id: webhook.id, secret }); // shown once
    } catch (error) {
      console.error('Error rotating webhook secret:', error);
      res.status(500).json({ message: "No se pudo rotar el secreto" });
    }
  });

  /** Delivery log for the integrations screen (never exposes the payload/PII). */
  app.get('/api/webhooks/deliveries', requireAuth, async (req: any, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const deliveries = await storage.getWebhookDeliveriesByBusiness(req.user.businessId, limit);
      res.json(deliveries);
    } catch (error) {
      console.error('Error listing webhook deliveries:', error);
      res.status(500).json({ message: "No se pudieron listar las entregas" });
    }
  });

  /** Manual requeue of a failed or dead-letter delivery. */
  app.post('/api/webhooks/deliveries/:id/retry', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const delivery = await storage.retryWebhookDelivery(req.params.id, req.user.businessId);
      if (!delivery) {
        return res.status(404).json({ message: "Entrega no encontrada" });
      }

      void processWebhookDeliveries().catch(() => {});
      res.json(delivery);
    } catch (error) {
      console.error('Error retrying webhook delivery:', error);
      res.status(500).json({ message: "No se pudo reintentar la entrega" });
    }
  });

  app.delete('/api/webhooks/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const deleted = await storage.deleteWebhook(req.params.id, req.user.businessId);
      if (!deleted) {
        return res.status(404).json({ message: "Webhook no encontrado" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({ message: "No se pudo eliminar el webhook" });
    }
  });

  // ---- Widget + signing helper -------------------------------------------------

  app.get('/api/integrations/widget', requireAuth, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'widget'))) {
        return res.status(402).json({
          message: "El widget para su web o tienda virtual está disponible desde el plan Pro. Mejore su plan en \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      if (!config) {
        return res.status(404).json({ message: "Primero configure su Libro de Reclamaciones" });
      }

      const origin = `${req.protocol}://${req.get('host')}`;
      res.json({
        slug: config.urlSlug,
        embedUrl: `${origin}/libro/${config.urlSlug}?embed=1`,
        scriptUrl: `${origin}/widget.js`,
        snippet: `<script src="${origin}/widget.js" data-slug="${config.urlSlug}" defer></script>`,
      });
    } catch (error) {
      console.error('Error building widget snippet:', error);
      res.status(500).json({ message: "Failed to build widget snippet" });
    }
  });

  // Signing helper so customers can verify webhook signatures in their tests
  app.post('/api/webhooks/sign-test', requireAuth, async (req: any, res) => {
    try {
      const { secret, body } = z.object({
        secret: z.string().min(10),
        body: z.string(),
      }).parse(req.body);

      res.json({ signature: signPayload(secret, body) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      res.status(500).json({ message: "No se pudo firmar" });
    }
  });
}
