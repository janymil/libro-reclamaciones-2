import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import {
  type Book,
  type Establishment,
  type InsertEstablishment,
  books,
  establishments,
} from "@shared/schema";

/** Data access for the "establishment" aggregate. */
export const establishmentStorage = {
  async getEstablishment(id: string): Promise<Establishment | undefined> {
    const [establishment] = await db.select().from(establishments).where(eq(establishments.id, id));
    return establishment;
  },

  async getEstablishmentsByBusiness(businessId: string): Promise<Establishment[]> {
    return await db.select().from(establishments)
      .where(and(eq(establishments.businessId, businessId), eq(establishments.isActive, true)))
      .orderBy(asc(establishments.name));
  },

  /**
   * Every establishment of a tenant, active or not.
   *
   * The public portal and the plan quotas keep using the filtered query above; the
   * admin list on /sucursales needs the inactive ones to be able to REACTIVATE a
   * local that was closed (for a renovation, a move), which is the whole point of
   * deactivating instead of deleting.
   */
  async getAllEstablishmentsByBusiness(businessId: string): Promise<Establishment[]> {
    return await db.select().from(establishments)
      .where(eq(establishments.businessId, businessId))
      .orderBy(asc(establishments.name));
  },

  async createEstablishment(establishmentData: InsertEstablishment): Promise<Establishment> {
    const [establishment] = await db
      .insert(establishments)
      .values(establishmentData)
      .returning();
    return establishment;
  },

  /**
   * Creates a sucursal together with its own register in `books`, atomically.
   *
   * What the row is: `/libros` lists it and exports the complaints filed against
   * that establishment (GET /api/books/:id/download), which is what a local
   * inspection asks for - DS 011-2011-PCM expects each establishment open to the
   * public to be able to show its own records. It is NOT a second public Libro:
   * the link, the QR, the inbox, the branding and the folios (`YYYY-NNNN`) belong
   * to the company (`libro_configuration` is unique per business).
   *
   * Committing both rows at once means a failure cannot leave the local without
   * its register - the shape that left /libros empty (the reported "no se creó el
   * libro") and made a local's complaints unexportable until somebody noticed.
   *
   * The type is 'reclamos': the legal book. Other registers for the same
   * establishment (sugerencias, otros) are still added from /libros.
   */
  async createEstablishmentWithBook(
    establishmentData: InsertEstablishment,
  ): Promise<{ establishment: Establishment; book: Book }> {
    return await db.transaction(async (tx) => {
      const [establishment] = await tx
        .insert(establishments)
        .values(establishmentData)
        .returning();

      const [book] = await tx
        .insert(books)
        .values({
          businessId: establishment.businessId,
          establishmentId: establishment.id,
          bookType: "reclamos",
          isActive: true,
        })
        .returning();

      return { establishment, book };
    });
  },

  async updateEstablishment(id: string, updates: Partial<InsertEstablishment>): Promise<Establishment> {
    const [establishment] = await db
      .update(establishments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(establishments.id, id))
      .returning();
    return establishment;
  },
};
