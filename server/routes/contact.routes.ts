import type { Express } from "express";

import { contactMessageSchema, contactSubjectLabel } from "@shared/contact";

import { contactLimiter } from "../middleware/rateLimits";
import { consumeCaptchaToken, isHoneypotTriggered, verifyCaptcha } from "../services/captchaService";
import { emailService } from "../services/emailService";
import { getIdentity } from "../services/platformSettingsService";

/**
 * Formulario de contacto del sitio público (`/contacto`).
 *
 * Es un buzón, no un libro de reclamaciones: el mensaje llega al correo del
 * operador y se responde por esa vía. La página lo dice de forma explícita y
 * enlaza al Libro de Reclamaciones para los reclamos formales, porque un
 * consumidor que escribe aquí no está ejerciendo el derecho del art. 150.
 *
 * Unauthenticated and email-sending, so it carries the same three defences as
 * the other public forms: proof-of-work CAPTCHA, honeypot and rate limit. The
 * challenge is only burned after the message is actually sent, so a transient
 * SMTP failure does not waste the visitor's puzzle.
 */
export function registerContactRoutes(app: Express): void {
  app.post('/api/contact', contactLimiter, async (req, res) => {
    try {
      // A bot that filled the hidden field gets a success it cannot use: telling
      // it that it was caught only teaches it to leave the field empty.
      if (isHoneypotTriggered(req.body ?? {})) {
        return res.status(201).json({ ok: true });
      }

      const captcha = verifyCaptcha(req.body?.captchaToken, req.body?.captchaAnswer);
      if (!captcha.ok) {
        return res.status(400).json({ message: captcha.reason, code: 'captcha_invalid' });
      }

      const parsed = contactMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: 'Revise los datos del formulario.',
          code: 'invalid_input',
          issues: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const { name, email, phone, subject, message } = parsed.data;
      const identity = await getIdentity();

      await emailService.sendContactMessage({
        to: identity.contactEmail,
        name,
        email,
        phone: phone || undefined,
        subjectLabel: contactSubjectLabel(subject),
        message,
      });

      // The challenge is single-use: burn it now that the message was sent.
      consumeCaptchaToken(req.body.captchaToken);

      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error sending contact message:', error);
      res.status(500).json({
        message: 'No se pudo enviar el mensaje',
        code: 'send_failed',
      });
    }
  });
}
