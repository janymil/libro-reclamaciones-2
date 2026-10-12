import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertComplaintSchema,
  complaintSubmissionSchema,
  insertEstablishmentSchema,
  insertArcoRequestSchema,
  userRegistrationSchema,
  loginSchema as authLoginSchema,
  insertBusinessSchema,
  insertLibroConfigurationSchema,
  insertDataProcessingActivitySchema,
  type InsertComplaint
} from "@shared/schema";
import { authService } from "./services/authService";
import { isLocalDatabase } from "./db";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { aiService } from "./services/aiService";
import { businessDayCalculator } from "./services/businessDayCalculator";
import { emailService } from "./services/emailService";
import { pdfService } from "./services/pdfService";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const complaintFormSchema = complaintSubmissionSchema;

// Whitelisted fields a business user can change on an existing complaint.
const complaintUpdateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'responded', 'resolved', 'overdue']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  providerActions: z.string().max(5000).nullable().optional(),
  providerResponse: z.string().max(20000).nullable().optional(),
  responseMethod: z.enum(['email', 'letter', 'phone']).nullable().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for rate limiting to work correctly in production
  app.set('trust proxy', 1);
  
  // Security middleware with relaxed CSP for development
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    } : false, // Disable CSP in development
  }));

  // Session configuration: PostgreSQL backed sessions in production, in-memory
  // sessions when running against the embedded local development database.
  const sessionStore = isLocalDatabase
    ? new (memorystore(session))({ checkPeriod: 24 * 60 * 60 * 1000 })
    : new (connectPg(session))({
        conString: process.env.DATABASE_URL,
        tableName: 'session',
        createTableIfMissing: true,
      });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback-secret-only-for-dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // Rate limiting for authentication routes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Maximum 5 attempts per window
    message: { message: "Demasiados intentos de login. Intenta en 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Registration rate limiting
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour  
    max: 3, // Maximum 3 registrations per hour per IP
    message: { message: "Límite de registros alcanzado. Intenta en 1 hora." },
  });

  // Authentication middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "No autenticado" });
    }

    try {
      const user = await authService.validateSessionUser(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Sesión inválida" });
      }

      // Demo accounts are shared publicly: reading and creating is allowed,
      // but existing records cannot be modified or deleted.
      if (user.isDemo && ['PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        return res.status(403).json({
          message: "Cuenta de demostración: no puede modificar ni eliminar registros.",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ message: "Error de autenticación" });
    }
  };





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

  // Dashboard routes
  app.get('/api/dashboard/metrics', requireAuth, async (req: any, res) => {
    try {
      const metrics = await storage.getDashboardMetrics(req.user.businessId);
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  // Reports routes
  app.get('/api/reports/stats', requireAuth, async (req: any, res) => {
    try {
      const stats = await storage.getReportStats(req.user.businessId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report stats" });
    }
  });

  app.get('/api/reports/monthly', requireAuth, async (req: any, res) => {
    try {
      const reports = await storage.getMonthlyReports(req.user.businessId);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch monthly reports" });
    }
  });

  // Businesses routes
  app.get('/api/businesses/current', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.json(null);
      }

      const business = await storage.getBusiness(req.user.businessId);
      res.json(business ?? null);
    } catch (error) {
      console.error('Error fetching current business:', error);
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  app.get('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      const businesses = await storage.getAllBusinesses();
      res.json(businesses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.post('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      const businessData = req.body;
      const business = await storage.createBusiness(businessData);
      res.json(business);
    } catch (error) {
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  // Books routes
  app.get('/api/books', requireAuth, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      res.json(books);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  app.post('/api/books', requireAuth, async (req: any, res) => {
    try {
      const { establishmentId, bookType, description } = req.body;

      if (!establishmentId) {
        return res.status(400).json({ message: "El establecimiento es requerido" });
      }

      // Ensure the establishment belongs to the authenticated business
      const establishment = await storage.getEstablishment(establishmentId);
      if (!establishment || establishment.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Establecimiento no encontrado" });
      }

      const book = await storage.createBook({
        businessId: req.user.businessId,
        establishmentId,
        bookType: bookType || 'reclamos',
        description: description || null,
        isActive: true,
      });

      res.status(201).json(book);
    } catch (error) {
      console.error('Error creating book:', error);
      res.status(500).json({ message: "Failed to create book" });
    }
  });

  app.get('/api/books/:id/download', requireAuth, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      const book = books.find(b => b.id === req.params.id);

      if (!book) {
        return res.status(404).json({ message: "Libro no encontrado" });
      }

      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const complaints = await storage.getComplaintsByEstablishment(book.establishmentId);

      const pdf = await pdfService.generateComplaintReport(complaints, business, {
        establishment: book.establishmentName,
        bookType: book.bookType,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="libro-${book.bookType}-${book.establishmentId}.pdf"`
      );
      res.send(pdf);
    } catch (error) {
      console.error('Error generating book PDF:', error);
      res.status(500).json({ message: "Failed to download book" });
    }
  });

  // Users routes
  app.get('/api/users', requireAuth, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', requireAuth, async (req: any, res) => {
    try {
      const { username, firstName, lastName, email, password, role, businessId } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "El email ya está registrado" });
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

  // History routes
  app.get('/api/history/activity', requireAuth, async (req: any, res) => {
    try {
      const { filterType, dateRange, searchTerm } = req.query;
      const activity = await storage.getActivityHistory(req.user.businessId, {
        filterType: filterType as string,
        dateRange: parseInt(dateRange as string) || 30,
        searchTerm: searchTerm as string,
      });
      res.json(activity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity history" });
    }
  });

  app.get('/api/history/audit', requireAuth, async (req: any, res) => {
    try {
      const { filterType, dateRange } = req.query;
      const auditLogs = await storage.getAuditLogs(req.user.businessId, {
        filterType: filterType as string,
        dateRange: parseInt(dateRange as string) || 30,
      });
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get('/api/history/system-changes', requireAuth, async (req: any, res) => {
    try {
      const { dateRange } = req.query;
      const systemChanges = await storage.getSystemChanges(req.user.businessId, {
        dateRange: parseInt(dateRange as string) || 30,
      });
      res.json(systemChanges);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system changes" });
    }
  });

  // Complaints routes
  app.get('/api/complaints', requireAuth, async (req: any, res) => {
    try {
      const { status, type, priority, establishmentId, dateFrom, dateTo } = req.query;
      
      const filters = {
        status: status as string,
        type: type as string,
        priority: priority as string,
        establishmentId: establishmentId as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
      };
      
      const complaints = await storage.getComplaintsByBusiness(req.user.businessId, filters);
      res.json(complaints);
    } catch (error) {
      console.error('Error fetching complaints:', error);
      res.status(500).json({ message: "Failed to fetch complaints" });
    }
  });

  app.get('/api/complaints/:id', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }
      
      res.json(complaint);
    } catch (error) {
      console.error('Error fetching complaint:', error);
      res.status(500).json({ message: "Failed to fetch complaint" });
    }
  });

  app.patch('/api/complaints/:id', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }
      
      const complaintUpdates = complaintUpdateSchema.safeParse(req.body);
      if (!complaintUpdates.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: complaintUpdates.error.errors });
      }

      const updates: Partial<InsertComplaint> = { ...complaintUpdates.data };

      // If providing a response, set response date and update status
      if (updates.providerResponse) {
        updates.responseDate = new Date();
        updates.status = updates.status ?? 'responded';
      }
      
      const updatedComplaint = await storage.updateComplaint(req.params.id, updates);
      
      // Log the update
      await storage.createAuditLog({
        complaintId: req.params.id,
        userId: req.user.id,
        action: 'complaint_updated',
        oldValues: complaint,
        newValues: updatedComplaint,
        notes: null,
        ipAddress: req.ip ?? null,
        userAgent: req.get('User-Agent') ?? null,
      });
      
      // Send response to consumer if provided
      if (updates.providerResponse) {
        await emailService.sendComplaintResponse(
          updatedComplaint.consumerEmail,
          updatedComplaint,
          updates.providerResponse
        );
      }
      
      res.json(updatedComplaint);
    } catch (error) {
      console.error('Error updating complaint:', error);
      res.status(500).json({ message: "Failed to update complaint" });
    }
  });

  app.get('/api/complaints/:id/audit', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }
      
      const auditLogs = await storage.getAuditLogsByComplaint(req.params.id);
      res.json(auditLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Public complaint submission (no auth required)
  app.post('/api/public/complaints', async (req, res) => {
    try {
      const data = complaintFormSchema.parse(req.body);
      
      // Get business and establishment
      const business = await storage.getBusiness(data.businessId);
      const establishment = await storage.getEstablishment(data.establishmentId);
      
      if (!business || !establishment || establishment.businessId !== business.id) {
        return res.status(404).json({ message: "Business or establishment not found" });
      }
      
      // Generate correlative number
      const year = new Date().getFullYear();
      const count = (await storage.getComplaintsByBusiness(data.businessId)).length + 1;
      const correlativeNumber = `${year}-${count.toString().padStart(4, '0')}`;
      
      // Calculate due date (15 business days)
      const dueDate = businessDayCalculator.addBusinessDays(new Date(), 15);
      
      // AI classification
      const aiAnalysis = await aiService.classifyComplaint(data.complaintDetail);
      
      const complaint = await storage.createComplaint({
        ...data,
        correlativeNumber,
        dueDate,
        submissionDate: new Date(),
        status: 'new',
        priority: aiAnalysis.priority || 'normal',
        aiClassification: aiAnalysis,
        aiSuggestedResponse: aiAnalysis.suggestedResponse,
        aiRiskLevel: aiAnalysis.riskLevel,
      });
      
      // Generate and send confirmation PDF
      const confirmationPdf = await pdfService.generateComplaintConfirmation(complaint, business, establishment);
      
      await emailService.sendComplaintConfirmation(
        data.consumerEmail,
        complaint,
        confirmationPdf
      );
      
      // Create notification for business
      await storage.createNotification({
        businessId: data.businessId,
        type: 'complaint_new',
        title: 'Nueva reclamación recibida',
        message: `Se ha recibido una nueva ${data.complaintType} de ${data.consumerFullName}`,
        relatedEntityType: 'complaint',
        relatedEntityId: complaint.id,
      });
      
      res.json({
        success: true,
        complaintId: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        dueDate: complaint.dueDate,
      });
    } catch (error) {
      console.error('Error creating complaint:', error);
      res.status(500).json({ message: "Failed to create complaint" });
    }
  });

  // AI assistant routes
  app.post('/api/ai/classify', requireAuth, async (req: any, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const classification = await aiService.classifyComplaint(text);
      res.json(classification);
    } catch (error) {
      console.error('Error classifying complaint:', error);
      res.status(500).json({ message: "Failed to classify complaint" });
    }
  });

  app.post('/api/ai/suggest-response', requireAuth, async (req: any, res) => {
    try {
      const { complaintText, complaintType } = req.body;
      
      if (!complaintText || !complaintType) {
        return res.status(400).json({ message: "Complaint text and type are required" });
      }
      
      const suggestion = await aiService.suggestResponse(complaintText, complaintType);
      res.json({ suggestion });
    } catch (error) {
      console.error('Error generating response suggestion:', error);
      res.status(500).json({ message: "Failed to generate response suggestion" });
    }
  });

  // Establishments routes
  app.get('/api/establishments', requireAuth, async (req: any, res) => {
    try {
      const establishments = await storage.getEstablishmentsByBusiness(req.user.businessId);
      res.json(establishments);
    } catch (error) {
      console.error('Error fetching establishments:', error);
      res.status(500).json({ message: "Failed to fetch establishments" });
    }
  });

  app.post('/api/establishments', requireAuth, async (req: any, res) => {
    try {
      const data = insertEstablishmentSchema.parse({
        ...req.body,
        businessId: req.user.businessId,
      });
      
      const establishment = await storage.createEstablishment(data);
      res.json(establishment);
    } catch (error) {
      console.error('Error creating establishment:', error);
      res.status(500).json({ message: "Failed to create establishment" });
    }
  });

  // ARCO requests routes
  app.get('/api/arco-requests', requireAuth, async (req: any, res) => {
    try {
      const requests = await storage.getArcoRequests(req.user.businessId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching ARCO requests:', error);
      res.status(500).json({ message: "Failed to fetch ARCO requests" });
    }
  });

  app.post('/api/arco-requests', async (req, res) => {
    try {
      const data = insertArcoRequestSchema.parse(req.body);
      
      // Calculate due date based on request type (typically 10-20 business days)
      const dueDate = businessDayCalculator.addBusinessDays(new Date(), 15);
      
      const request = await storage.createArcoRequest({
        ...data,
        dueDate,
      });
      
      // Notify business
      await storage.createNotification({
        businessId: data.businessId,
        type: 'arco_request_new',
        title: 'Nueva solicitud de derechos ARCO',
        message: `Se ha recibido una solicitud de ${data.requestType} de ${data.requesterName}`,
        relatedEntityType: 'arco_request',
        relatedEntityId: request.id,
      });
      
      res.json(request);
    } catch (error) {
      console.error('Error creating ARCO request:', error);
      res.status(500).json({ message: "Failed to create ARCO request" });
    }
  });

  // Compliance routes
  app.get('/api/compliance/report', requireAuth, async (req: any, res) => {
    try {
      const report = await storage.generateComplianceReport(req.user.businessId);
      res.json(report);
    } catch (error) {
      console.error('Error generating compliance report:', error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });

  app.get('/api/compliance/tracking', requireAuth, async (req: any, res) => {
    try {
      const tracking = await storage.getComplianceTracking(req.user.businessId);
      res.json(tracking);
    } catch (error) {
      console.error('Error fetching compliance tracking:', error);
      res.status(500).json({ message: "Failed to fetch compliance tracking" });
    }
  });

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
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Public Libro de Reclamaciones (consumer facing, no authentication)
  app.get('/api/public/libro/:slug', async (req, res) => {
    try {
      const config = await storage.getLibroConfigurationBySlug(req.params.slug);

      if (!config || !config.isActive) {
        return res.status(404).json({ message: "Libro de Reclamaciones no encontrado" });
      }

      const business = await storage.getBusinessById(config.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const establishments = await storage.getEstablishmentsByBusiness(business.id);

      res.json({
        libro: {
          name: config.libroName,
          slug: config.urlSlug,
          whatsappNumber: config.whatsappNumber,
          websiteUrl: config.websiteUrl,
          logoUrl: config.logoUrl,
          notificationEmail: config.notificationEmail,
        },
        business: {
          id: business.id,
          businessName: business.businessName,
          commercialName: business.commercialName,
          ruc: business.ruc,
          address: business.address,
          distrito: business.distrito,
          provincia: business.provincia,
          departamento: business.departamento,
        },
        establishments: establishments.map(e => ({
          id: e.id,
          name: e.name,
          address: e.address,
        })),
      });
    } catch (error) {
      console.error('Error fetching public libro:', error);
      res.status(500).json({ message: "Error al cargar el Libro de Reclamaciones" });
    }
  });

  // Public tracking of a registered complaint (requires correlative + document)
  app.get('/api/public/libro/:slug/consultar/:correlative', async (req, res) => {
    try {
      const config = await storage.getLibroConfigurationBySlug(req.params.slug);
      if (!config) {
        return res.status(404).json({ message: "Libro de Reclamaciones no encontrado" });
      }

      const documentNumber = String(req.query.documento || '').trim();
      if (!documentNumber) {
        return res.status(400).json({ message: "Ingrese el número de documento del consumidor" });
      }

      const complaint = await storage.findComplaintByCorrelative(
        config.businessId,
        req.params.correlative,
        documentNumber
      );

      if (!complaint) {
        return res.status(404).json({ message: "No se encontró una reclamación con esos datos" });
      }

      // Only consumer-safe fields are exposed publicly
      res.json({
        correlativeNumber: complaint.correlativeNumber,
        complaintType: complaint.complaintType,
        status: complaint.status,
        productServiceName: complaint.productServiceName,
        submissionDate: complaint.submissionDate,
        dueDate: complaint.dueDate,
        responseDate: complaint.responseDate,
        providerResponse: complaint.providerResponse,
        isOverdue: complaint.isOverdue,
      });
    } catch (error) {
      console.error('Error consulting complaint:', error);
      res.status(500).json({ message: "Error al consultar la reclamación" });
    }
  });

  // Public business info (for complaint form)
  app.get('/api/public/business/:businessId', async (req, res) => {
    try {
      const business = await storage.getBusinessById(req.params.businessId);
      
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      
      const establishments = await storage.getEstablishmentsByBusiness(business.id);
      
      res.json({
        business: {
          id: business.id,
          businessName: business.businessName,
          ruc: business.ruc,
          address: business.address,
        },
        establishments: establishments.map(e => ({
          id: e.id,
          name: e.name,
          address: e.address,
        })),
      });
    } catch (error) {
      console.error('Error fetching public business info:', error);
      res.status(500).json({ message: "Failed to fetch business info" });
    }
  });

  // Legal document generation routes
  app.get('/api/documents/complaint-notice', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      
      const noticePdf = await pdfService.generateComplaintNotice(business);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="aviso-libro-reclamaciones.pdf"');
      res.send(noticePdf);
    } catch (error) {
      console.error('Error generating complaint notice:', error);
      res.status(500).json({ message: "Failed to generate complaint notice" });
    }
  });

  // --- Additional endpoints (QR code, management actions, legal documents) ---

  // Libro configuration of the authenticated business. Used to build the public
  // URL and the QR code of the Libro de Reclamaciones.
  app.get('/api/libro-configuration', requireAuth, async (req: any, res) => {
    try {
      const config = await storage.getLibroConfiguration(req.user.businessId);
      res.json(config ?? null);
    } catch (error) {
      console.error('Error fetching libro configuration:', error);
      res.status(500).json({ message: "Failed to fetch libro configuration" });
    }
  });

  // Update a business ("Gestionar" on Empresas)
  app.patch('/api/businesses/:id', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const data = insertBusinessSchema.partial().parse(req.body);
      const updated = await storage.updateBusiness(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating business:', error);
      res.status(500).json({ message: "Failed to update business" });
    }
  });

  // Update a book ("Gestionar" on Libros)
  app.patch('/api/books/:id', requireAuth, async (req: any, res) => {
    try {
      const books = await storage.getBooks(req.user.businessId);
      const book = books.find(b => b.id === req.params.id);

      if (!book) {
        return res.status(404).json({ message: "Libro no encontrado" });
      }

      const schema = z.object({
        description: z.string().max(500).nullable().optional(),
        isActive: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      // Books are read through getBooks; persist the change and re-read it.
      const updated = await storage.updateBook(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating book:', error);
      res.status(500).json({ message: "Failed to update book" });
    }
  });


  // Data processing activities register (RNPD assistant)
  app.get('/api/data-processing-activities', requireAuth, async (req: any, res) => {
    try {
      const activities = await storage.getDataProcessingActivities(req.user.businessId);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching data processing activities:', error);
      res.status(500).json({ message: "Failed to fetch data processing activities" });
    }
  });

  app.post('/api/data-processing-activities', requireAuth, async (req: any, res) => {
    try {
      const data = insertDataProcessingActivitySchema.parse({
        ...req.body,
        businessId: req.user.businessId,
      });

      const activity = await storage.createDataProcessingActivity(data);
      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error creating data processing activity:', error);
      res.status(500).json({ message: "Failed to create data processing activity" });
    }
  });

  // Compliance report as a downloadable PDF
  app.get('/api/compliance/report/download', requireAuth, async (req: any, res) => {
    try {
      const report = await storage.generateComplianceReport(req.user.businessId);
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const pdf = await pdfService.generateComplianceReportPdf(report, business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="reporte-cumplimiento.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating compliance report PDF:', error);
      res.status(500).json({ message: "Failed to generate compliance report" });
    }
  });

  // Privacy policy draft (Ley 29733 / DS 016-2024-JUS)
  app.get('/api/documents/privacy-policy', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const pdf = await pdfService.generatePrivacyPolicy(business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="politica-privacidad.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating privacy policy:', error);
      res.status(500).json({ message: "Failed to generate privacy policy" });
    }
  });

  // Registro de Actividades de Tratamiento (RNPD)
  app.get('/api/documents/rnpd-register', requireAuth, async (req: any, res) => {
    try {
      const business = await storage.getBusiness(req.user.businessId);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const activities = await storage.getDataProcessingActivities(req.user.businessId);
      const pdf = await pdfService.generateRnpdRegister(activities, business);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="registro-actividades-tratamiento.pdf"');
      res.send(pdf);
    } catch (error) {
      console.error('Error generating RNPD register:', error);
      res.status(500).json({ message: "Failed to generate RNPD register" });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
