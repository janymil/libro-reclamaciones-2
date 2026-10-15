import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  type Payment,
  type InsertPayment,
  type Subscription,
  type InsertSubscription,
  payments,
  subscriptions,
} from "@shared/schema";

/**
 * Payments (Phase 2.7): the SaaS subscription checkout trail.
 *
 * Every row is tenant-scoped by `businessId`, and every read that answers an
 * HTTP request is filtered by it, exactly like the other aggregates. The
 * webhook lookup goes through `providerRef` because at that moment the business
 * is not known yet - the PSP only sends us the id it gave the transaction.
 */
export const paymentStorage = {
  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values(data)
      .returning();
    return payment;
  },

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  },

  async getPaymentByReference(reference: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.reference, reference));
    return payment;
  },

  /**
   * Resolves the transaction reported by a provider webhook. Scoped by provider
   * too, so a Mercado Pago id can never match a Culqi row by coincidence.
   */
  async getPaymentByProviderRef(provider: string, providerRef: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, provider), eq(payments.providerRef, providerRef)));
    return payment;
  },

  async getPaymentsByBusiness(businessId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.businessId, businessId))
      .orderBy(desc(payments.createdAt));
  },

  async updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return payment;
  },

  // ---- Recurring agreements ---------------------------------------------------

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(data)
      .returning();
    return subscription;
  },

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id));
    return subscription;
  },

  /**
   * Resolves the agreement a provider notification belongs to. Scoped by
   * provider so a Mercado Pago id can never match another gateway's row.
   */
  async getSubscriptionByProviderRef(provider: string, providerRef: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, provider), eq(subscriptions.providerRef, providerRef)));
    return subscription;
  },

  /** Most recent agreement of a business (the one the UI should show). */
  async getLatestSubscriptionByBusiness(businessId: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, businessId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription;
  },

  async getSubscriptionsByBusiness(businessId: string): Promise<Subscription[]> {
    return await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.businessId, businessId))
      .orderBy(desc(subscriptions.createdAt));
  },

  /**
   * Used to attach a recurring charge to its agreement when the provider only
   * gives us the charge: the charge carries our own subscription reference as
   * the provider's `external_reference`.
   */
  async getSubscriptionByReference(reference: string): Promise<Subscription | undefined> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.reference, reference));
    return subscription;
  },

  async updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  },
};
