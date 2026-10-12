import { db } from "../db";
import { eq, and, desc, sql, or } from "drizzle-orm";
import {
  type Notification,
  type InsertNotification,
  notifications,
} from "@shared/schema";

/** Data access for the "notification" aggregate. */
export const notificationStorage = {
  async getNotifications(businessId: string, userId?: string): Promise<Notification[]> {
    const conditions = [eq(notifications.businessId, businessId)];
    
    if (userId) {
      const userCondition = or(
        eq(notifications.userId, userId),
        sql`${notifications.userId} IS NULL`
      );
      if (userCondition) {
        conditions.push(userCondition);
      }
    }
    
    return await db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  },

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(notificationData)
      .returning();
    return notification;
  },

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  },
};
