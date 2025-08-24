import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertComplaintSchema, 
  insertEstablishmentSchema, 
  insertArcoRequestSchema,
  userRegistrationSchema,
  loginSchema as authLoginSchema,
  insertBusinessSchema,
  insertLibroConfigurationSchema
} from "@shared/schema";
import { authService } from "./services/authService";
import session from "express-session";
import connectPg from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Comment out missing services for now - focus on core auth
// import { aiService } from "./services/aiService";
// import { businessDayCalculator } from "./services/businessDayCalculator";
// import { legalComplianceService } from "./services/legalComplianceService";
// import { pdfService } from "./services/pdfService";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const complaintFormSchema = insertComplaintSchema.extend({
  responseMethod: z.enum(['email', 'letter']).optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Session configuration with PostgreSQL store
  const PostgresSessionStore = connectPg(session);
  const sessionStore = new PostgresSessionStore({
    conString: process.env.DATABASE_URL,
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
      req.session.userId = result.user!.id;
      
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
      
      // Validate libro configuration data
      const validLibroData = insertLibroConfigurationSchema.parse({
        ...libroData,
        userId: user.id,
      });

      // Create business
      const business = await storage.createBusiness(validBusinessData);
      
      // Update user with business ID and onboarding completion
      await storage.updateUser(user.id, {
        businessId: business.id,
        onboardingStep: 2,
        onboardingCompleted: true,
      });

      // Create libro configuration with business ID
      const libroConfig = await storage.createLibroConfiguration({
        ...validLibroData,
        businessId: business.id,
      });

      res.json({
        message: "Onboarding completado exitosamente",
        business,
        libroConfig,
        redirectTo: '/dashboard'
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
      const bookData = req.body;
      const book = await storage.createBook(bookData);
      res.json(book);
    } catch (error) {
      res.status(500).json({ message: "Failed to create book" });
    }
  });

  app.get('/api/books/:id/download', requireAuth, async (req: any, res) => {
    try {
      // Simulate PDF download
      res.json({ message: "PDF download would start here", bookId: req.params.id });
    } catch (error) {
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
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
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
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post('/api/users/change-password', requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await storage.changeUserPassword(req.user.id, currentPassword, newPassword);
      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to change password" });
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
      const systemChanges = await storage.getSystemChanges({
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
      
      const updates = req.body;
      
      // If providing a response, set response date and update status
      if (updates.providerResponse) {
        updates.responseDate = new Date();
        updates.status = 'responded';
      }
      
      const updatedComplaint = await storage.updateComplaint(req.params.id, updates);
      
      // Log the update
      await storage.createAuditLog({
        complaintId: req.params.id,
        userId: req.user.id,
        action: 'complaint_updated',
        oldValues: complaint,
        newValues: updatedComplaint,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
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
      
      if (!business || !establishment) {
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

  const httpServer = createServer(app);
  return httpServer;
}
