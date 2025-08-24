import nodemailer from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Initialize with environment variables
    const emailConfig: EmailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    };

    this.transporter = nodemailer.createTransport(emailConfig);
  }

  /**
   * Send welcome email with generated password
   */
  async sendWelcomePassword(email: string, firstName: string, password: string): Promise<void> {
    const mailOptions = {
      from: `"LibroVirtual.pe" <${process.env.SMTP_FROM || 'noreply@librovirtual.pe'}>`,
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
