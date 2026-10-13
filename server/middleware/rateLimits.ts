import rateLimit from "express-rate-limit";

// Rate limiting for authentication routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 attempts per window
  message: { message: "Demasiados intentos de login. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration rate limiting
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour  
  max: 3, // Maximum 3 registrations per hour per IP
  message: { message: "Límite de registros alcanzado. Intenta en 1 hora." },
});

// AI endpoints: each request hits a (potentially paid) upstream model, so keep
// a tighter lid than the rest of the app.
export const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Maximum 30 AI calls per window per IP
  message: { message: "Demasiadas solicitudes de IA. Intenta en 5 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public (unauthenticated) AI endpoint: stricter still, since anyone on the
// internet can reach it.
export const publicAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 assisted-draft reviews per window per IP
  message: { message: "Demasiadas solicitudes. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public evidence upload endpoint (Phase 1.1): unauthenticated but validated
// against the complaint's consumer document number, so keep it tight.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Maximum 20 upload requests per window per IP
  message: { message: "Demasiadas subidas de archivos. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Second, per-complaint ceiling for the public evidence upload.
 *
 * The upload is authorized only by the consumer's document number, so a single
 * complaint id must not become an oracle for brute-forcing document numbers:
 * the limit is keyed on the complaint id, counting attempts from any source
 * (the per-IP limiter above stays active too).
 */
export const evidenceUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 upload attempts per complaint per window
  keyGenerator: (req: any) => `evidence:${req.params?.id ?? 'unknown'}`,
  message: { message: "Demasiados intentos de subida para esta reclamación. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// CAPTCHA challenge issuance (Phase 1.5): cheap but unauthenticated.
export const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Demasiadas solicitudes de captcha. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public complaint submission: the math CAPTCHA slows bots down but its
// stateless token can be reused inside its 10-minute window, so the endpoint
// itself is throttled too.
export const publicComplaintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Maximum 20 complaint submissions per window per IP
  message: { message: "Demasiadas reclamaciones desde esta conexión. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public ARCO (data-rights) intake: unauthenticated, so throttle it like the
// complaint form to prevent spam and notification flooding.
export const arcoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Demasiadas solicitudes. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Unauthenticated proxy to the third-party SUNAT RUC lookup: without a limit
// anyone could abuse this server as a free relay against that service.
export const rucLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'rate_limited', message: "Demasiadas consultas. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public REST API (Phase 3.12): keyed requests from CRM/ERP systems.
export const apiV1Limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Maximum 60 API requests per minute per IP
  message: { message: "Límite de la API alcanzado. Intenta en un minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Self-service password recovery (Phase 0).
 *
 * Used by BOTH `/api/auth/forgot-password` and `/api/auth/reset-password`.
 * Unauthenticated by definition, and the request leg sends an email to an
 * address the caller supplies — so without a limit it doubles as an email-bomb
 * relay and an account-enumeration probe. Tighten it more than login.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 reset requests/confirmations per window per IP
  message: { message: "Demasiadas solicitudes. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});
