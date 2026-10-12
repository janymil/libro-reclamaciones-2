import type { Express } from "express";
import bcrypt from "bcrypt";

import { storage } from "../storage";
import { requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { enforceQuota } from "../services/subscriptionService";

/**
 * Team members of the authenticated business, plus own profile and password.
 */
export function registerUsersRoutes(app: Express): void {
  // Users routes
  app.get('/api/users', requireAuth, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', requireAuth, requireNonDemo, async (req: any, res) => {
    try {
      const { username, firstName, lastName, email, password, role, businessId } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado" });
      }

      // Plan quota on team members (Phase 2.6)
      const targetBusinessId = businessId || req.user.businessId || null;
      if (targetBusinessId) {
        const quota = await enforceQuota(targetBusinessId, req.user.id, 'users');
        if (!quota.allowed) {
          return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
        }
      }

      // The form collects a single username; map it onto the first/last name columns
      const displayName = String(username || email.split('@')[0]).trim();
      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || displayName,
        lastName: lastName || '',
        role: role || 'user',
        businessId: businessId || req.user.businessId || null,
        isActive: true,
      });

      const { password: _password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch('/api/users/:id/status', requireAuth, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const { isActive } = req.body;
      const user = await storage.updateUserStatus(userId, isActive);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  app.patch('/api/users/profile', requireAuth, async (req: any, res) => {
    try {
      const profileData = req.body;
      const user = await storage.updateUserProfile(req.user.id, profileData);
      const { password: _password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to update profile",
      });
    }
  });

  app.post('/api/users/change-password', requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Las contraseñas son requeridas" });
      }

      await storage.changeUserPassword(req.user.id, currentPassword, newPassword);
      res.json({ message: "Contraseña actualizada exitosamente" });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to change password",
      });
    }
  });

  app.get('/api/users/stats', requireAuth, async (req: any, res) => {
    try {
      const stats = await storage.getUserStats(req.user.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user stats" });
    }
  });
}
