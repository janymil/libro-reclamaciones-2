import type { Express } from "express";

import { emailService } from "../services/emailService";
import { requireAuth, requireNonDemo } from "../middleware/requireAuth";
import { emailTestLimiter } from "../middleware/rateLimits";

/**
 * Email diagnostics.
 *
 * Lets any signed-in account prove that outbound email works without waiting
 * for a real signup or password reset: it first probes the SMTP transport
 * (connect + authenticate) and then delivers a message to the caller's OWN
 * address. The recipient comes from the session - never from the body - so the
 * endpoint cannot be abused as an open relay.
 *
 * Demo accounts are excluded: they are shared publicly, and letting any visitor
 * send mail from the business address would be a spam vector.
 */
export function registerEmailRoutes(app: Express): void {
  app.post('/api/email/test', requireAuth, requireNonDemo, emailTestLimiter, async (req: any, res) => {
    try {
      const connected = await emailService.testConnection();

      if (!connected) {
        return res.status(502).json({
          ok: false,
          message: "No se pudo conectar al servidor SMTP. Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD.",
        });
      }

      await emailService.sendTestEmail(req.user.email, req.user.firstName);

      res.json({ ok: true, message: `Correo de prueba enviado a ${req.user.email}.` });
    } catch (error) {
      console.error('[email] test email failed:', error);
      res.status(502).json({
        ok: false,
        message: 'La conexión SMTP funciona, pero no se pudo enviar el correo de prueba.',
      });
    }
  });
}
