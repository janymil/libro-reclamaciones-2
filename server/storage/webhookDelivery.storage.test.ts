import { describe, it, expect, afterAll } from "vitest";
import crypto from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { webhookDeliveries } from "@shared/schema";
import { storage } from "../storage";

/**
 * Integration test for the webhook retry queue. It runs against the embedded
 * PGlite database (same migration files as production), so the
 * `FOR UPDATE SKIP LOCKED` claim statement and the delivery log are exercised
 * for real instead of being mocked.
 */
const businessId = crypto.randomUUID();
const complaintId = crypto.randomUUID();
const webhookId = crypto.randomUUID();

afterAll(async () => {
  await db.delete(webhookDeliveries).where(eq(webhookDeliveries.businessId, businessId));
});

describe("webhook delivery queue", () => {
  it("creates, claims, retries and lists deliveries", async () => {
    const created = await storage.createWebhookDeliveries([
      { businessId, webhookId, complaintId, event: "complaint.created" },
      { businessId, webhookId, complaintId, event: "complaint.updated" },
    ]);
    expect(created).toHaveLength(2);

    const claimed = await storage.claimDueWebhookDeliveries(10, new Date(Date.now() + 1000));
    expect(claimed.length).toBeGreaterThanOrEqual(2);
    expect(claimed.every((delivery) => delivery.status === "sending")).toBe(true);

    const first = claimed[0];
    await storage.markWebhookFailed(first.id, {
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 1000),
      lastStatusCode: 500,
      lastError: "HTTP 500",
    });

    const retried = await storage.retryWebhookDelivery(first.id, businessId);
    expect(retried?.status).toBe("pending");
    expect(retried?.attempts).toBe(0);

    const listed = await storage.getWebhookDeliveriesByBusiness(businessId, 10);
    expect(listed).toHaveLength(2);
    expect(listed[0]).toHaveProperty("url");

    await storage.markWebhookDelivered(first.id);
    const delivered = await storage.getWebhookDelivery(first.id);
    expect(delivered?.status).toBe("delivered");
    expect(delivered?.deliveredAt).toBeTruthy();
  });
});
