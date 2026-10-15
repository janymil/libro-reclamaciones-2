import type { Express } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";

import { MIN_PASSWORD_LENGTH, accountEmailSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireNonDemo, requireAdmin } from "../middleware/requireAuth";
import { enforceQuota } from "../services/subscriptionService";
import { getManageableBusinessIds } from "../services/tenantAccess";
import { emailService } from "../services/emailService";

// Whitelisted input for team-member creation. The target business is optional
// (defaults to the caller's active tenant) and is ALWAYS validated server-side
// against the caller's manageable tenants - a client can never enroll a user
// (let alone an admin) into a tenant it does not manage.
const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: accountEmailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`).max(200),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
  businessId: z.string().uuid().nullish(),
});

// Own profile: only these fields may change, and only on the caller's own row.
const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: accountEmailSchema.optional(),
  phone: z.string().trim().max(20).nullish(),
  // The registered address is mandatory on the business record, so it can be
  // updated but never cleared.
  address: z.string().trim().min(1).max(500).optional(),
});

/**
 * Team members of the authenticated business, plus own profile and password.
 *
 * Tenant boundary: every operation is scoped to the caller's active tenant
 * plus its multi-RUC access grants (getManageableBusinessIds). No identifier
 * from the client is ever trusted on its own.
 */
export function registerUsersRoutes(app: Express): void {
  // Users routes
  app.get('/api/users', requireAuth, async (req: any, res) => {
    try {
      // Only the members of the tenants this login manages. Returning every
      // account in the platform would leak other companies' staff PII to any
      // authenticated user.
      const allowed = await getManageableBusinessIds(req.user);
      const users = await storage.getUsersByBusinessIds([...allowed]);

      // Data minimization: the team page needs who they are and their access
      // level - not last-login times, onboarding state or verification flags.
      res.json(users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        businessId: user.businessId,
        businessName: user.businessName,
        isActive: user.isActive,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', requireAuth, requireAdmin, requireNonDemo, async (req: any, res) => {
    try {
      const data = createUserSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado" });
      }

      // Tenant spoofing defense: the target business must be one the caller
      // actually manages (active tenant or an explicit multi-RUC grant).
      const allowed = await getManageableBusinessIds(req.user);
      const targetBusinessId = data.businessId || req.user.businessId || null;
      if (!targetBusinessId || !allowed.has(targetBusinessId)) {
        return res.status(403).json({ message: "No puede crear usuarios en una empresa que no administra" });
      }

      // Plan quota on team members (Phase 2.6)
      const quota = await enforceQuota(targetBusinessId, req.user.id, 'users');
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      // The form collects a single username; map it onto the first/last name columns
      const displayName = String(data.username || data.email.split('@')[0]).trim();
      const hashedPassword = await bcrypt.hash(data.password, 12);

      const user = await storage.createUser({
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName || displayName,
        lastName: data.lastName || '',
        role: data.role,
        businessId: targetBusinessId,
        isActive: true,
      });

      // A user created under a secondary RUC gets the access grant so the
      // login can switch into the tenant it belongs to.
      if (targetBusinessId !== req.user.businessId) {
        await storage.grantBusinessAccess({
          userId: user.id,
          businessId: targetBusinessId,
          role: data.role,
        });
      }

      const { password: _password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating user:', error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch('/api/users/:id/status', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const target = await storage.getUserById(req.params.id);
      if (!target) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Cross-tenant guard: the target account must live in a tenant the
      // caller manages - otherwise any admin could disable another company's
      // staff (or re-enable a suspended account).
      const allowed = await getManageableBusinessIds(req.user);
      if (!target.businessId || !allowed.has(target.businessId)) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // An admin must not lock itself out of its own tenant.
      if (target.id === req.user.id) {
        return res.status(400).json({ message: "No puede cambiar el estado de su propia cuenta" });
      }

      const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
      const user = await storage.updateUserStatus(target.id, isActive);
      const { password: _password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  app.patch('/api/users/profile', requireAuth, async (req: any, res) => {
    try {
      const profileData = updateProfileSchema.parse(req.body);

      // Email changes must not collide with an existing account.
      if (profileData.email) {
        const existing = await storage.getUserByEmail(profileData.email);
        if (existing && existing.id !== req.user.id) {
          return res.status(400).json({ message: "El email ya está registrado" });
        }
      }

      const user = await storage.updateUserProfile(req.user.id, profileData);
      const { password: _password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
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
      if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
      }

      await storage.changeUserPassword(req.user.id, currentPassword, newPassword);

      // Fire-and-forget: confirm the change so an unauthorized password swap is
      // noticed. A mail failure must not fail the password change itself.
      void emailService
        .sendPasswordChangeConfirmation(req.user.email, req.user.firstName)
        .catch((error) => console.error('[email] password-change confirmation failed:', error));

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
