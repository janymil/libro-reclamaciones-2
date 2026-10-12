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

// CAPTCHA challenge issuance (Phase 1.5): cheap but unauthenticated.
export const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Demasiadas solicitudes de captcha. Intenta en 15 minutos." },
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
