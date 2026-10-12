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

  async updateLibroConfiguration(id: string, updates: Partial<InsertLibroConfiguration>): Promise<LibroConfiguration> {
    const [config] = await db
      .update(libroConfiguration)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(libroConfiguration.id, id))
      .returning();
    return config;
  },
};
