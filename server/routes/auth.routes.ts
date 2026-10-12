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
