import crypto from "crypto";
import type { Complaint } from "@shared/schema";
import { storage } from "../storage";

/**
 * Outgoing webhooks (Phase 3.12).
 *
 * Businesses (Corporativo) register URLs that receive an HTTP POST with the
 * event payload, signed with an HMAC-SHA256 header (`X-LibroDigital-Signature:
 * sha256=<hex>`) so the receiver can verify authenticity. Delivery is
 * fire-and-forget: failures are logged, never thrown, so the complaint flow
 * is never blocked by a broken customer endpoint.
 */

const WEBHOOK_TIMEOUT_MS = 8_000;

/**
 * SSRF guard for outgoing webhooks.
 *
 * The URL is supplied by the customer's admin, so it must not be allowed to
 * point the server at itself or at internal services (loopback, link-local,
 * RFC1918, cloud metadata endpoints, .internal/.local names). Delivery then
 * also refuses to follow redirects, so a public URL cannot bounce the request
 * into the private network.
 */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.home\.arpa$/i,
];

function isPrivateOrReservedAddress(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 literal (loopback, ULA, link-local, IPv4-mapped)
  if (host.includes(":")) {
    return (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80") ||
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.")
    );
  }

  return false;
}

/** True when the URL is a public http(s) endpoint safe to POST to. */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname;
  if (!hostname || BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }

  return !isPrivateOrReservedAddress(hostname);
}

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
        // Re-validate at delivery time as well: the guard must hold even for
        // rows created before the check existed.
        if (!isSafeWebhookUrl(webhook.url)) {
          console.error(`[webhooks] refusing to deliver ${event} to a non-public URL`);
          return;
        }

        const body = JSON.stringify(payload);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "LibroDigital-Webhooks/1.0",
            "X-LibroDigital-Event": event,
            "X-LibroDigital-Signature": signPayload(webhook.secret, body),
          },
          body,
          signal: controller.signal,
          // Never follow redirects: they are a classic SSRF bypass.
          redirect: "error",
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
