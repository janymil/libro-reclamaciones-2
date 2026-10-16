import crypto from "crypto";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  type ApiKey,
  type ApiKeyPublic,
  type Webhook,
  type InsertWebhook,
  apiKeys,
  webhooks,
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
    return rows.length > 0;
  },
};
