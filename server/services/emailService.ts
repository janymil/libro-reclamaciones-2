import nodemailer from 'nodemailer';

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

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // SMTP configuration using provided Hostinger credentials
    const emailConfig: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: parseInt(process.env.SMTP_PORT || '465') === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || ''
      }
    };

    this.transporter = nodemailer.createTransport({
      ...emailConfig,
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates if needed
      }
    });
  }

  /**
   * Send welcome email with generated password
   */
  async sendWelcomePassword(email: string, firstName: string, password: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: '¡Bienvenido a LibroVirtual.pe! - Tu contraseña de acceso',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenido a LibroVirtual.pe</title>
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
              <h1>🛡️ LibroVirtual.pe</h1>
              <p style="color: #e2e8f0; margin: 10px 0 0 0;">Plataforma de Libros de Reclamaciones</p>
            </div>
            
            <div class="content">
              <h2 style="color: #1e293b; margin-bottom: 20px;">¡Hola ${firstName}!</h2>
              
              <p style="color: #475569; line-height: 1.6;">
                Tu cuenta en LibroVirtual.pe ha sido creada exitosamente. Para completar tu registro y configurar tu libro de reclamaciones, utiliza los siguientes datos de acceso:
              </p>

              <div class="password-box">
                <p style="margin: 0 0 10px 0; color: #64748b; font-weight: bold;">Tu contraseña de acceso:</p>
                <div class="password">${password}</div>
              </div>

              <div class="warning">
                <strong>⚠️ Importante:</strong> Por seguridad, guarda esta contraseña en un lugar seguro. Podrás cambiarla una vez que accedas a tu cuenta.
              </div>

              <p style="color: #475569; line-height: 1.6;">
                <strong>Próximos pasos:</strong><br>
                1. Inicia sesión con tu email y la contraseña proporcionada<br>
                2. Configura los datos de tu empresa y libro de reclamaciones<br>
                3. ¡Comienza a gestionar tus reclamaciones de forma digital!
              </p>

              <div style="text-align: center;">
                <a href="${process.env.APP_URL || 'https://librovirtual.pe'}/dashboard" class="button">
                  Acceder a mi cuenta
                </a>
              </div>

              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos.
              </p>
            </div>

            <div class="footer">
              <p>© 2024 LibroVirtual.pe - Plataforma de gestión de libros de reclamaciones</p>
              <p>Sistema desarrollado siguiendo las normativas peruanas de protección al consumidor</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        ¡Hola ${firstName}!

        Tu cuenta en LibroVirtual.pe ha sido creada exitosamente.

        Tu contraseña de acceso: ${password}

        Para acceder a tu cuenta, visita: ${process.env.APP_URL || 'https://librovirtual.pe'}/dashboard

        Por seguridad, guarda esta contraseña en un lugar seguro.

        ¡Bienvenido a LibroVirtual.pe!
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
   * Send email verification link
   */
  async sendEmailVerification(email: string, firstName: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.APP_URL || 'https://librovirtual.pe'}/auth/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verifica tu dirección de email - LibroVirtual.pe',
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
              <h2>¡Hola ${firstName}!</h2>
              <p>Para completar tu registro en LibroVirtual.pe, necesitas verificar tu dirección de email.</p>
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verificar mi Email</a>
              </div>
              <p style="color: #64748b; font-size: 14px;">Este enlace expira en 24 horas. Si no solicitaste esta verificación, puedes ignorar este email.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroVirtual.pe</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, firstName: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'https://librovirtual.pe'}/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Restablece tu contraseña - LibroVirtual.pe',
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
              <h2>¡Hola ${firstName}!</h2>
              <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en LibroVirtual.pe.</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Crear Nueva Contraseña</a>
              </div>
              <div class="warning">
                <strong>⚠️ Seguridad:</strong> Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email y tu contraseña permanecerá sin cambios.
              </div>
            </div>
            <div class="footer">
              <p>© 2024 LibroVirtual.pe</p>
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
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Nuevo acceso a tu cuenta - LibroVirtual.pe',
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
              <h2>¡Hola ${firstName}!</h2>
              <p>Se ha iniciado sesión en tu cuenta de LibroVirtual.pe.</p>
              <div class="info-box">
                <p><strong>Fecha y hora:</strong> ${new Date().toLocaleString('es-PE')}</p>
                <p><strong>Dirección IP:</strong> ${ipAddress}</p>
                <p><strong>Dispositivo:</strong> ${userAgent}</p>
              </div>
              <p>Si fuiste tú, puedes ignorar este email. Si no reconoces este acceso, cambia tu contraseña inmediatamente.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroVirtual.pe - Notificación de seguridad</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send password change confirmation
   */
  async sendPasswordChangeConfirmation(email: string, firstName: string): Promise<void> {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: 'Contraseña actualizada - LibroVirtual.pe',
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
              <h2>¡Hola ${firstName}!</h2>
              <div class="success-box">
                <p><strong>✓ Tu contraseña ha sido actualizada exitosamente</strong></p>
                <p>Fecha: ${new Date().toLocaleString('es-PE')}</p>
              </div>
              <p>Si no realizaste este cambio, contacta con nuestro soporte inmediatamente.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroVirtual.pe - Notificación de seguridad</p>
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
      from: `"${process.env.SMTP_FROM_NAME || 'LibroVirtual.pe'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: email,
      subject: '🔒 Cuenta temporalmente bloqueada - LibroVirtual.pe',
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
              <h2>¡Hola ${firstName}!</h2>
              <div class="warning-box">
                <p><strong>Tu cuenta ha sido temporalmente bloqueada</strong></p>
                <p>Motivo: Múltiples intentos de inicio de sesión fallidos</p>
                <p><strong>Se desbloqueará automáticamente:</strong> ${unlockTime.toLocaleString('es-PE')}</p>
              </div>
              <p>Si necesitas acceso inmediato o no reconoces estos intentos, contacta con nuestro soporte.</p>
            </div>
            <div class="footer">
              <p>© 2024 LibroVirtual.pe - Notificación de seguridad</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Test email connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
