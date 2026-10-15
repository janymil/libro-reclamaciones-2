import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth, requireStaff } from "../middleware/requireAuth";
import { whatsappWebhookLimiter } from "../middleware/rateLimits";
import { hasFeature } from "../services/subscriptionService";
import {
  buildComplaintUrls,
  buildInboundReply,
  buildResponseNotification,
  getWhatsAppConfig,
  isWhatsAppConfigured,
  matchesWhatsAppNumber,
  normalizePeruPhone,
  parseInboundMessages,
  sendTextMessage,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "../services/whatsappService";

/**
 * WhatsApp Cloud API (Meta) integration.
 *
 * Two directions, with an explicit legal boundary:
 *
 *  - **Inbound** (`POST /api/whatsapp/webhook`): a consumer message is answered
 *    with the link to the business's Libro virtual and turned into an in-app
 *    notification. It is deliberately NOT converted into a complaint: Anexo 1
 *    requires fields a chat message does not carry, so auto-creating one would
 *    produce an invalid legal record.
 *  - **Outbound** (`POST /api/complaints/:id/whatsapp-notify`): staff notify a
 *    consumer that an *already written* response is available. The written
 *    channel (email/letter) stays the legally valid one - WhatsApp is the
 *    courtesy delivery that makes small sellers actually answer in time.
 *
 * The webhook is unauthenticated by necessity (Meta calls it); the
 * `X-Hub-Signature-256` HMAC is what proves the caller is Meta.
 */
export function registerWhatsAppRoutes(app: Express): void {
  // ---- Webhook (Meta -> us) -------------------------------------------------

  // Subscription handshake: Meta echoes the challenge when the verify token matches.
  app.get('/api/whatsapp/webhook', whatsappWebhookLimiter, (req, res) => {
    const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>);

    if (challenge === null) {
      // No detail: a wrong token must not confirm whether one is configured.
      return res.status(403).json({ message: "Verificación fallida" });
    }

    res.type('text/plain').send(challenge);
  });

  app.post('/api/whatsapp/webhook', whatsappWebhookLimiter, async (req: any, res) => {
    const config = getWhatsAppConfig();

    // When the app secret is configured, an unsigned body is a forgery attempt
    // (Meta always signs). Without the secret (local development) the webhook
    // still works; only inbound notifications exist there, no legal record.
    if (config.appSecret && !verifyWebhookSignature(req.rawBody, req.get('x-hub-signature-256'), config.appSecret)) {
      return res.status(401).json({ message: "Firma inválida" });
    }

    try {
      await handleInboundWhatsApp(req.body);
    } catch (error) {
      // Never bounce the webhook: Meta retries non-2xx for hours, which would
      // multiply the failure. The error is logged for the operator instead.
      console.error('WhatsApp webhook error:', error);
    }

    res.sendStatus(200);
  });

  // ---- Operator surface -----------------------------------------------------

  app.get('/api/whatsapp/status', requireAuth, async (req: any, res) => {
    const config = getWhatsAppConfig();

    res.json({
      configured: isWhatsAppConfigured(config),
      apiVersion: config.apiVersion,
      webhookPath: '/api/whatsapp/webhook',
      featureEnabled: await hasFeature(req.user.businessId, 'whatsapp'),
    });
  });

  /**
   * Notifies the consumer by WhatsApp that the provider's response is
   * available. Refuses when no written response exists yet, because art. 152 of
   * the Código requires the reply to be in writing: WhatsApp is the
   * notification, never the record.
   */
  app.post('/api/complaints/:id/whatsapp-notify', requireAuth, requireStaff, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'whatsapp'))) {
        return res.status(402).json({
          message: "El aviso por WhatsApp está disponible desde el plan Pro. Mejore su plan en la sección \"Plan y Cuotas\".",
          code: "plan_upgrade_required",
        });
      }

      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Reclamación no encontrada" });
      }

      if (!complaint.providerResponse?.trim()) {
        return res.status(409).json({
          message: "Primero registre la respuesta por escrito (correo o carta). WhatsApp solo la notifica; no reemplaza al canal legal.",
          code: "written_response_required",
        });
      }

      const config = await storage.getLibroConfiguration(req.user.businessId);
      const business = await storage.getBusinessById(req.user.businessId);
      const businessName = business?.commercialName?.trim() || business?.businessName || complaint.correlativeNumber;
      const { consultUrl } = buildComplaintUrls(config?.urlSlug, complaint.correlativeNumber);

      const result = await sendTextMessage(
        complaint.consumerPhone,
        buildResponseNotification({
          businessName,
          correlativeNumber: complaint.correlativeNumber,
          complaintType: complaint.complaintType === 'queja' ? 'queja' : 'reclamo',
          providerResponse: complaint.providerResponse,
          consultUrl,
        }),
      );

      if (!result.sent) {
        return res.status(502).json({
          message: "No se pudo enviar el aviso por WhatsApp. La respuesta escrita sigue registrada en el expediente.",
          reason: result.error ?? "unknown",
        });
      }

      await storage.createAuditLog({
        complaintId: complaint.id,
        userId: req.user.id,
        action: 'whatsapp_response_notified',
        oldValues: null,
        newValues: { notifiedVia: 'whatsapp', to: normalizePeruPhone(complaint.consumerPhone) },
        notes: null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('User-Agent') ?? null,
      });

      await storage.createNotification({
        businessId: req.user.businessId,
        type: 'whatsapp_response_sent',
        title: 'Aviso enviado por WhatsApp',
        message: `Se notificó por WhatsApp la respuesta de ${complaint.correlativeNumber}.`,
        relatedEntityType: 'complaint',
        relatedEntityId: complaint.id,
      });

      res.json({
        sent: true,
        to: normalizePeruPhone(complaint.consumerPhone),
        messageId: result.messageId ?? null,
        writtenResponsePreserved: true,
      });
    } catch (error) {
      console.error('Error notifying by WhatsApp:', error);
      res.status(500).json({ message: "No se pudo enviar el aviso por WhatsApp" });
    }
  });
}

/**
 * Resolves the tenant that owns the receiving number, replies to the consumer
 * and records an in-app notification so no message is lost.
 */
async function handleInboundWhatsApp(payload: unknown): Promise<void> {
  const messages = parseInboundMessages(payload);
  if (messages.length === 0) {
    return;
  }

  const configurations = await storage.getActiveLibroConfigurations();

  for (const message of messages) {
    const config = configurations.find((candidate) =>
      matchesWhatsAppNumber(candidate.whatsappNumber, message.displayPhoneNumber)
      || matchesWhatsAppNumber(candidate.whatsappNumber, message.from),
    );

    if (!config) {
      console.warn(
        '[whatsapp] inbound message for an unrecognized business number (phone_number_id=%s) - ignored',
        message.phoneNumberId ?? 'unknown',
      );
      continue;
    }

    const business = await storage.getBusinessById(config.businessId);
    const businessName = business?.commercialName?.trim() || business?.businessName || config.libroName;
    const urls = buildComplaintUrls(config.urlSlug);

    await sendTextMessage(
      message.from,
      buildInboundReply({ businessName, profileName: message.profileName, urls }),
    );

    await storage.createNotification({
      businessId: config.businessId,
      type: 'whatsapp_inbound',
      title: 'Nueva consulta por WhatsApp',
      message: `${normalizePeruPhone(message.from) ?? message.from} escribió pidiendo atención. Aún no es un reclamo registrado: el consumidor debe completar el Libro virtual.`,
      relatedEntityType: null,
      relatedEntityId: null,
    });
  }
}

