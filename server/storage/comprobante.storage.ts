import { db } from "../db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  businesses,
  comprobantes,
  payments,
  type Comprobante,
  type InsertComprobante,
  type Payment,
} from "@shared/schema";

/**
 * Comprobantes (Phase 1: emisión manual).
 *
 * One row per payment; the unique index on `payment_id` is what makes
 * `ensureComprobanteForPayment` idempotent when the provider retries a webhook.
 * Reads that answer an HTTP request are tenant-scoped by `businessId`, exactly
 * like every other aggregate.
 */

/** Row plus the buyer's identity for the operator table. */
export interface ComprobanteWithBusiness {
  comprobante: Comprobante;
  businessName: string | null;
  ruc: string | null;
  /** The payment code the customer quotes (LD-XXXXXX). */
  paymentReference: string | null;
}

export const comprobanteStorage = {
  async createComprobante(data: InsertComprobante): Promise<Comprobante> {
    const [row] = await db.insert(comprobantes).values(data).returning();
    return row;
  },

  async getComprobante(id: string): Promise<Comprobante | undefined> {
    const [row] = await db.select().from(comprobantes).where(eq(comprobantes.id, id));
    return row;
  },

  async getComprobanteByPaymentId(paymentId: string): Promise<Comprobante | undefined> {
    const [row] = await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.paymentId, paymentId));
    return row;
  },

  async getComprobanteByNumber(
    docType: string,
    serie: string,
    number: string,
  ): Promise<Comprobante | undefined> {
    const [row] = await db
      .select()
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.docType, docType),
          eq(comprobantes.serie, serie),
          eq(comprobantes.number, number),
        ),
      );
    return row;
  },

  async getComprobantesByBusiness(businessId: string): Promise<Comprobante[]> {
    return await db
      .select()
      .from(comprobantes)
      .where(eq(comprobantes.businessId, businessId))
      .orderBy(desc(comprobantes.createdAt));
  },

  async listAllComprobantes(limit = 500): Promise<Comprobante[]> {
    return await db
      .select()
      .from(comprobantes)
      .orderBy(desc(comprobantes.createdAt))
      .limit(limit);
  },

  async listAllComprobantesWithBusiness(limit = 500): Promise<ComprobanteWithBusiness[]> {
    return await db
      .select({
        comprobante: comprobantes,
        businessName: businesses.businessName,
        ruc: businesses.ruc,
        paymentReference: payments.reference,
      })
      .from(comprobantes)
      .leftJoin(businesses, eq(comprobantes.businessId, businesses.id))
      .leftJoin(payments, eq(comprobantes.paymentId, payments.id))
      .orderBy(desc(comprobantes.createdAt))
      .limit(limit);
  },

  async updateComprobante(
    id: string,
    updates: Partial<InsertComprobante>,
  ): Promise<Comprobante | undefined> {
    const [row] = await db
      .update(comprobantes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(comprobantes.id, id))
      .returning();
    return row;
  },

  /**
   * Highest numeric correlativo in a serie.
   *
   * The cast is guarded by a regex so one malformed row can never break the
   * "next number" suggestion; `number` is varchar because SUNAT allows leading
   * zeros, which an integer would silently eat.
   */
  async maxComprobanteNumber(docType: string, serie: string): Promise<number> {
    const [row] = await db
      .select({
        max: sql<string | null>`max(cast(${comprobantes.number} as integer))`,
      })
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.docType, docType),
          eq(comprobantes.serie, serie),
          sql`${comprobantes.number} ~ '^[0-9]+$'`,
        ),
      );
    return row?.max ? Number(row.max) : 0;
  },

  async countComprobantesByStatus(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        status: comprobantes.status,
        total: sql<number>`count(*)::int`,
      })
      .from(comprobantes)
      .groupBy(comprobantes.status);

    return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  },

  /**
   * Paid charges that predate this feature (or whose creation failed) and still
   * have no comprobante. The console's backfill turns them into pending rows, so
   * a customer who paid before the launch can still receive an invoice.
   */
  async listPaymentsWithoutComprobante(limit = 500): Promise<Payment[]> {
    const rows = await db
      .select({ payment: payments })
      .from(payments)
      .leftJoin(comprobantes, eq(comprobantes.paymentId, payments.id))
      .where(and(eq(payments.status, "paid"), isNull(comprobantes.id)))
      .orderBy(desc(payments.paidAt))
      .limit(limit);

    return rows.map((row) => row.payment);
  },
};
