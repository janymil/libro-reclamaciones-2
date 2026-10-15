import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  type LibroConfiguration,
  type InsertLibroConfiguration,
  libroConfiguration,
} from "@shared/schema";

/** Data access for the "libro" aggregate. */
export const libroStorage = {
  async createLibroConfiguration(configData: InsertLibroConfiguration): Promise<LibroConfiguration> {
    const [config] = await db
      .insert(libroConfiguration)
      .values(configData)
      .returning();
    return config;
  },

  async getLibroConfiguration(businessId: string): Promise<LibroConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(libroConfiguration)
      .where(eq(libroConfiguration.businessId, businessId));
    return config;
  },

  async getLibroConfigurationBySlug(slug: string): Promise<LibroConfiguration | undefined> {
    const [config] = await db
      .select()
      .from(libroConfiguration)
      .where(eq(libroConfiguration.urlSlug, slug));
    return config;
  },

  /**
   * Every active Libro configuration.
   *
   * Used by the WhatsApp webhook, which receives a `display_phone_number` (not a
   * tenant id) and must resolve it to the business that owns the number:
   * `whatsapp_number` is free text typed by the customer, so the comparison is
   * done on normalized digits in the service, not in SQL.
   */
  async getActiveLibroConfigurations(): Promise<LibroConfiguration[]> {
    return db
      .select()
      .from(libroConfiguration)
      .where(eq(libroConfiguration.isActive, true));
  },

  async updateLibroConfiguration(id: string, updates: Partial<InsertLibroConfiguration>): Promise<LibroConfiguration> {
    const [config] = await db
      .update(libroConfiguration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(libroConfiguration.id, id))
      .returning();
    return config;
  },
};
