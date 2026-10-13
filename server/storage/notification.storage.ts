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

  /**
   * Marks a notification read. The businessId is mandatory: without it any
   * authenticated user could flip the read state of another tenant's
   * notifications (cross-tenant IDOR). Returns false when the notification
   * does not belong to the tenant.
   */
  async markNotificationAsRead(id: string, businessId: string): Promise<boolean> {
    const rows = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.businessId, businessId)))
      .returning({ id: notifications.id });
    return rows.length > 0;
  },
};
