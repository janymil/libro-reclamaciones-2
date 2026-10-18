import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import type { Complaint } from '@shared/schema';
import type { BusinessEmailIdentity } from '@shared/email-identity';
import type { ExecutiveReport } from './aiService';
import { buildPaymentRecoveryText, paymentRecoverySubject } from '@shared/payment-recovery';
import { formatIgvRate } from '@shared/tax';
import {
  COMPROBANTE_LEGAL_NOTE,
  COMPROBANTE_VERIFICATION_NOTE,
} from '@shared/comprobantes';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  tls?: {
    rejectUnauthorized: boolean;
  };
}

/**
 * Per-business email customization (Phase 2.8). Values come from the
 * libro_configuration record; everything is optional and falls back to the
 * default LibroDigital.pe wording.
 */
export interface EmailCustomization {
  subjectPrefix?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  /**
   * Identity of the BUSINESS the complaint was filed with (name, logo, contact
   * data, reply address). When present, the message is presented as coming from
   * that business instead of from the platform - see shared/email-identity.ts.
   */
  identity?: BusinessEmailIdentity | null;
}

/**
 * The platform's own identity, for the footer of the messages it sends itself
 * (receipts, operational alerts).
 *
 * Every field is optional and an empty one is simply not printed: a receipt must
 * never invent an RUC or an address. Configured in the console (Configuración →
 * Identidad) and passed in by the caller, so this module keeps knowing nothing about
 * the database.
 */
export interface PlatformIdentityFooter {
  legalName?: string;
  commercialName?: string;
  ruc?: string;
  fiscalAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

/**
 * The last lines of a message, built from whatever the identity actually has.
 *
 * Falls back to the commercial name alone, which is exactly what the messages said
 * before the identity became editable - so an empty configuration changes nothing.
 *
 * Exported for its unit test: this is the part a customer reads on a receipt.
 */
export function identityFooterLines(identity?: PlatformIdentityFooter): string[] {
  const commercial = identity?.commercialName?.trim() || 'LibroDigital.pe';
  const legalName = identity?.legalName?.trim();
  const ruc = identity?.ruc?.trim();
  const address = identity?.fiscalAddress?.trim();
  const contactEmail = identity?.contactEmail?.trim();
  const contactPhone = identity?.contactPhone?.trim();
  const website = identity?.website?.trim().replace(/\/+$/, '');

  const lines = [commercial];

  // Legal name and RUC on one line: that is how it is read on an invoice.
  if (legalName && legalName !== commercial) {
    lines.push(ruc ? `${legalName} · RUC ${ruc}` : legalName);
  } else if (ruc) {
    lines.push(`RUC ${ruc}`);
  }

  if (address) {
    lines.push(address);
  }

  const contact = [contactEmail, contactPhone, website].filter(Boolean).join(' · ');
  if (contact) {
    lines.push(contact);
  }

  return lines;
}

/** Applies the subject prefix, if configured. */
/**
 * Escapes a value that is interpolated into an HTML email body.
 *
 * Names, company names and free-text notes come from users and end up in someone
 * else's inbox: a registration first name, a tenant's business name, or the
 * message a stranger attaches to an "acceso a esta empresa" request - the last one
 * being delivered to that company's administrators, inside a notification they
 * have every reason to trust. Unescaped, a crafted value can restructure that
 * message (hide the real link, add a fake one), which is exactly how a
 * notification email becomes a phishing page. Plain-text bodies need nothing.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applySubject(subject: string, customization?: EmailCustomization): string {
  const prefix = customization?.subjectPrefix?.trim();
  return prefix ? `${prefix} ${subject}` : subject;
}

/** Renders the custom header block, or an empty string when not configured. */
function renderHeader(customization?: EmailCustomization): string {
  const text = customization?.headerText?.trim();
  return text ? `<div class="brand-header">${escapeHtml(text)}</div>` : '';
}

/** Renders the custom footer line inside the standard footer block. */
function renderFooter(customization?: EmailCustomization): string {
  const text = customization?.footerText?.trim();
  return text ? `<p>${escapeHtml(text)}</p>` : '';
}

/**
 * `from` for a consumer-facing message.
 *
 * The display name is the business's and, when its domain has been verified by
 * the mail host, so is the address. Undefined keeps nodemailer's platform
 * default, so calls without an identity behave exactly as before.
 */
function mailFrom(
  customization?: EmailCustomization,
): { name: string; address: string } | undefined {
  const identity = customization?.identity;
  if (!identity?.fromAddress) {
    return undefined;
  }
  // Passed as an object (never interpolated into a header string) so nodemailer
  // encodes a display name that contains quotes or non-ASCII characters.
  return { name: identity.fromName, address: identity.fromAddress };
}

/** Reply-To header: the consumer's answer must reach the business. */
function replyToAddress(customization?: EmailCustomization): string | undefined {
  return customization?.identity?.replyTo ?? undefined;
}

/**
 * Identity block above the message: the business's logo and name over its brand
 * colour. Empty without an identity, so platform mail is byte-identical.
 */
function renderIdentityHeader(customization?: EmailCustomization): string {
  const identity = customization?.identity;
  if (!identity) {
    return '';
  }

  const accent = identity.brandColor ?? '#3b82f6';
  const logo = identity.logoUrl
    ? `<img src="${escapeHtml(identity.logoUrl)}" alt="${escapeHtml(identity.businessName)}" style="max-height:56px;max-width:220px;margin-bottom:8px;">`
    : '';
  const name = identity.businessName
    ? `<p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${escapeHtml(identity.businessName)}</p>`
    : '';

  return `<div style="padding:20px;text-align:center;background:#ffffff;border-bottom:3px solid ${escapeHtml(accent)};">${logo}${name}</div>`;
}

/**
 * Last lines of the footer: the business's own contact data (name, RUC,
 * address, phone, published contact address) and a discreet line naming the
 * platform that operates the book - a message must not pretend to be from
 * nobody. Falls back to the platform's © line when there is no identity.
 */
function renderFooterBranding(customization?: EmailCustomization): string {
  const identity = customization?.identity;
  if (!identity) {
    return '<p>© 2024 LibroDigital.pe</p>';
  }

  const contact = identity.contactLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return `${contact}<p style="font-size:12px;color:#94a3b8;">Gestionado con LibroDigital.pe</p>`;
}

/** Plain-text signature of the message (same data as the HTML footer). */
function plainSignature(customization?: EmailCustomization): string {
  const identity = customization?.identity;
  if (!identity) {
    return 'LibroDigital.pe';
  }
  return [...identity.contactLines, 'Gestionado con LibroDigital.pe'].join('\n');
}

/** Subject of a consumer-facing message, naming the business it is about. */
function consumerSubject(
  subject: string,
  customization?: EmailCustomization,
): string {
  const identity = customization?.identity;
  return applySubject(
    identity ? `${subject} - ${identity.businessName}` : `${subject} - LibroDigital.pe`,
    customization,
  );
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    const hasSmtpCredentials = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

    /**
     * Whether "capture the email instead of sending it" is allowed.
     *
     * Deliberately an allow-list, never `NODE_ENV !== 'production'`: that check is
     * true for an unset or misspelled value, and the capture transport prints the
     * whole message body to the server log - which for a welcome email means the
     * generated password, and for a reset means the reset link. A production
     * deployment that forgot to set NODE_ENV would therefore leak credentials into
     * its logs *and* deliver nothing, silently.
     */
    const captureEmails =
      process.env.EMAIL_CAPTURE === 'true' ||
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test';

    if (!hasSmtpCredentials && captureEmails) {
      // Local development without SMTP credentials. Instead of failing the whole
      // auth flow we capture the message with nodemailer's JSON transport and
      // print it to the terminal (the generated password / reset link is part of
      // the message body), so registration and login stay usable offline.
      const captureTransport = nodemailer.createTransport({ jsonTransport: true });

      console.warn(
        '[email] SMTP credentials not configured - emails will be printed to this terminal instead of being sent'
      );

      this.transporter = {
        ...captureTransport,
        sendMail: async (mailOptions: SendMailOptions) => {
          const info = await captureTransport.sendMail(mailOptions);
          console.log(
            `\n========== [email:dev] ${mailOptions.subject} ==========\n` +
              `To: ${mailOptions.to}\n` +
              `${mailOptions.text ?? (info as any).message}\n` +
              `=======================================================\n`,
          );
          return info;
        },
      } as unknown as Transporter;

      return;
    }

    // SMTP configuration. Defaults suit Zoho Mail, the host of librodigital.pe
    // (see the "Cloudflare + Zoho Mail" section of RUNBOOK.md); any other
    // provider only needs SMTP_HOST and SMTP_PORT to change.
    const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

    // 465 means implicit SSL; 587 (the other Zoho port) upgrades with STARTTLS.
    // SMTP_SECURE overrides that guess for a provider which does not follow the
    // convention.
    const smtpSecure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === 'true'
      : smtpPort === 465;

    const emailConfig: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.zoho.com',
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || ''
      }
    };

    // Certificate verification stays ON by default (Zoho and every host with a
    // trusted certificate). The previous unconditional `rejectUnauthorized:
    // false` disabled it for everyone, which is a man-in-the-middle hazard; a
    // self-signed server now has to opt out explicitly with
    // SMTP_TLS_REJECT_UNAUTHORIZED=false.
    const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

    this.transporter = nodemailer.createTransport({
      ...emailConfig,
      // Bound every phase of the SMTP handshake. Without these, a host that
      // accepts the TCP connection and then stalls leaves verify()/sendMail()
      // waiting until the OS gives up (minutes).
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 10_000,
      tls: {
        rejectUnauthorized
      }
    });
  }

  /**
   * Send welcome email with generated password.
   *
   * `verificationToken`, when present, embeds the "confirma tu correo" link. It
   * travels in this email rather than in a second one so signup stays a single
   * message, while still making `users.is_email_verified` mean something: the
   * mailbox that receives every complaint notification is proven to belong to
   * the account owner.
   */
  async sendWelcomePassword(
    email: string,
    firstName: string,
    password: string,
    verificationToken?: string,
  ): Promise<void> {
    const verificationUrl = verificationToken
      ? `${process.env.APP_URL || 'https://librodigital.pe'}/acceso/verificar-email?token=${verificationToken}`
      : null;

    const verificationHtml = verificationUrl
      ? `
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Confirmar mi correo</a>
              </div>

              <p style="color: #64748b; font-size: 14px;">
                Confirma tu correo para publicar tu Libro y recibir el aviso de cada nueva
                reclamación. El enlace vence en 24 horas.
              </p>
`
      : '';

    const verificationText = verificationUrl
      ? `
        Confirma tu correo (obligatorio para publicar tu Libro; el enlace vence en 24 horas):
        ${verificationUrl}
`
      : '';

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: '¡Bienvenido a LibroDigital.pe! - Tu contraseña de acceso',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenido a LibroDigital.pe</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .password-box { background-color: #f1f5f9; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
            .password { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #1e293b; letter-spacing: 2px; }
            .button { display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
            .warning { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; color: #92400e; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🛡️ LibroDigital.pe</h1>
              <p style="color: #e2e8f0; margin: 10px 0 0 0;">Plataforma de Libros de Reclamaciones</p>
            </div>
            
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 20px;">¡Hola ${escapeHtml(firstName)}!</h2>
              
              <p style="color: #475569; line-height: 1.6;">
                Tu cuenta en LibroDigital.pe ha sido creada exitosamente. Para completar tu registro,
                primero confirma tu correo y luego accede con estos datos:
              </p>

              <div class="password-box">
                <p style="margin: 0 0 10px 0; color: #64748b; font-weight: bold;">Tu contraseña de acceso:</p>
                <div class="password">${password}</div>
              </div>

              <div class="warning">
                <strong>⚠️ Importante:</strong> guarda esta contraseña en un lugar seguro.
                <br>
                <strong>Confirma tu correo con el botón de abajo antes de publicar tu Libro:</strong>
                sin esa confirmación el registro no se puede completar.
              </div>

              ${verificationHtml}

              <p style="color: #475569; line-height: 1.6;">
                <strong>Próximos pasos:</strong><br>
                1. Confirma tu correo con el botón de arriba (obligatorio)<br>
                2. Inicia sesión con tu email y la contraseña proporcionada<br>
                3. Configura los datos de tu empresa y publica tu Libro de Reclamaciones
              </p>

              <div style="text-align: center;">
                <a href="${process.env.APP_URL || 'https://librodigital.pe'}/panel" class="button">
                  Acceder a mi cuenta
                </a>
              </div>

              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos.
              </p>
            </div>

            <div class="footer">
              <p>© 2024 LibroDigital.pe - Plataforma de gestión de libros de reclamaciones</p>
              <p>Sistema desarrollado siguiendo las normativas peruanas de protección al consumidor</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ¡Hola ${firstName}!

        Tu cuenta en LibroDigital.pe ha sido creada exitosamente.

        Tu contraseña de acceso: ${password}
${verificationText}
        Para acceder a tu cuenta, visita: ${process.env.APP_URL || 'https://librodigital.pe'}/panel

        Por seguridad, guarda esta contraseña en un lugar seguro.

        ¡Bienvenido a LibroDigital.pe!
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Welcome email sent to ${email}`);
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  /**
   * "Confirma tu correo" email.
   *
   * Used at signup (the link also rides inside the welcome email, so this is the
   * resend path) and by `POST /api/auth/resend-verification`.
   */
  async sendEmailVerification(email: string, firstName: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.APP_URL || 'https://librodigital.pe'}/acceso/verificar-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verifica tu dirección de email - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verifica tu email</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .button { display: inline-block; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✉️ Verifica tu Email</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <p>Para completar tu registro en LibroDigital.pe, necesitas verificar tu dirección de email.</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verificar mi Email</a>
              </div>
              <p style="color: #64748b; font-size: 14px;">Este enlace expira en 24 horas. Si no solicitaste esta verificación, puedes ignorar este email.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Plain-text alternative: the local dev transport prints THIS field, so
      // without it a developer running the app with no SMTP configured could
      // never follow the confirmation link.
      text: `
        ¡Hola ${firstName}!

        Confirma tu correo para que podamos avisarte de cada nueva reclamación de tu Libro de Reclamaciones.

        Enlace de confirmación (vence en 24 horas):
        ${verificationUrl}

        Si no creaste esta cuenta, ignora este email.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * "Tu código de acceso" email: the second login option.
   *
   * The code is the whole message - no link - so it works on a phone that never
   * opens the app's URL, and the plain-text part carries it too (the local dev
   * transport prints only the text field).
   */
  async sendLoginCode(email: string, firstName: string, code: string, ttlMinutes: number): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Tu código de acceso - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Tu código de acceso</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #1b1611, #5c5246); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .code { display: block; margin: 24px auto; padding: 18px 24px; width: fit-content; border-radius: 10px; background-color: #f3eadc; color: #1b1611; font-size: 34px; font-weight: bold; letter-spacing: 8px; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Tu código de acceso</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <p>Usa este código para entrar a tu Libro de Reclamaciones:</p>
              <span class="code">${code}</span>
              <p style="color: #64748b; font-size: 14px;">Vence en ${ttlMinutes} minutos y solo se puede usar una vez. Si no intentaste entrar, ignora este email y cambia tu contraseña.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ¡Hola ${firstName}!

        Tu código de acceso es: ${code}

        Vence en ${ttlMinutes} minutos y solo se puede usar una vez.
        Si no intentaste entrar, ignora este email y cambia tu contraseña.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Login code email sent to ${email}`);
    } catch (error) {
      console.error('Error sending login code email:', error);
      throw new Error('Failed to send login code email');
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'https://librodigital.pe'}/acceso/restablecer-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Restablece tu contraseña - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Restablecer contraseña</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #ef4444, #f59e0b); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .button { display: inline-block; background: linear-gradient(135deg, #ef4444, #f59e0b); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .warning { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; color: #92400e; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Restablecer Contraseña</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en LibroDigital.pe.</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Crear Nueva Contraseña</a>
              </div>
              <div class="warning">
                <strong>⚠️ Seguridad:</strong> Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email y tu contraseña permanecerá sin cambios.
              </div>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send login notification for security
   */
  async sendLoginNotification(email: string, firstName: string, ipAddress: string, userAgent: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Nuevo acceso a tu cuenta - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Notificación de acceso</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #10b981, #3b82f6); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .info-box { background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Acceso Confirmado</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <p>Se ha iniciado sesión en tu cuenta de LibroDigital.pe.</p>
              <div class="info-box">
                <p><strong>Fecha y hora:</strong> ${new Date().toLocaleString('es-PE')}</p>
                <p><strong>Dirección IP:</strong> ${escapeHtml(ipAddress)}</p>
                <p><strong>Dispositivo:</strong> ${escapeHtml(userAgent)}</p>
              </div>
              <p>Si fuiste tú, puedes ignorar este email. Si no reconoces este acceso, cambia tu contraseña inmediatamente.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe - Notificación de seguridad</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Tells the administrators of a business that a login is asking for access to
   * their RUC, so somebody can approve or reject it from /empresas.
   */
  async sendAccessRequestReceived(params: {
    to: string;
    businessName: string;
    requesterName: string;
    requesterEmail: string;
    message?: string | null;
  }): Promise<void> {
    const { to, businessName, requesterName, requesterEmail, message } = params;
    const reviewUrl = `${process.env.APP_URL || 'https://librodigital.pe'}/empresas`;

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject: `Solicitud de acceso a ${businessName} - LibroDigital.pe`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Solicitud de acceso</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2>Solicitud de acceso a ${escapeHtml(businessName)}</h2>
            <p>
              <strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(requesterEmail)}) solicita acceso al RUC
              registrado en esta cuenta para administrar el Libro de Reclamaciones.
            </p>
            ${message ? `<p style="background: #f1f5f9; padding: 12px; border-radius: 6px;">"${escapeHtml(message)}"</p>` : ''}
            <p>
              Revise la solicitud en <a href="${reviewUrl}">${reviewUrl}</a> (sección Empresas →
              Solicitudes recibidas). Si no reconoce a esta persona, rechácela.
            </p>
            <p style="color: #64748b; font-size: 14px;">© 2024 LibroDigital.pe</p>
          </div>
        </body>
        </html>
      `,
      text: `
        Solicitud de acceso a ${businessName}

        ${requesterName} (${requesterEmail}) solicita acceso al RUC registrado en esta cuenta.

        ${message ? `Mensaje: ${message}\n` : ''}Revise la solicitud en: ${reviewUrl}

        Si no reconoce a esta persona, rechácela.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Access request notification sent to ${to}`);
    } catch (error) {
      // The request itself is already stored; a notification failure must not
      // lose it, so this is logged and swallowed.
      console.error('Error sending access request notification:', error);
    }
  }

  /** Tells the requester the outcome of its access request. */
  async sendAccessRequestDecision(params: {
    to: string;
    requesterName: string;
    businessName: string;
    approved: boolean;
    note?: string | null;
  }): Promise<void> {
    const { to, requesterName, businessName, approved, note } = params;
    const loginUrl = `${process.env.APP_URL || 'https://librodigital.pe'}/acceso`;

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject: approved
        ? `Acceso aprobado a ${businessName} - LibroDigital.pe`
        : 'Solicitud de acceso rechazada - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Resultado de la solicitud</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2>${approved ? 'Acceso aprobado' : 'Solicitud rechazada'}</h2>
            <p>¡Hola ${escapeHtml(requesterName)}!</p>
            <p>
              ${approved
                ? `Ya puede administrar el Libro de Reclamaciones de <strong>${escapeHtml(businessName)}</strong>. Inicie sesión y elija esa empresa en el selector de empresas.`
                : `Su solicitud de acceso a <strong>${escapeHtml(businessName)}</strong> fue rechazada. Si cree que es un error, contacte a la empresa o inténtelo nuevamente más adelante.`}
            </p>
            ${note ? `<p style="background: #f1f5f9; padding: 12px; border-radius: 6px;">"${escapeHtml(note)}"</p>` : ''}
            ${approved ? `<p>Ingrese en: <a href="${loginUrl}">${loginUrl}</a></p>` : ''}
            <p style="color: #64748b; font-size: 14px;">© 2024 LibroDigital.pe</p>
          </div>
        </body>
        </html>
      `,
      text: `
        ¡Hola ${requesterName}!

        ${approved
          ? `Acceso aprobado: ya puede administrar el Libro de Reclamaciones de ${businessName}.`
          : `Su solicitud de acceso a ${businessName} fue rechazada.`}

        ${note ? `Nota: ${note}\n` : ''}${approved ? `Ingrese en: ${loginUrl}` : ''}
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Access request decision sent to ${to}`);
    } catch (error) {
      console.error('Error sending access request decision:', error);
    }
  }

  /**
   * Send password change confirmation
   */
  async sendPasswordChangeConfirmation(email: string, firstName: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Contraseña actualizada - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Contraseña actualizada</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #10b981, #059669); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .success-box { background-color: #d1fae5; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Contraseña Actualizada</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <div class="success-box">
                <p><strong>✓ Tu contraseña ha sido actualizada exitosamente</strong></p>
                <p>Fecha: ${new Date().toLocaleString('es-PE')}</p>
              </div>
              <p>Si no realizaste este cambio, contacta con nuestro soporte inmediatamente.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe - Notificación de seguridad</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send account locked notification
   */
  async sendAccountLockedNotification(email: string, firstName: string, unlockTime: Date): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: '🔒 Cuenta temporalmente bloqueada - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Cuenta bloqueada</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #ef4444, #dc2626); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .warning-box { background-color: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin: 20px 0; color: #dc2626; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Cuenta Bloqueada</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${escapeHtml(firstName)}!</h2>
              <div class="warning-box">
                <p><strong>Tu cuenta ha sido temporalmente bloqueada</strong></p>
                <p>Motivo: Múltiples intentos de inicio de sesión fallidos</p>
                <p><strong>Se desbloqueará automáticamente:</strong> ${unlockTime.toLocaleString('es-PE')}</p>
              </div>
              <p>Si necesitas acceso inmediato o no reconoces estos intentos, contacta con nuestro soporte.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroDigital.pe - Notificación de seguridad</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send the provider's response to a consumer complaint
   */
  async sendComplaintResponse(email: string, complaint: Complaint, response: string, customization?: EmailCustomization): Promise<void> {
    const mailOptions = {
      from: mailFrom(customization) ?? `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      replyTo: replyToAddress(customization),
      to: email,
      subject: consumerSubject(`Respuesta a tu ${complaint.complaintType} ${complaint.correlativeNumber}`, customization),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Respuesta a tu reclamación</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 26px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .info-box { background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .response-box { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; white-space: pre-wrap; }
            .brand-header { padding: 18px 20px 0; color: #334155; font-size: 14px; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${renderHeader(customization)}
            ${renderIdentityHeader(customization)}
            <div class="header">
              <h1>📄 Respuesta a tu reclamación</h1>
            </div>
            <div class="content">
              <h2>Hola ${escapeHtml(complaint.consumerFullName)}</h2>
              <div class="info-box">
                <p><strong>Número de registro:</strong> ${escapeHtml(complaint.correlativeNumber)}</p>
                <p><strong>Tipo:</strong> ${escapeHtml(complaint.complaintType)}</p>
                <p><strong>Fecha de presentación:</strong> ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}</p>
              </div>
              <p>Esta es la respuesta de la empresa a tu ${escapeHtml(complaint.complaintType)}:</p>
              <div class="response-box">${escapeHtml(response)}</div>
              <p>Si tienes alguna consulta adicional, responde a este correo.</p>
            </div>
            <div class="footer">
              ${renderFooter(customization)}
              ${renderFooterBranding(customization)}
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hola ${complaint.consumerFullName}

Respuesta a tu ${complaint.complaintType} ${complaint.correlativeNumber}:

${response}

${plainSignature(customization)}
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending complaint response:', error);
      throw new Error('Failed to send complaint response');
    }
  }

  /**
   * Send the complaint confirmation together with the generated PDF receipt.
   *
   * The optional customization applies the business's own subject prefix and
   * header/footer texts (Phase 2.8) and, since the consumer filed with the
   * business and not with the platform, the business's identity (name, logo,
   * contact data and reply address - Phase 2.8b).
   */
  async sendComplaintConfirmation(
    email: string,
    complaint: Complaint,
    pdfBuffer?: Buffer,
    customization?: EmailCustomization,
  ): Promise<void> {
    const mailOptions = {
      from: mailFrom(customization) ?? `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      replyTo: replyToAddress(customization),
      to: email,
      subject: consumerSubject(`Confirmación de ${complaint.complaintType} ${complaint.correlativeNumber}`, customization),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Confirmación de reclamación</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; }
            .header { background: linear-gradient(135deg, #10b981, #3b82f6); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 26px; font-weight: bold; }
            .content { padding: 40px 20px; }
            .info-box { background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .warning { background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0; color: #92400e; }
            .brand-header { padding: 18px 20px 0; color: #334155; font-size: 14px; }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${renderHeader(customization)}
            ${renderIdentityHeader(customization)}
            <div class="header">
              <h1>✅ Reclamación registrada</h1>
            </div>
            <div class="content">
              <h2>Hola ${escapeHtml(complaint.consumerFullName)}</h2>
              <p>Tu ${escapeHtml(complaint.complaintType)} ha sido registrada correctamente en nuestro Libro de Reclamaciones.</p>
              <div class="info-box">
                <p><strong>Número de registro:</strong> ${escapeHtml(complaint.correlativeNumber)}</p>
                <p><strong>Tipo:</strong> ${escapeHtml(complaint.complaintType)}</p>
                <p><strong>Fecha de presentación:</strong> ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}</p>
                <p><strong>Fecha límite de respuesta:</strong> ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}</p>
              </div>
              <div class="warning">
                <strong>⚠️ Plazo legal:</strong> Conforme al DS 101-2022-PCM, la empresa cuenta con un plazo máximo de
                15 días hábiles para responder tu reclamación.
              </div>
              <p>Adjuntamos el documento PDF con el detalle de tu registro.</p>
            </div>
            <div class="footer">
              ${renderFooter(customization)}
              ${renderFooterBranding(customization)}
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hola ${complaint.consumerFullName}

Tu ${complaint.complaintType} ha sido registrada correctamente.

Número de registro: ${complaint.correlativeNumber}
Fecha de presentación: ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}
Fecha límite de respuesta: ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}

Conforme al DS 101-2022-PCM la empresa cuenta con 15 días hábiles para responder.

Los datos de esta reclamación se conservan por 24 meses y luego se anonimizan,
de acuerdo con la Ley N° 29733.

${plainSignature(customization)}
      `,
      attachments: pdfBuffer
        ? [{
            filename: `reclamacion-${complaint.correlativeNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }]
        : undefined,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending complaint confirmation:', error);
      throw new Error('Failed to send complaint confirmation');
    }
  }

  /**
   * Notifies the business's configured notification email when a new complaint
   * is filed, attaching the PDF constancia and linking to the management panel.
   */
  async sendNewComplaintAlert(
    to: string,
    complaint: Complaint,
    businessName: string,
    pdfBuffer?: Buffer,
  ): Promise<void> {
    const panelUrl = `${process.env.APP_URL || 'https://librodigital.pe'}/reclamos`;
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      replyTo: complaint.consumerEmail,
      to,
      subject: `Nueva ${complaint.complaintType} ${complaint.correlativeNumber} - ${businessName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Nueva reclamación recibida</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2>Nueva ${escapeHtml(complaint.complaintType)} recibida (${escapeHtml(complaint.correlativeNumber)})</h2>
            <p>Se ha registrado una nueva ${escapeHtml(complaint.complaintType)} en el Libro de Reclamaciones de <strong>${escapeHtml(businessName)}</strong>.</p>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Consumidor:</strong> ${escapeHtml(complaint.consumerFullName)} (${escapeHtml(complaint.consumerEmail)})</p>
              <p style="margin: 4px 0;"><strong>Fecha límite legal (15 días hábiles):</strong> ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}</p>
              <p style="margin: 8px 0 4px;"><strong>Detalle:</strong></p>
              <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(complaint.complaintDetail)}</p>
            </div>
            <p>Puede gestionarla y responder desde su panel: <a href="${panelUrl}">${panelUrl}</a></p>
            <p style="color: #64748b; font-size: 14px;">© 2024 LibroDigital.pe</p>
          </div>
        </body>
        </html>
      `,
      text: `Nueva ${complaint.complaintType} recibida (${complaint.correlativeNumber}) - ${businessName}

Consumidor: ${complaint.consumerFullName} (${complaint.consumerEmail})
Fecha límite legal (15 días hábiles): ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}

Detalle:
${complaint.complaintDetail}

Gestione y responda esta reclamación en: ${panelUrl}
`,
      attachments: pdfBuffer
        ? [{
            filename: `reclamacion-${complaint.correlativeNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }]
        : undefined,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending new complaint alert to business:', error);
    }
  }

  /** SLA reminder for the assignee (before the escalation threshold). */
  async sendSlaReminder(email: string, businessName: string, correlativeNumber: string, message: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: `Recordatorio SLA: ${correlativeNumber} - ${businessName}`,
      text: `
Recordatorio de plazo - ${businessName}

${message}

El plazo legal de respuesta es de 15 días hábiles (DS 101-2022-PCM).
Revise la reclamación en el panel de gestión: /reclamos

LibroDigital.pe
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending SLA reminder:', error);
      throw new Error('Failed to send SLA reminder');
    }
  }

  /**
   * SLA escalation notice for the responsible staff member (Phase 2.9).
   * Fire-and-forget: failures are logged by the caller, never the complaint flow.
   */
  async sendSlaEscalation(email: string, businessName: string, correlativeNumber: string, message: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: `⚠️ ESCALADO SLA: ${correlativeNumber} - ${businessName}`,
      text: `
Escalado automático de SLA - ${businessName}

${message}

El plazo legal de respuesta es de 15 días hábiles (DS 101-2022-PCM).
Revise la reclamación en el panel de gestión: /reclamos

LibroDigital.pe
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending SLA escalation:', error);
      throw new Error('Failed to send SLA escalation');
    }
  }

  /**
   * Monthly executive report (AI) as a PDF attachment.
   *
   * Sent only when the customer clicks "generar y enviar", never automatically:
   * an AI report per tenant per month would be both costly and noisy.
   */
  async sendExecutiveReport(
    email: string,
    businessName: string,
    periodLabel: string,
    pdfBuffer: Buffer,
    report: ExecutiveReport,
  ): Promise<void> {
    const list = (items: string[]): string =>
      items.length > 0 ? items.map((item) => `• ${item}`).join('\n') : '• Sin observaciones.';

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: `Reporte ejecutivo IA — ${periodLabel} — ${businessName}`,
      text: `
Reporte ejecutivo — ${businessName}
Periodo: ${periodLabel}

${report.headline}

${report.summary}

Hallazgos
${list(report.highlights)}

Riesgos
${list(report.risks)}

Acciones recomendadas
${list(report.actions)}

Indicadores
${list(report.kpiNotes)}

Adjuntamos el PDF con el mismo contenido.

Reporte generado con asistencia de IA a partir de los datos del Libro de Reclamaciones.
Es una herramienta de apoyo: revise las cifras antes de tomar decisiones.

LibroDigital.pe
      `,
      attachments: [
        {
          filename: `reporte-ejecutivo-${periodLabel.replace(/\s+/g, '-')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending executive report:', error);
      throw new Error('Failed to send executive report');
    }
  }

  /**
   * Receipt for a confirmed payment (Phase 2.7).
   *
   * Sent from our own system the moment money turns into a plan, instead of
   * relying on the provider's own receipt email. Two reasons: Mercado Pago cannot
   * deliver anything to a test user's mailbox - so the sandbox could never prove
   * that path - and a bank transfer has no provider email at all. This way every
   * confirmed charge produces one message, whatever the payment method.
   *
   * The caller sends it fire-and-forget: a receipt that cannot be delivered must
   * never undo a payment that has already been confirmed.
   */
  async sendPaymentReceipt(params: {
    email: string;
    firstName: string;
    businessName: string;
    planName: string;
    periodLabel: string;
    amountLabel: string;
    methodName: string;
    reference: string;
    /** Absent while the paid period is still running out (a renewal, or a trial). */
    validUntilLabel: string | null;
    /**
     * The platform's own identity, as configured in the console (Configuración).
     *
     * Optional so the receipt still works when nobody has filled it in; what it adds is
     * the fiscal footer a customer may need for their own accounting.
     */
    identity?: PlatformIdentityFooter;
    /**
     * What the comprobante will be, and the IGV breakdown of the amount paid.
     *
     * All optional so older callers keep working; when present they turn the
     * receipt into a document the customer's accountant can already reconcile,
     * even though the factura/boleta itself arrives separately (Phase 1 is manual).
     */
    billingDocLabel?: string;
    subtotalLabel?: string;
    igvLabel?: string;
    igvRateLabel?: string;
    comprobanteNote?: string;
  }): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: params.email,
      subject: `Comprobante de pago ${params.reference} - ${params.planName}`,
      text: [
        `Comprobante de pago - ${params.businessName}`,
        '',
        `Hola ${params.firstName},`,
        '',
        'Confirmamos la recepción de su pago y la activación de su plan:',
        '',
        `  Plan:          ${params.planName} (${params.periodLabel})`,
        ...(params.subtotalLabel ? [`  Valor de venta: ${params.subtotalLabel}`] : []),
        ...(params.igvLabel
          ? [`  IGV${params.igvRateLabel ? ` (${params.igvRateLabel})` : ''}:          ${params.igvLabel}`]
          : []),
        `  Monto:         ${params.amountLabel}`,
        `  Medio de pago: ${params.methodName}`,
        `  Referencia:    ${params.reference}`,
        ...(params.billingDocLabel ? [`  Comprobante:   ${params.billingDocLabel}`] : []),
        ...(params.validUntilLabel ? [`  Válido hasta:  ${params.validUntilLabel}`] : []),
        '',
        ...(params.comprobanteNote ? [params.comprobanteNote, ''] : []),
        'Puede consultar el detalle en cualquier momento en la sección Pagos: /pagos',
        '',
        'Conserve este mensaje como constancia de su pago.',
        '',
        ...identityFooterLines(params.identity),
      ].join('\n'),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending payment receipt:', error);
      throw new Error('Failed to send payment receipt');
    }
  }

  /**
   * The issued factura/boleta, with its PDF and XML attached (Phase 1).
   *
   * Sending the XML is not optional politeness: it is the document the buyer's
   * accountant books. The PDF is only the printed representation, and the
   * message says so, exactly as SUNAT expects a representation impresa to be
   * labelled.
   */
  async sendComprobanteIssued(params: {
    email: string;
    customerName: string;
    /** "Factura electrónica" / "Boleta de venta electrónica". */
    docLabel: string;
    /** F001-00000123 */
    fullNumber: string;
    issueDateLabel: string;
    subtotalCents: number;
    igvCents: number;
    totalCents: number;
    rateBps: number;
    description: string;
    paymentMethod: string | null;
    attachments: Array<{ filename: string; path: string }>;
    identity?: PlatformIdentityFooter;
  }): Promise<void> {
    const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;
    const method = (params.paymentMethod ?? '').trim();
    const hasFiles = params.attachments.length > 0;

    const mailOptions: SendMailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: params.email,
      subject: `${params.docLabel} ${params.fullNumber} - LibroDigital.pe`,
      text: [
        `${params.docLabel} ${params.fullNumber}`,
        '',
        `Hola ${params.customerName || 'cliente'},`,
        '',
        hasFiles
          ? 'Adjuntamos su comprobante electrónico en PDF (representación impresa) y XML (documento válido ante SUNAT).'
          : 'Su comprobante electrónico ya fue emitido. Responda este correo si necesita que le reenviemos el PDF y el XML.',
        '',
        ...(params.issueDateLabel ? [`  Fecha de emisión: ${params.issueDateLabel}`] : []),
        `  Comprobante:      ${params.fullNumber}`,
        `  Descripción:      ${params.description}`,
        `  Valor de venta:   ${soles(params.subtotalCents)}`,
        `  IGV (${formatIgvRate(params.rateBps)}):        ${soles(params.igvCents)}`,
        `  Total:            ${soles(params.totalCents)}`,
        ...(method ? [`  Medio de pago:    ${method}`] : []),
        '',
        COMPROBANTE_LEGAL_NOTE,
        COMPROBANTE_VERIFICATION_NOTE,
        '',
        'Si necesita una corrección, escríbanos y emitiremos la nota de crédito que corresponda.',
        '',
        ...identityFooterLines(params.identity),
      ].join('\n'),
      ...(hasFiles ? { attachments: params.attachments } : {}),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending the issued comprobante:', error);
      throw new Error('Failed to send the issued comprobante');
    }
  }

  /**
   * "Finish your payment" email (Phase 2.7, step 5).
   *
   * Sent automatically the moment a charge is declined, and on demand from the
   * console: the customer gets the same checkout link they used the first time,
   * plus the transfer/Yape details for the same reference. A rejected card
   * therefore does not become a lost sale, and the customer does not have to call
   * anybody to find out how to pay.
   *
   * The body is built by `@shared/payment-recovery`, so the automatic message and
   * the operator's resend are identical.
   */
  async sendPaymentRecovery(params: {
    email: string;
    firstName: string;
    businessName: string;
    planName: string;
    periodLabel: string;
    amountLabel: string;
    reference: string;
    /** The provider checkout the customer used, when it is still usable. */
    checkoutUrl: string | null;
    /** Our own page that starts the same purchase again. Always present. */
    resumeUrl: string;
    /** Rendered transfer/Yape instructions, or null when none are configured. */
    transferInstructions: string | null;
    /** Why the first attempt failed, in the customer's words. */
    reason: string | null;
    identity?: PlatformIdentityFooter;
  }): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: params.email,
      subject: paymentRecoverySubject(params),
      text: buildPaymentRecoveryText({
        firstName: params.firstName,
        businessName: params.businessName,
        planName: params.planName,
        periodLabel: params.periodLabel,
        amountLabel: params.amountLabel,
        reference: params.reference,
        checkoutUrl: params.checkoutUrl,
        resumeUrl: params.resumeUrl,
        transferInstructions: params.transferInstructions,
        reason: params.reason,
        footerLines: identityFooterLines(params.identity),
      }),
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending the payment recovery email:', error);
      throw new Error('Failed to send the payment recovery email');
    }
  }

  /**
   * Sends a plain "it works" message so an administrator can confirm SMTP
   * delivery end-to-end, not just that the socket and credentials are valid.
   */
  async sendTestEmail(email: string, firstName?: string): Promise<void> {
    const greeting = firstName ? `¡Hola ${firstName}!` : '¡Hola!';
    const htmlGreeting = firstName ? `¡Hola ${escapeHtml(firstName)}!` : '¡Hola!';

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Prueba de correo - LibroDigital.pe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Prueba de correo</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2>${htmlGreeting}</h2>
            <p>Este es un correo de prueba enviado desde el Libro de Reclamaciones para verificar la configuración de envío.</p>
            <p>Si lo recibiste, el servicio de correo está configurado correctamente.</p>
            <p style="color: #64748b; font-size: 14px;">© 2024 LibroDigital.pe</p>
          </div>
        </body>
        </html>
      `,
      text: `${greeting}

Este es un correo de prueba del Libro de Reclamaciones para verificar la configuración de envío.

Si lo recibiste, el servicio de correo está configurado correctamente.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending test email:', error);
      throw new Error('Failed to send test email');
    }
  }

  /**
   * A message sent from the public contact form (`/contacto`).
   *
   * Goes to the operator's mailbox with the visitor as Reply-To, so answering
   * from the inbox continues the same thread. The destination arrives as a
   * parameter because the route resolves it from the platform identity: this
   * method stays free of settings lookups and is testable on its own.
   */
  async sendContactMessage(params: {
    to: string;
    name: string;
    email: string;
    phone?: string;
    subjectLabel: string;
    message: string;
  }): Promise<void> {
    const name = escapeHtml(params.name);
    const email = escapeHtml(params.email);
    const phone = params.phone ? escapeHtml(params.phone) : '';
    const subjectLabel = escapeHtml(params.subjectLabel);
    const message = escapeHtml(params.message).replace(/\n/g, '<br>');

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: params.to,
      // Replying from the inbox goes straight back to the visitor.
      replyTo: params.email,
      subject: `Contacto web · ${params.subjectLabel} · ${params.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Contacto web</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 4px;">Mensaje desde el sitio web</h2>
            <p style="margin: 0 0 16px; color: #64748b;">${subjectLabel}</p>
            <table style="font-size: 14px; margin-bottom: 16px;">
              <tr><td style="padding: 2px 12px 2px 0; color: #64748b;">Nombre</td><td>${name}</td></tr>
              <tr><td style="padding: 2px 12px 2px 0; color: #64748b;">Correo</td><td>${email}</td></tr>
              ${phone ? `<tr><td style="padding: 2px 12px 2px 0; color: #64748b;">Teléfono</td><td>${phone}</td></tr>` : ''}
            </table>
            <div style="border-left: 3px solid #c02b0a; padding: 8px 0 8px 14px; white-space: normal;">
              ${message}
            </div>
            <p style="margin-top: 24px; color: #64748b; font-size: 12px;">
              Enviado desde el formulario de contacto de LibroDigital.pe. Responda a este correo para escribirle al visitante.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Mensaje desde el sitio web (${params.subjectLabel})

Nombre: ${params.name}
Correo: ${params.email}${params.phone ? `\nTeléfono: ${params.phone}` : ''}

${params.message}
`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending contact message:', error);
      throw new Error('Failed to send contact message');
    }
  }

  /**
   * Operational alert to the platform operator (not to a customer).
   *
   * Used when something happens that only a human can fix - today: a
   * subscription paid through a Mercado Pago plan link that could not be matched
   * to any account. A payment nobody notices is worse than a noisy inbox, so the
   * caller treats this as fire-and-forget.
   */
  async sendPlatformAlert(
    email: string,
    subject: string,
    details: string[],
    identity?: PlatformIdentityFooter,
  ): Promise<void> {
    const body = details.join('\n');

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroDigital.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: `⚠️ ${subject} - LibroDigital.pe`,
      text: `
${subject}

${body}

Revise la sección "Pagos": /pagos

${identityFooterLines(identity).join('\n')}
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending platform alert:', error);
      throw new Error('Failed to send platform alert');
    }
  }

  /**
   * Opens the SMTP connection and authenticates. Throws when the host is
   * unreachable or rejects the credentials, which is what the public status
   * probe needs; `testConnection()` keeps the boolean/logging behaviour used by
   * the admin diagnostics.
   */
  async verifyConnection(): Promise<void> {
    await this.transporter.verify();
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.verifyConnection();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();

// ============================================================================
// Health probe for GET /api/status
// ============================================================================
//
// The status page used to report "operational" from the presence of
// SMTP_USER/SMTP_PASSWORD alone, so a revoked password or a Zoho outage stayed
// green. This performs a real `verify()` (connect + authenticate) and caches the
// result:
//
//  - 10 minutes after a success: the configuration rarely changes;
//  - 30 seconds after a failure: recovery is visible quickly;
//  - never blocks the HTTP response: the probe runs in the background and the
//    caller gets the last result (or `pending` on the first check after boot).
//    The Docker HEALTHCHECK hits /api/status every 30s with a 5s timeout, so a
//    synchronous SMTP handshake would make the container look unhealthy.

/** Health of the SMTP connection, as reported by GET /api/status. */
export interface EmailHealth {
  status: 'operational' | 'degraded' | 'disabled' | 'pending';
  configured: boolean;
  checkedAt: string;
  latencyMs: number | null;
  error?: string;
}

const EMAIL_HEALTH_OK_MS = 10 * 60 * 1000;
const EMAIL_HEALTH_FAIL_MS = 30 * 1000;
const EMAIL_PROBE_TIMEOUT_MS = 8 * 1000;

let emailHealthCache: { expiresAt: number; value: EmailHealth } | null = null;
let emailProbeInFlight: Promise<void> | null = null;

function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runEmailProbe(): Promise<void> {
  const startedAt = Date.now();
  try {
    await withTimeout(emailService.verifyConnection(), EMAIL_PROBE_TIMEOUT_MS);
    emailHealthCache = {
      expiresAt: Date.now() + EMAIL_HEALTH_OK_MS,
      value: {
        status: 'operational',
        configured: true,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    emailHealthCache = {
      expiresAt: Date.now() + EMAIL_HEALTH_FAIL_MS,
      value: {
        status: 'degraded',
        configured: true,
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** Cached, non-blocking SMTP health. */
export function getEmailHealth(): EmailHealth {
  if (!emailConfigured()) {
    return {
      status: 'disabled',
      configured: false,
      checkedAt: new Date().toISOString(),
      latencyMs: null,
    };
  }

  if (emailHealthCache && emailHealthCache.expiresAt > Date.now()) {
    return emailHealthCache.value;
  }

  if (!emailProbeInFlight) {
    emailProbeInFlight = runEmailProbe().finally(() => {
      emailProbeInFlight = null;
    });
  }

  return (
    emailHealthCache?.value ?? {
      status: 'pending',
      configured: true,
      checkedAt: new Date().toISOString(),
      latencyMs: null,
    }
  );
}

/** Test/maintenance hook: forget the cached probe. */
export function resetEmailHealthCache(): void {
  emailHealthCache = null;
  emailProbeInFlight = null;
}
