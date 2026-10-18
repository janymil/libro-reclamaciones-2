import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Login attempts (the password form and the one-time-code form share it).
 *
 * Relaxed to 500 per window ONLY when the process was explicitly told to: local
 * development and the e2e suite run through `npm run dev`, which sets
 * `RATE_LIMIT_RELAXED=true`. Production never sets it, so the limit there is 5.
 *
 * Do not derive this from `NODE_ENV`. `NODE_ENV !== "production"` is true for an
 * unset, misspelled or platform-specific value, so a single misconfigured
 * deployment would silently raise the login ceiling 100x: unlimited password
 * guessing, and nobody notices because every login still works. An explicit
 * opt-in fails closed instead - strict unless someone deliberately relaxed it.
 */
const RELAXED_LIMITS = process.env.RATE_LIMIT_RELAXED === "true";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: RELAXED_LIMITS ? 500 : 5,
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

// CAPTCHA challenge issuance (Phase 1.5): cheap but unauthenticated. Shared by
// every public flow that needs it - complaint intake, the public AI assistant,
// ARCO intake and registration - so the ceiling is per source address, not per
// form: one office behind a single NAT still has room for several visitors.
export const captchaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Demasiadas solicitudes de captcha. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public complaint tracking (`/api/public/libro/:slug/consultar/:correlative`).
 *
 * The correlative is sequential and the only other key is the consumer's
 * document number, so an unthrottled endpoint is a lookup oracle: walk the
 * correlativos, guess an 8-digit DNI, read somebody else's complaint. Keyed per
 * source + book so one noisy caller cannot lock every tenant's portal, and
 * `documento` is required by the route so a guess still needs both halves.
 *
 * `ipKeyGenerator` (not `req.ip`) is what makes the source half trustworthy: a
 * raw IPv6 address would let one caller walk through its own /64 and reset the
 * counter on every request.
 */
export const consultaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Maximum 30 lookups per book per source address
  keyGenerator: (req: any) =>
    `consulta:${ipKeyGenerator(req.ip ?? "0.0.0.0")}:${req.params?.slug ?? "unknown"}`,
  message: { message: "Demasiadas consultas. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public complaint submission: gated by the proof-of-work CAPTCHA (whose token
// is single-use, consumed when a record is created) and throttled anyway, so a
// spam wave has to pay twice: CPU per attempt, then this ceiling per address.
export const publicComplaintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Maximum 20 complaint submissions per window per IP
  message: { message: "Demasiadas reclamaciones desde esta conexión. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public ARCO (data-rights) intake: unauthenticated, so throttle it like the
// complaint form to prevent spam and notification flooding.
/**
 * Public contact form (POST /api/contact).
 *
 * Unauthenticated and every accepted message sends a real email to the
 * operator's inbox (which is also the ARCO channel), so the ceiling is tighter
 * than the rest of the public endpoints: enough for a person who made a typo,
 * useless for a flood.
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  // Relaxed ONLY with the explicit opt-in used by local dev and the e2e suite
  // (`RATE_LIMIT_RELAXED=true`); production stays at 5.
  max: RELAXED_LIMITS ? 200 : 5, // Maximum 5 messages per hour per IP
  message: { message: "Ha enviado varios mensajes. Escríbanos más tarde o por WhatsApp." },
  standardHeaders: true,
  legacyHeaders: false,
});

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
//
// Two layers:
//   * a generous per-IP ceiling that also protects the 401 path (invalid keys
//     never reach the per-key limiter), and
//   * a per-key ceiling applied AFTER authentication, so several CRM
//     integrations behind the same NAT no longer share one bucket, and a noisy
//     client cannot starve its neighbours.
export const apiV1IpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RELAXED_LIMITS ? 6000 : 600,
  message: { error: 'rate_limited', message: 'Límite de la API alcanzado. Intenta en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiV1ReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RELAXED_LIMITS ? 3000 : 240,
  keyGenerator: (req: any) => `api-key:${req.apiKey?.id ?? 'anonymous'}`,
  message: { error: 'rate_limited', message: 'Límite de lectura de la API alcanzado. Intenta en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiV1WriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RELAXED_LIMITS ? 600 : 60,
  keyGenerator: (req: any) => `api-key:${req.apiKey?.id ?? 'anonymous'}`,
  message: { error: 'rate_limited', message: 'Límite de escritura de la API alcanzado. Intenta en un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public payment webhook (Phase 2.7).
 *
 * Unauthenticated by necessity: the PSP calls it. The body proves nothing on
 * its own - the handler always re-reads the status from the provider API - so
 * the limiter is here to stop a flood of junk requests, not to authenticate.
 */
export const paymentWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // Generous: a busy day still fits, a flood does not
  message: { message: "Demasiadas notificaciones de pago." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * WhatsApp Cloud API webhook (Meta -> us).
 *
 * Unauthenticated by necessity and, unlike the payment webhook, the body IS the
 * content (a consumer message drives a tenant notification and an outbound
 * reply that costs money per conversation), so it is throttled tighter than the
 * PSP callback. The `X-Hub-Signature-256` HMAC is the actual authentication.
 */
export const whatsappWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { message: "Demasiadas notificaciones de WhatsApp." },
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

/**
 * "Solicitar acceso a esta empresa" (duplicate RUC).
 *
 * Authenticated, but every accepted request emails the tenant's administrators,
 * so an impatient - or hostile - staff account must not be able to flood their
 * inbox. Same reasoning as the recovery limiter, one hour wide.
 */
export const accessRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Maximum 10 access requests per window per IP
  message: { message: "Demasiadas solicitudes de acceso. Intenta más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * SMTP smoke test (POST /api/email/test).
 *
 * Authenticated, but each call sends a real message, so keep it tight enough
 * that a signed-in account cannot use it to flood its own (or anyone's) inbox.
 */
export const emailTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 test emails per window per IP
  message: { message: "Demasiadas pruebas de correo. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});
