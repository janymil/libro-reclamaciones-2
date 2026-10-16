import type { Express } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";

import { MIN_PASSWORD_LENGTH, accountEmailSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireNonDemo, requireAdmin } from "../middleware/requireAuth";
import { enforceQuota } from "../services/subscriptionService";
import { getManageableBusinessIds } from "../services/tenantAccess";
import { emailService } from "../services/emailService";
import { authService } from "../services/authService";
import { closeBusiness } from "../services/accountClosureService";

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

// Own profile: only the account's own identity fields, and only on the caller's
// own row. The company's phone and address are NOT accepted here - they live on
// the business record and are edited in "Mi empresa" (PATCH /api/businesses/:id),
// so company data has a single write path.
const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: accountEmailSchema.optional(),
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

  // ---- Irreversible deletion ("abandon the app") ------------------------------

  // Registered BEFORE `/api/users/:id`: Express resolves routes in order, so the
  // param route would otherwise swallow "me" and answer 404 for the caller's own
  // account (the same ordering rule App.tsx applies to `/acceso/...`).
  app.delete('/api/users/me', requireAuth, requireNonDemo, deleteOwnAccountHandler);

  /**
   * Removes a team member for good.
   *
   * Admin-only and tenant-scoped like every other user operation, with two
   * refusals that protect the tenant rather than the caller:
   *   * an admin cannot delete its own account here - that is "Eliminar mi
   *     cuenta", which knows what to do about the company, and
   *   * the LAST active administrator cannot be removed: the company would be
   *     left with nobody able to manage it.
   */
  app.delete('/api/users/:id', requireAuth, requireAdmin, requireNonDemo, async (req: any, res) => {
    try {
      if (req.params.id === req.user.id) {
        return res.status(400).json({
          message: 'Su propia cuenta se elimina desde Mi Perfil («Eliminar mi cuenta»).',
          code: 'own_account',
        });
      }

      const target = await storage.getUserById(req.params.id);
      if (!target) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      const allowed = await getManageableBusinessIds(req.user);
      if (!target.businessId || !allowed.has(target.businessId)) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      if (target.role === 'admin' && target.isActive) {
        const members = await storage.getUsersByBusinessIds([target.businessId]);
        const otherAdmins = members.filter(
          (member) => member.role === 'admin' && member.isActive && member.id !== target.id,
        );

        if (otherAdmins.length === 0) {
          return res.status(409).json({
            message:
              "Es el último administrador de esa empresa. Nombre a otro administrador o cierre la empresa antes de eliminarlo.",
            code: "last_administrator",
          });
        }
      }

      await storage.deleteUserAccount(target.id);
      await storage.createAuthAuditLog({
        action: 'user_deleted',
        email: target.email,
        ipAddress: req.ip || req.connection.remoteAddress || '',
        userAgent: req.get('User-Agent') || '',
        success: true,
        userId: req.user.id,
        metadata: { deletedUserId: target.id, businessId: target.businessId },
      });

      res.json({
        message:
          "Usuario eliminado. Sus reclamos y el historial de la empresa se conservan.",
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: "No se pudo eliminar el usuario" });
    }
  });

  /**
   * "Eliminar mi cuenta": the person leaves the app for good.
   *
   * The login disappears. The company does NOT disappear with it unless the
   * caller is its last administrator AND explicitly asks for it
   * (`?closeBusiness=true`): otherwise the tenant and its Libro would be left
   * ownerless, which nobody asked for.
   */
  async function deleteOwnAccountHandler(req: any, res: any) {
    try {
      const user = req.user;
      const closeBusinessFlag = String(req.query.closeBusiness ?? '') === 'true';

      if (user.businessId) {
        const business = await storage.getBusiness(user.businessId);

        if (business) {
          const members = await storage.getUsersByBusinessIds([business.id]);
          const activeAdmins = members.filter((member) => member.role === 'admin' && member.isActive);
          const isLastAdmin = activeAdmins.length === 1 && activeAdmins[0].id === user.id;

          if (isLastAdmin && !closeBusinessFlag) {
            return res.status(409).json({
              message:
                `Es el último administrador de ${business.businessName}. Para eliminar su cuenta, cierre también la empresa.`,
              code: "last_administrator",
              businessName: business.businessName,
            });
          }

          if (isLastAdmin) {
            await closeBusiness(business);
          }
        }
      }

      await storage.deleteUserAccount(user.id);
      await storage.createAuthAuditLog({
        action: 'account_deleted',
        email: user.email,
        ipAddress: req.ip || req.connection.remoteAddress || '',
        userAgent: req.get('User-Agent') || '',
        success: true,
        metadata: { closedBusiness: closeBusinessFlag },
      });

      // The session points at a row that no longer exists: end it here.
      req.session.destroy(() => {
        res.json({
          message: "Su cuenta fue eliminada. Gracias por haber usado LibroDigital.pe.",
        });
      });
    } catch (error) {
      console.error('Error deleting own account:', error);
      res.status(500).json({ message: "No se pudo eliminar la cuenta" });
    }
  }

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

      // A new address is a new mailbox: storage clears `is_email_verified`, and
      // we immediately send the confirmation link to it. Otherwise the account
      // would keep receiving every complaint notification at an address nobody
      // ever proved it owned.
      const emailChanged = Boolean(profileData.email && profileData.email !== req.user.email);

      const user = await storage.updateUserProfile(req.user.id, profileData);
      const { password: _password, ...userWithoutPassword } = user;

      let verificationSent = false;
      if (emailChanged) {
        const sent = await authService
          .resendEmailVerification(
            user.id,
            req.ip || req.connection.remoteAddress || '',
            req.get('User-Agent') || '',
          )
          .catch(() => ({ success: false, message: '' }));
        verificationSent = sent.success;
      }

      res.json({ ...userWithoutPassword, verificationSent });
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
