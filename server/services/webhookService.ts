import crypto from "crypto";
import type { Complaint } from "@shared/schema";
import { storage } from "../storage";
import { hasFeature } from "./subscriptionService";

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

export const WEBHOOK_EVENTS = [
  "complaint.created",
  "complaint.updated",
  "complaint.responded",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Delivery policy: 5 attempts, then the dead-letter state. */
export const MAX_WEBHOOK_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [
  60_000,          // 1 minute
  5 * 60_000,      // 5 minutes
  30 * 60_000,     // 30 minutes
  2 * 60 * 60_000, // 2 hours
];

/** Delay before the next attempt, given how many attempts already failed. */
export function webhookRetryDelayMs(failedAttempts: number): number {
  const index = Math.max(0, Math.min(failedAttempts - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index];
}

export interface WebhookPayload {
  event: WebhookEvent;
  created: string;
  data: Record<string, unknown>;
}

export function signPayload(secret: string, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Consumer-safe complaint payload for outgoing webhooks.
 *
 * `includeConsumerData` defaults to true for backwards compatibility. A
 * customer that would rather not receive PII on its endpoint can turn it off
 * and fetch the complaint detail through `GET /api/v1/complaints/:id`; the
 * event then carries `hasConsumerData: false` so the receiver knows to fetch it.
 */
export function buildWebhookPayload(
  event: WebhookEvent,
  complaint: Complaint,
  includeConsumerData: boolean = true,
): WebhookPayload {
  const data: Record<string, unknown> = {
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
    responseDate: complaint.responseDate,
    providerActions: complaint.providerActions,
    providerResponse: complaint.providerResponse,
    responseMethod: complaint.responseMethod,
    isOverdue: complaint.isOverdue,
    hasConsumerData: includeConsumerData,
  };

  if (includeConsumerData) {
    data.consumer = {
      fullName: complaint.consumerFullName,
      email: complaint.consumerEmail,
      phone: complaint.consumerPhone,
      documentType: complaint.consumerDocumentType,
      documentNumber: complaint.consumerDocumentNumber,
    };
  }

  return {
    event,
    created: new Date().toISOString(),
    data,
  };
}

/** Backwards-compatible helper for the `complaint.created` event. */
export function complaintCreatedPayload(complaint: Complaint, includeConsumerData = true): WebhookPayload {
  return buildWebhookPayload("complaint.created", complaint, includeConsumerData);
}


export interface EnqueueResult {
  queued: number;
  reason?: string;
}

/**
 * Enqueues one event for every active webhook of the business subscribed to it.
 *
 * The queue row stores only ids; the payload is rebuilt at delivery time. The
 * function is deliberately non-throwing: a broken webhook must never block the
 * complaint flow.
 */
export async function enqueueWebhookEvent(
  businessId: string,
  event: WebhookEvent,
  complaint: Complaint,
): Promise<EnqueueResult> {
  try {
    if (!(await hasFeature(businessId, "webhooks"))) {
      return { queued: 0, reason: "plan_upgrade_required" };
    }

    const targets = await storage.getActiveWebhooks(businessId, event);
    if (targets.length === 0) {
      return { queued: 0 };
    }

    const rows = await storage.createWebhookDeliveries(
      targets.map((webhook) => ({
        businessId,
        webhookId: webhook.id,
        complaintId: complaint.id,
        event,
      })),
    );

    // Attempt immediately; the scheduler is only the retry/backstop.
    void processWebhookDeliveries().catch(() => {});

    return { queued: rows.length };
  } catch (error) {
    console.error(`[webhooks] could not enqueue ${event}:`, error);
    return { queued: 0, reason: "enqueue_failed" };
  }
}

export interface WebhookSweepResult {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  requeuedStale: number;
}

let processing = false;

/**
 * Delivers due webhook events: first attempts and retries.
 *
 * Safe to call concurrently: `FOR UPDATE SKIP LOCKED` in the storage layer
 * ensures a delivery is claimed by exactly one worker. A process-local flag
 * avoids pointless contention inside a single instance.
 */
export async function processWebhookDeliveries(limit: number = 25): Promise<WebhookSweepResult> {
  const result: WebhookSweepResult = { claimed: 0, delivered: 0, failed: 0, dead: 0, requeuedStale: 0 };

  if (processing) {
    return result;
  }
  processing = true;

  try {
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    result.requeuedStale = await storage.releaseStaleWebhookDeliveries(staleBefore);

    const due = await storage.claimDueWebhookDeliveries(limit, new Date());
    result.claimed = due.length;

    await Promise.all(
      due.map(async (delivery) => {
        const dead = async (error: string, statusCode: number | null = null) => {
          await storage.markWebhookDead(delivery.id, {
            attempts: delivery.attempts + 1,
            lastStatusCode: statusCode,
            lastError: error,
          });
          result.dead += 1;
        };

        const webhook = await storage.getWebhook(delivery.webhookId);
        if (!webhook || !webhook.isActive || webhook.businessId !== delivery.businessId) {
          await dead("webhook_inactive");
          return;
        }

        // Commercial gate at delivery time too: a downgrade stops deliveries
        // instead of leaving a paid feature running for free.
        if (!(await hasFeature(delivery.businessId, "webhooks"))) {
          await dead("plan_upgrade_required");
          return;
        }

        // Re-validate at delivery time as well: the guard must hold even for
        // rows created before the check existed.
        if (!isSafeWebhookUrl(webhook.url)) {
          await dead("unsafe_url");
          return;
        }

        const complaint = await storage.getComplaint(delivery.complaintId);
        if (!complaint || complaint.businessId !== delivery.businessId) {
          await dead("complaint_not_found");
          return;
        }

        const event = isWebhookEvent(delivery.event) ? delivery.event : "complaint.created";
        const payload = buildWebhookPayload(event, complaint, webhook.includeConsumerData);
        const body = JSON.stringify(payload);
        const attempt = delivery.attempts + 1;

        let statusCode: number | null = null;
        let errorMessage: string | null = null;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "LibroDigital-Webhooks/1.0",
              "X-LibroDigital-Event": event,
              "X-LibroDigital-Signature": signPayload(webhook.secret, body),
              "X-LibroDigital-Delivery": delivery.id,
              "X-LibroDigital-Attempt": String(attempt),
            },
            body,
            signal: controller.signal,
            // Never follow redirects: they are a classic SSRF bypass.
            redirect: "error",
          });

          statusCode = response.status;
          if (!response.ok) {
            errorMessage = `HTTP ${response.status}`;
          }
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : "delivery_failed";
        } finally {
          clearTimeout(timer);
        }

        if (!errorMessage) {
          await storage.markWebhookDelivered(delivery.id);
          result.delivered += 1;
          return;
        }

        const friendlyError = errorMessage.slice(0, 500);
        if (attempt >= MAX_WEBHOOK_ATTEMPTS) {
          await storage.markWebhookDead(delivery.id, {
            attempts: attempt,
            lastStatusCode: statusCode,
            lastError: friendlyError,
          });
          result.dead += 1;
          console.error(`[webhooks] dead-letter after ${attempt} attempts: ${webhook.url} (${friendlyError})`);
          return;
        }

        await storage.markWebhookFailed(delivery.id, {
          attempts: attempt,
          nextAttemptAt: new Date(Date.now() + webhookRetryDelayMs(attempt)),
          lastStatusCode: statusCode,
          lastError: friendlyError,
        });
        result.failed += 1;
        console.error(`[webhooks] attempt ${attempt} failed for ${webhook.url}: ${friendlyError}`);
      }),
    );

    return result;
  } catch (error) {
    console.error("[webhooks] delivery sweep failed:", error);
    return result;
  } finally {
    processing = false;
  }
}

let workerStarted = false;

/**
 * Starts the retry/backstop worker. Called from the shared scheduler at boot.
 * `unref` keeps tests and CLI scripts from waiting for the next tick.
 */
export function startWebhookWorker(): void {
  if (workerStarted) {
    return;
  }
  workerStarted = true;

  const initial = setTimeout(() => {
    void processWebhookDeliveries();
    const interval = setInterval(() => void processWebhookDeliveries(), 60_000);
    interval.unref?.();
  }, 10_000);
  initial.unref?.();

  console.log("[webhooks] delivery worker armed (retries every minute)");
}
