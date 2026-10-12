import crypto from "crypto";
import type { Complaint } from "@shared/schema";
import { storage } from "../storage";

/**
 * Outgoing webhooks (Phase 3.12).
 *
 * Businesses (Corporativo) register URLs that receive an HTTP POST with the
 * event payload, signed with an HMAC-SHA256 header (`X-LibroVirtual-Signature:
 * sha256=<hex>`) so the receiver can verify authenticity. Delivery is
 * fire-and-forget: failures are logged, never thrown, so the complaint flow
 * is never blocked by a broken customer endpoint.
 */

const WEBHOOK_TIMEOUT_MS = 8_000;

export interface WebhookPayload {
  event: string;
  created: string;
  data: Record<string, unknown>;
}

export function signPayload(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Consumer-safe complaint payload for `complaint.created`. */
export function complaintCreatedPayload(complaint: Complaint): WebhookPayload {
  return {
    event: "complaint.created",
    created: new Date().toISOString(),
    data: {
      id: complaint.id,
      correlativeNumber: complaint.correlativeNumber,
      complaintType: complaint.complaintType,
      status: complaint.status,
      priority: complaint.priority,
      productServiceName: complaint.productServiceName,
      complaintDetail: complaint.complaintDetail,
      consumerRequest: complaint.consumerRequest,
      submissionDate: complaint.submissionDate,
      dueDate: complaint.dueDate,
      establishmentId: complaint.establishmentId,
      consumer: {
        fullName: complaint.consumerFullName,
        email: complaint.consumerEmail,
        phone: complaint.consumerPhone,
        documentType: complaint.consumerDocumentType,
        documentNumber: complaint.consumerDocumentNumber,
      },
    },
  };
}

/** Delivers an event to every active webhook of the business subscribed to it. */
export async function dispatchWebhookEvent(businessId: string, event: string, payload: WebhookPayload): Promise<void> {
  const targets = await storage.getActiveWebhooks(businessId, event);

  await Promise.all(
    targets.map(async (webhook) => {
      try {
        const body = JSON.stringify(payload);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LibroVirtual-Webhooks/1.0",
            "X-LibroVirtual-Event": event,
            "X-LibroVirtual-Signature": signPayload(webhook.secret, body),
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          console.error(`[webhooks] ${webhook.url} responded ${response.status} for ${event}`);
        }
      } catch (error) {
        console.error(`[webhooks] delivery to ${webhook.url} failed for ${event}:`, error);
      }
    }),
  );
}
