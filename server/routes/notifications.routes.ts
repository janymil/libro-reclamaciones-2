import type { Express } from "express";

import { storage } from "../storage";
import { requireAuth } from "../middleware/requireAuth";

/**
 * In-app notifications for the authenticated business.
 */
export function registerNotificationsRoutes(app: Express): void {
  // Notifications routes
  app.get('/api/notifications', requireAuth, async (req: any, res) => {
    try {
      const notifications = await storage.getNotifications(req.user.businessId, req.user.id);
      res.json(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch('/api/notifications/:id/read', requireAuth, async (req: any, res) => {
    try {
      // Tenant-scoped: the update only applies when the notification belongs
      // to the caller's business (cross-tenant IDOR defense).
      const updated = await storage.markNotificationAsRead(req.params.id, req.user.businessId);
      if (!updated) {
        return res.status(404).json({ message: "Notificación no encontrada" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });
}
