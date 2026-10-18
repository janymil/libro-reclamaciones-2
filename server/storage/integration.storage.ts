import crypto from "crypto";
import { db } from "../db";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import {
  type ApiKey,
  type ApiKeyPublic,
  type Webhook,
  type WebhookDelivery,
  type InsertWebhook,
  apiKeys,
  webhooks,
  webhookDeliveries,
} from "@shared/schema";

/**
 * Integrations (Phase 3.12): API keys for the public REST API and outgoing
 * webhooks. API keys are stored as SHA-256 hashes; the full key is only ever
 * shown once, at creation time.
 */

const API_KEY_PREFIX = "ld_";

/** Strips the hash from an API key row before returning it to a client. */
function toPublicKey(key: ApiKey): ApiKeyPublic {
  const { keyHash: _keyHash, ...safe } = key;
  return safe;
}

/** Generates a new full API key (shown once) alongside its hash. */
export function generateApiKey(): { fullKey: string; keyPrefix: string; keyHash: string } {
  const secret = crypto.randomBytes(24).toString("base64url");
  const fullKey = `${API_KEY_PREFIX}${secret}`;
  return {
    fullKey,
    keyPrefix: fullKey.slice(0, 10),
    keyHash: hashApiKey(fullKey),
  };
}

export function hashApiKey(fullKey: string): string {
  return crypto.createHash("sha256").update(fullKey).digest("hex");
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export const integrationStorage = {
  // ---- API keys --------------------------------------------------------------

  async createApiKey(data: { businessId: string; name: string; keyPrefix: string; keyHash: string }): Promise<ApiKeyPublic> {
    const [key] = await db
      .insert(apiKeys)
      .values(data)
      .returning();
    return toPublicKey(key);
  },

  async getApiKeysByBusiness(businessId: string): Promise<ApiKeyPublic[]> {
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.businessId, businessId))
      .orderBy(desc(apiKeys.createdAt));
    return keys.map(toPublicKey);
  },

  async getApiKeyByKeyHash(keyHash: string): Promise<(ApiKeyPublic & { businessId: string }) | undefined> {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash));
    return key ? { ...toPublicKey(key), businessId: key.businessId } : undefined;
  },

  async markApiKeyUsed(id: string): Promise<void> {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id));
  },

  async revokeApiKey(id: string, businessId: string): Promise<ApiKeyPublic | undefined> {
    const [key] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.businessId, businessId)))
      .returning();
    return key ? toPublicKey(key) : undefined;
  },

  /**
   * Rotates the secret in place. The row (and its name/history) stays the same;
   * the previous key stops authenticating immediately because its hash is
   * replaced. Returns the public projection - the caller adds `fullKey` once.
   */
  async rotateApiKey(
    id: string,
    businessId: string,
    data: { keyPrefix: string; keyHash: string },
  ): Promise<ApiKeyPublic | undefined> {
    const [key] = await db
      .update(apiKeys)
      .set({
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        revokedAt: null,
        lastUsedAt: null,
      })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.businessId, businessId)))
      .returning();
    return key ? toPublicKey(key) : undefined;
  },

  // ---- Webhooks ---------------------------------------------------------------

  async createWebhook(data: InsertWebhook): Promise<Webhook> {
    const [webhook] = await db
      .insert(webhooks)
      .values(data)
      .returning();
    return webhook;
  },

  async getWebhooksByBusiness(businessId: string): Promise<Webhook[]> {
    return await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.businessId, businessId))
      .orderBy(desc(webhooks.createdAt));
  },

  async getWebhook(id: string): Promise<Webhook | undefined> {
    const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    return webhook;
  },

  async getActiveWebhooks(businessId: string, event: string): Promise<Webhook[]> {
    const all = await this.getWebhooksByBusiness(businessId);
    return all.filter((webhook) => {
      if (!webhook.isActive) {
        return false;
      }
      const events = Array.isArray(webhook.events) ? webhook.events : ["complaint.created"];
      return (events as unknown[]).includes(event);
    });
  },

  async updateWebhook(id: string, businessId: string, updates: Partial<InsertWebhook>): Promise<Webhook | undefined> {
    const [webhook] = await db
      .update(webhooks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(webhooks.id, id), eq(webhooks.businessId, businessId)))
      .returning();
    return webhook;
  },

  async deleteWebhook(id: string, businessId: string): Promise<boolean> {
    const rows = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.businessId, businessId)))
      .returning({ id: webhooks.id });

    if (rows.length === 0) {
      return false;
    }

    // The delivery log is not a legal record; deleting the webhook removes its
    // queue instead of leaving orphan rows for the worker to mark dead.
    await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, id));
    return true;
  },

  // ---- Webhook deliveries (retry queue + dead-letter) ------------------------

  async createWebhookDeliveries(
    deliveries: Array<Pick<WebhookDelivery, 'businessId' | 'webhookId' | 'complaintId' | 'event'>>,
  ): Promise<WebhookDelivery[]> {
    if (deliveries.length === 0) {
      return [];
    }
    // `nextAttemptAt` in the past: the enqueue path kicks the worker immediately,
    // and the scheduler is only the backstop.
    return await db
      .insert(webhookDeliveries)
      .values(deliveries.map((delivery) => ({ ...delivery, nextAttemptAt: new Date(0) })))
      .returning();
  },

  /**
   * Requeues deliveries stuck in `sending` (a crash between claiming and
   * finishing one) so the queue cannot lose them silently.
   */
  async releaseStaleWebhookDeliveries(staleBefore: Date): Promise<number> {
    const rows = await db
      .update(webhookDeliveries)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(and(
        eq(webhookDeliveries.status, 'sending'),
        lt(webhookDeliveries.updatedAt, staleBefore),
      ))
      .returning({ id: webhookDeliveries.id });
    return rows.length;
  },

  /**
   * Atomically claims due deliveries. `FOR UPDATE SKIP LOCKED` means two
   * workers (or two app replicas) never deliver the same event twice.
   */
  async claimDueWebhookDeliveries(limit: number, now: Date): Promise<WebhookDelivery[]> {
    const result = await db.execute(sql`
      UPDATE webhook_deliveries
         SET status = 'sending', updated_at = now()
       WHERE id IN (
         SELECT id
           FROM webhook_deliveries
          WHERE status IN ('pending', 'failed')
            AND next_attempt_at <= ${now}
          ORDER BY next_attempt_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING *
    `);

    return ((result as unknown as { rows?: WebhookDelivery[] }).rows ?? []) as WebhookDelivery[];
  },

  async markWebhookDelivered(id: string): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(webhookDeliveries.id, id));
  },

  async markWebhookFailed(
    id: string,
    data: { attempts: number; nextAttemptAt: Date; lastStatusCode: number | null; lastError: string },
  ): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'failed',
        attempts: data.attempts,
        nextAttemptAt: data.nextAttemptAt,
        lastStatusCode: data.lastStatusCode,
        lastError: data.lastError,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, id));
  },

  async markWebhookDead(
    id: string,
    data: { attempts: number; lastStatusCode: number | null; lastError: string },
  ): Promise<void> {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'dead',
        attempts: data.attempts,
        lastStatusCode: data.lastStatusCode,
        lastError: data.lastError,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, id));
  },

  async getWebhookDeliveriesByBusiness(
    businessId: string,
    limit: number,
  ): Promise<Array<WebhookDelivery & { url: string }>> {
    const rows = await db
      .select({
        delivery: webhookDeliveries,
        url: webhooks.url,
      })
      .from(webhookDeliveries)
      .leftJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(eq(webhookDeliveries.businessId, businessId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);

    return rows.map((row) => ({ ...row.delivery, url: row.url ?? '' }));
  },

  async getWebhookDelivery(id: string): Promise<WebhookDelivery | undefined> {
    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, id));
    return delivery;
  },

  /**
   * Manual requeue (button in the integrations screen). Works for failed and
   * dead deliveries; the next worker tick picks it up immediately.
   */
  async retryWebhookDelivery(id: string, businessId: string): Promise<WebhookDelivery | undefined> {
    const [delivery] = await db
      .update(webhookDeliveries)
      .set({
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastStatusCode: null,
        lastError: null,
        deliveredAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(webhookDeliveries.id, id),
        eq(webhookDeliveries.businessId, businessId),
      ))
      .returning();
    return delivery;
  },
};
