import type { Express } from "express";
import { z } from "zod";

import {
  businessProfileSchema,
  emailVerificationSchema,
  forgotPasswordSchema,
  insertLibroConfigurationSchema,
  loginSchema as authLoginSchema,
  resetPasswordSchema,
  userRegistrationSchema,
} from "@shared/schema";

import { authService } from "../services/authService";
import { defaultEstablishmentFor } from "../services/establishmentProvisioning";
import { newBusinessTrialDefaults } from "../services/subscriptionService";
import { storage } from "../storage";
import { authLimiter, passwordResetLimiter, registerLimiter } from "../middleware/rateLimits";
import { requireAuth } from "../middleware/requireAuth";

/**
 * The one and only answer the forgot-password endpoint ever returns.
 *
 * Returning it for unknown addresses, deactivated accounts and delivery failures
 * alike is what stops the endpoint from being used to discover which emails have
 * accounts (account enumeration).
 */
const FORGOT_PASSWORD_RESPONSE =
  "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.";

/**
 * Registration, login, logout and onboarding completion.
 */
export function registerAuthRoutes(app: Express): void {
  // Step 1: User Registration (sends password via email)
  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
      const userData = userRegistrationSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.registerUser(userData, ipAddress, userAgent);
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      res.status(201).json({ 
        message: result.message,
        nextStep: 'check_email',
        userId: result.userId 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos inválidos", 
          errors: error.errors 
        });
      }
      console.error('Registration error:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Login with email and password
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const loginData = authLoginSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.loginUser(loginData, ipAddress, userAgent);
      
      if (!result.success) {
        return res.status(401).json({ message: result.message });
      }

      // Rotate the session id on privilege change: without regeneration an
      // attacker who planted a session id before login (fixation) would keep
      // it valid afterwards.
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });
      (req.session as any).userId = result.user!.id;

      res.json({
        user: result.user,
        message: result.message
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos inválidos", 
          errors: error.errors 
        });
      }
      console.error('Login error:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Logout
  app.post('/api/auth/logout', async (req: any, res) => {
    if (req.session.userId) {
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      // req.user is not populated here (no requireAuth on this route), so
      // resolve the account for the audit trail before destroying the session.
      const user = await storage.getUserById(req.session.userId).catch(() => undefined);
      await authService.logoutUser(req.session.userId, user?.email ?? 'unknown', ipAddress, userAgent);
    }

    req.session.destroy((err: any) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ message: "Error al cerrar sesión" });
      }
      res.json({ message: "Sesión cerrada exitosamente" });
    });
  });

  // ---- Self-service password recovery --------------------------------------

  // Step 1: request a reset link. Always answers 200 with the same body whether
  // or not the address exists (see FORGOT_PASSWORD_RESPONSE).
  app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      await authService.requestPasswordReset(email, ipAddress, userAgent);

      res.json({ message: FORGOT_PASSWORD_RESPONSE });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Datos inválidos",
          errors: error.errors,
        });
      }
      console.error('Forgot password error:', error);
      // Deliberately the same success-shaped answer: a failure here must not
      // reveal whether the address is registered.
      res.json({ message: FORGOT_PASSWORD_RESPONSE });
    }
  });

  // Step 2: consume the token from the email link and set the new password.
  app.post('/api/auth/reset-password', passwordResetLimiter, async (req, res) => {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.resetPassword(token, password, ipAddress, userAgent);

      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      res.json({ message: result.message });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Datos inválidos",
          errors: error.errors,
        });
      }
      console.error('Reset password error:', error);
      res.status(500).json({ message: "No se pudo restablecer la contraseña" });
    }
  });

  // ---- Email verification ("confirma tu correo") ------------------------------

  // Step 2 of signup: the link inside the welcome email points here.
  // Public (the user may not be signed in) and rate-limited with the recovery
  // limiter, since it takes a secret token from the query string.
  app.post('/api/auth/verify-email', passwordResetLimiter, async (req, res) => {
    try {
      const { token } = emailVerificationSchema.parse(req.body);
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.verifyEmail(token, ipAddress, userAgent);

      // A dead or expired link is not a client error to shout about: the page
      // shows the same friendly notice and offers a new link.
      res.status(result.success ? 200 : 400).json({
        message: result.message,
        verified: result.success,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Token inválido", errors: error.errors });
      }
      console.error('Verify email error:', error);
      res.status(500).json({ message: "No se pudo confirmar el correo" });
    }
  });

  // Resend the verification link for the signed-in account.
  app.post('/api/auth/resend-verification', requireAuth, async (req: any, res) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.resendEmailVerification(req.user.id, ipAddress, userAgent);

      res.status(result.success ? 200 : 400).json({ message: result.message, sent: result.success });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ message: "No se pudo enviar el enlace de confirmación" });
    }
  });

  // Get current user (protected)
  app.get('/api/auth/user', requireAuth, (req: any, res) => {
    res.json(req.user);
  });

  // ---- Multi-RUC switching (Phase 2.7) ---------------------------------------

  // Businesses this login may manage: explicit grants plus the active one
  app.get('/api/auth/businesses', requireAuth, async (req: any, res) => {
    try {
      const access = await storage.getUserBusinessAccess(req.user.id);

      // Seed the active business into the list (bootstrap: pre-existing
      // accounts had no access rows)
      const ids = new Set(access.map((entry) => entry.businessId));
      let list = access;

      if (req.user.businessId && !ids.has(req.user.businessId)) {
        const active = await storage.getBusiness(req.user.businessId);
        if (active) {
          list = [
            {
              id: 'active',
              userId: req.user.id,
              businessId: active.id,
              role: req.user.role,
              createdAt: new Date(),
              businessName: active.businessName,
              ruc: active.ruc,
            },
            ...access,
          ];
        }
      }

      res.json(list.map((entry) => ({
        businessId: entry.businessId,
        businessName: entry.businessName,
        ruc: entry.ruc,
        role: entry.role,
        isActive: entry.businessId === req.user.businessId,
      })));
    } catch (error) {
      console.error('Error listing user businesses:', error);
      res.status(500).json({ message: "No se pudieron listar las empresas" });
    }
  });

  // Switch the active business of this login
  app.post('/api/auth/switch-business', requireAuth, async (req: any, res) => {
    try {
      const { businessId } = req.body as { businessId?: string };
      if (!businessId) {
        return res.status(400).json({ message: "businessId es requerido" });
      }

      const business = await storage.getBusiness(businessId);
      if (!business || !business.isActive) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      // Access: explicit grant, or it is already the user's active business
      const hasAccess =
        businessId === req.user.businessId || (await storage.hasBusinessAccess(req.user.id, businessId));
      if (!hasAccess) {
        return res.status(403).json({ message: "No tiene acceso a esa empresa" });
      }

      const updated = await storage.updateUser(req.user.id, { businessId });
      const { password: _password, ...safeUser } = updated;

      res.json({ message: `Empresa activa: ${business.businessName}`, user: safeUser });
    } catch (error) {
      console.error('Error switching business:', error);
      res.status(500).json({ message: "No se pudo cambiar de empresa" });
    }
  });

  /**
   * Step 2 of onboarding: business + libro configuration, atomically.
   *
   * The whole write happens in ONE transaction (storage.completeOnboarding), and
   * the user is flagged "onboarded" only as the last statement inside it. Before
   * this, a failure between the business insert and the establishment left an
   * "onboarded" account with no libro - and, because the route demanded
   * `onboardingStep === 1`, that state could never be repaired by retrying.
   *
   * Two dead ends are now recoverable instead:
   *  - a RUC this login already created on a failed attempt -> resume, and
   *  - a RUC owned by another account -> 409 + the "solicitar acceso" path.
   */
  app.post('/api/auth/complete-onboarding', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;

      if (user.onboardingCompleted) {
        return res.status(409).json({
          message: "Tu cuenta ya está configurada.",
          code: "already_onboarded",
          redirectTo: '/panel',
        });
      }

      const { businessData, libroData } = req.body;

      // Validate business data. Only the legal identity fields are accepted:
      // the subscription plan/status/lifecycle are server-assigned, otherwise
      // a new signup could grant itself a paid plan or skip the trial.
      const validBusinessData = businessProfileSchema.parse(businessData);

      // businessId/userId are assigned by the transaction (the tenant may be
      // created by this very call), so they are not accepted from the client.
      const validLibroData = insertLibroConfigurationSchema
        .omit({ businessId: true, userId: true })
        .parse(libroData);

      // The public URL is globally unique. Checked before writing anything so the
      // user gets a fixable message instead of a rolled-back transaction.
      const slugOwner = await storage.getLibroConfigurationBySlug(validLibroData.urlSlug);
      if (slugOwner && slugOwner.businessId !== user.businessId) {
        return res.status(409).json({
          message: `La URL pública "${validLibroData.urlSlug}" ya está en uso. Elige otra.`,
          code: "slug_taken",
        });
      }

      // A RUC belongs to exactly one tenant. Three cases:
      //  1. unknown                  -> create it
      //  2. created by an earlier, failed attempt of THIS login (the access grant
      //     identifies it as ours) -> resume it instead of failing on the unique
      //     RUC constraint
      //  3. owned by someone else    -> 409 with the way forward
      const existingBusiness = await storage.getBusinessByRuc(validBusinessData.ruc);
      let resumableBusinessId: string | null = null;

      if (existingBusiness) {
        const access = await storage.getUserBusinessAccess(user.id);
        const isOurs =
          user.businessId === existingBusiness.id ||
          access.some((entry) => entry.businessId === existingBusiness.id);

        if (!isOurs) {
          return res.status(409).json({
            message:
              "Ese RUC ya está registrado por otra cuenta. Puedes solicitar acceso a esa empresa; el administrador actual debe aprobarlo.",
            code: "ruc_already_registered",
            businessName: existingBusiness.businessName,
          });
        }

        resumableBusinessId = existingBusiness.id;
      }

      const result = await storage.completeOnboarding({
        userId: user.id,
        existingBusinessId: resumableBusinessId,
        refreshBusinessProfile: Boolean(resumableBusinessId),
        // Plan and lifecycle are server-assigned: a wizard payload can never
        // mint a paid plan or skip the trial.
        business: { ...validBusinessData, ...newBusinessTrialDefaults() },
        libro: validLibroData,
        // Every business needs at least one establishment so the public portal
        // has a "lugar" to file against. Online stores get a virtual channel
        // instead of a physical sucursal (DS 011-2011-PCM: selling over the
        // Internet requires the book be reachable from that medium).
        establishment: defaultEstablishmentFor(
          { address: validBusinessData.address, phone: validBusinessData.phone ?? null },
          validLibroData.businessType,
        ),
      });

      res.json({
        message: "Onboarding completado exitosamente",
        business: result.business,
        libroConfig: result.config,
        establishment: result.establishment,
        // true when a previous attempt had already created the tenant
        resumed: !result.createdBusiness,
        redirectTo: '/panel',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos inválidos", 
          errors: error.errors 
        });
      }

      // Unique-violation race: another signup took the slug between the check
      // above and the insert. The transaction rolled back, so nothing is half
      // written and the user can simply pick another URL.
      const pgCode = (error as any)?.code ?? (error as any)?.cause?.code;
      if (pgCode === '23505') {
        return res.status(409).json({
          message: 'Esa URL pública acaba de ser tomada por otra empresa. Elige otra.',
          code: 'slug_taken',
        });
      }

      // The transaction guarantees all-or-nothing, so the account is exactly as
      // it was: the wizard can be retried.
      console.error('Onboarding completion error:', error);
      res.status(500).json({
        message: "No se pudo completar la configuración. Tus datos no se guardaron; puedes intentarlo nuevamente.",
        code: "onboarding_failed",
      });
    }
  });
}
