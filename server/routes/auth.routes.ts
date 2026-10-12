import type { Express } from "express";
import { z } from "zod";

import {
  insertBusinessSchema,
  insertLibroConfigurationSchema,
  loginSchema as authLoginSchema,
  userRegistrationSchema,
} from "@shared/schema";

import { authService } from "../services/authService";
import { storage } from "../storage";
import { authLimiter, registerLimiter } from "../middleware/rateLimits";
import { requireAuth } from "../middleware/requireAuth";

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

      // Set session
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
    if (req.session.userId && req.user) {
      const ipAddress = req.ip || req.connection.remoteAddress || '';
      const userAgent = req.get('User-Agent') || '';
      
      await authService.logoutUser(req.session.userId, req.user.email, ipAddress, userAgent);
    }

    req.session.destroy((err: any) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ message: "Error al cerrar sesión" });
      }
      res.json({ message: "Sesión cerrada exitosamente" });
    });
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

  // Step 2: Configure business and libro (onboarding completion)
  app.post('/api/auth/complete-onboarding', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Ensure user is in onboarding step 1
      if (user.onboardingCompleted || user.onboardingStep !== 1) {
        return res.status(400).json({ message: "Onboarding ya completado o usuario en estado inválido" });
      }

      const { businessData, libroData } = req.body;
      
      // Validate business data
      const validBusinessData = insertBusinessSchema.parse(businessData);

      // Create business first so the libro configuration can reference it
      const business = await storage.createBusiness(validBusinessData);

      // Validate libro configuration data (businessId is injected from the new business)
      const validLibroData = insertLibroConfigurationSchema.parse({
        ...libroData,
        userId: user.id,
        businessId: business.id,
      });

      // Update user with business ID and onboarding completion
      await storage.updateUser(user.id, {
        businessId: business.id,
        onboardingStep: 2,
        onboardingCompleted: true,
      });

      const libroConfig = await storage.createLibroConfiguration(validLibroData);

      res.json({
        message: "Onboarding completado exitosamente",
        business,
        libroConfig,
        redirectTo: '/panel'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Datos inválidos", 
          errors: error.errors 
        });
      }
      console.error('Onboarding completion error:', error);
      res.status(500).json({ message: "Error al completar el onboarding" });
    }
  });
}
