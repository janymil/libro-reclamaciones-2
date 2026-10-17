import type { Express } from "express";
import { z } from "zod";

import {
  businessProfileSchema,
  emailVerificationSchema,
  forgotPasswordSchema,
  insertLibroConfigurationSchema,
  libroSlugSchema,
  loginCodeSchema as authLoginCodeSchema,
  loginSchema as authLoginSchema,
  requestLoginCodeSchema,
  resetPasswordSchema,
  userRegistrationSchema,
} from "@shared/schema";

import { authService } from "../services/authService";
import { defaultEstablishmentFor } from "../services/establishmentProvisioning";
import { newBusinessTrialDefaults } from "../services/subscriptionService";
import { getTrialDays } from "../services/platformSettingsService";
import { allowsUnverifiedBusinesses } from "../services/verificationService";
import { storage } from "../storage";
import { authLimiter, passwordResetLimiter, registerLimiter } from "../middleware/rateLimits";
import { requireAuth } from "../middleware/requireAuth";
import { consumeCaptchaToken, verifyCaptcha } from "../services/captchaService";

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
 * The one and only answer the code-request endpoint ever returns.
 *
 * Same reasoning as FORGOT_PASSWORD_RESPONSE: identical for known and unknown
 * addresses, so the endpoint cannot be used to discover which emails have
 * accounts.
 */
const LOGIN_CODE_RESPONSE =
  "Si el correo está registrado, recibirás un código de 6 dígitos para entrar.";

/**
 * Registration, login, logout and onboarding completion.
 */
export function registerAuthRoutes(app: Express): void {
  /**
   * Hands a freshly authenticated account its session.
   *
   * The session id is regenerated on privilege change: without regeneration an
   * attacker who planted a session id before login (fixation) would keep it
   * valid afterwards. Shared by both login routes so they cannot drift.
   */
  const completeLogin = async (req: any, res: any, user: { id: string }, message: string) => {
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err: any) => (err ? reject(err) : resolve()));
    });
    (req.session as any).userId = user.id;

    res.json({ user, message });
  };

  // Step 1: User Registration (sends password via email)
  //
  // Anonymous and account-creating, so it is gated by the proof-of-work CAPTCHA
  // and throttled by registerLimiter. The gate is checked before the body is
  // parsed so a bot never reaches the email/RUC work, and the challenge is
  // consumed only on success: a rejected registration ("ese email ya tiene una
  // cuenta") must not force the visitor to solve a second puzzle.
  //
  // `minDwellMs: 0` is explicit: the form fetches and solves the puzzle inside the
  // submit handler, so a deployment-wide CAPTCHA_MIN_DWELL_MS must not break it.
  app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
      const captcha = verifyCaptcha(req.body?.captchaToken, req.body?.captchaAnswer, { minDwellMs: 0 });
      if (!captcha.ok) {
        return res.status(400).json({ message: captcha.reason, code: "captcha_invalid" });
      }

      const userData = userRegistrationSchema.parse(req.body);
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.registerUser(userData, ipAddress, userAgent);
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      consumeCaptchaToken(req.body.captchaToken);

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
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.loginUser(loginData, ipAddress, userAgent);
      
      if (!result.success) {
        return res.status(401).json({ message: result.message });
      }

      await completeLogin(req, res, result.user!, result.message);
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

  // ---- Code login: email a one-time code, then exchange it for a session ----
  //
  // A second way into the same account: nothing to remember or to leak, proven
  // against the mailbox that already receives every complaint notification. It
  // shares the password path's failure counter and lockout policy
  // (authService.loginWithCode), so neither route can be used to bypass the
  // other's throttling.

  // Step 1: request the code.
  app.post('/api/auth/request-code', authLimiter, async (req, res) => {
    try {
      const { email } = requestLoginCodeSchema.parse(req.body);
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      await authService.requestLoginCode(email, ipAddress, userAgent);

      res.json({ message: LOGIN_CODE_RESPONSE });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Datos inválidos",
          errors: error.errors
        });
      }
      console.error('Request login code error:', error);
      // Deliberately the same success-shaped answer: a failure here must not
      // reveal whether the address is registered.
      res.json({ message: LOGIN_CODE_RESPONSE });
    }
  });

  // Step 2: the six digits from the email.
  app.post('/api/auth/login-with-code', authLimiter, async (req, res) => {
    try {
      const loginData = authLoginCodeSchema.parse(req.body);
      const ipAddress = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.loginWithCode(loginData, ipAddress, userAgent);

      if (!result.success) {
        return res.status(401).json({ message: result.message });
      }

      await completeLogin(req, res, result.user!, result.message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Datos inválidos",
          errors: error.errors
        });
      }
      console.error('Login with code error:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Logout
  app.post('/api/auth/logout', async (req: any, res) => {
    if (req.session.userId) {
      const ipAddress = req.ip || req.socket.remoteAddress || '';
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
      const ipAddress = req.ip || req.socket.remoteAddress || '';
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
      const ipAddress = req.ip || req.socket.remoteAddress || '';
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
      const ipAddress = req.ip || req.socket.remoteAddress || '';
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
      const ipAddress = req.ip || req.socket.remoteAddress || '';
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

      // The mailbox is where every complaint notification lands, so an account
      // cannot create the company that owns a Libro before confirming it. Demo
      // accounts are excluded: their credentials are public and there is nobody
      // to confirm anything (see verificationService.ts).
      if (!user.isDemo && !user.isEmailVerified && !allowsUnverifiedBusinesses()) {
        return res.status(403).json({
          message:
            "Confirma tu correo antes de configurar tu empresa: te enviamos un enlace de confirmación al crear tu cuenta.",
          code: "email_not_verified",
        });
      }

      const { businessData, libroData } = req.body;

      // Validate business data. Only the legal identity fields are accepted:
      // the subscription plan/status/lifecycle are server-assigned, otherwise
      // a new signup could grant itself a paid plan or skip the trial.
      const validBusinessData = businessProfileSchema.parse(businessData);

      // businessId/userId are assigned by the transaction (the tenant may be
      // created by this very call), so they are not accepted from the client.
      // The public URL is validated here as well as in the form: it becomes a
      // public address, so arbitrary characters must never reach the database.
      const validLibroData = insertLibroConfigurationSchema
        .omit({ businessId: true, userId: true })
        .extend({ urlSlug: libroSlugSchema })
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
        // mint a paid plan or skip the trial. The trial length is the one from
        // the console (Planes), not the compiled-in constant.
        business: {
          ...validBusinessData,
          ...newBusinessTrialDefaults(new Date(), await getTrialDays()),
        },
        libro: validLibroData,
        // Every business needs at least one establishment so the public portal
        // has a "lugar" to file against, named after the book the user just
        // named (a hard-coded "Casa Matriz" ignored it). The sales channel still
        // decides the identification code: a pure online store gets a virtual
        // channel instead of a physical sucursal (DS 011-2011-PCM: selling over
        // the Internet requires the book be reachable from that medium).
        establishment: defaultEstablishmentFor(
          validBusinessData,
          validLibroData.businessType,
          validLibroData.libroName,
        ),
      });

      res.json({
        message: "Onboarding completado exitosamente",
        business: result.business,
        libroConfig: result.config,
        establishment: result.establishment,
        // The Libro de Reclamaciones of that establishment, created in the same
        // transaction so "Libros" is never empty after onboarding.
        book: result.book,
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
