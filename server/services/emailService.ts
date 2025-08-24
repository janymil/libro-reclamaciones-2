import nodemailer from 'nodemailer';
import type { Complaint, Business, Establishment } from '@shared/schema';

// Email service for sending notifications and responses
class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter (would use actual SMTP settings in production)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'noreply@librovirtual.pe',
        pass: process.env.SMTP_PASS || 'default_password',
      },
    });
  }

  async sendComplaintConfirmation(
    consumerEmail: string, 
    complaint: Complaint, 
    confirmationPdf?: Buffer
  ): Promise<void> {
    try {
      const mailOptions = {
        from: '"LibroVirtual.pe" <noreply@librovirtual.pe>',
        to: consumerEmail,
        subject: `Confirmación de Reclamación N° ${complaint.correlativeNumber}`,
        html: this.generateComplaintConfirmationEmail(complaint),
        attachments: confirmationPdf ? [{
          filename: `reclamacion-${complaint.correlativeNumber}.pdf`,
          content: confirmationPdf,
          contentType: 'application/pdf'
        }] : undefined,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Complaint confirmation sent to ${consumerEmail}`);
    } catch (error) {
      console.error('Error sending complaint confirmation:', error);
      throw error;
    }
  }

  async sendComplaintResponse(
    consumerEmail: string,
    complaint: Complaint,
    response: string
  ): Promise<void> {
    try {
      const mailOptions = {
        from: '"LibroVirtual.pe" <noreply@librovirtual.pe>',
        to: consumerEmail,
        subject: `Respuesta a su ${complaint.complaintType} N° ${complaint.correlativeNumber}`,
        html: this.generateResponseEmail(complaint, response),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Complaint response sent to ${consumerEmail}`);
    } catch (error) {
      console.error('Error sending complaint response:', error);
      throw error;
    }
  }

  async sendDeadlineAlert(
    userEmail: string,
    complaint: Complaint,
    daysRemaining: number
  ): Promise<void> {
    try {
      const urgency = daysRemaining <= 1 ? 'URGENTE' : 'AVISO';
      
      const mailOptions = {
        from: '"LibroVirtual.pe Alertas" <alertas@librovirtual.pe>',
        to: userEmail,
        subject: `${urgency}: Reclamación ${complaint.correlativeNumber} vence en ${daysRemaining} días`,
        html: this.generateDeadlineAlertEmail(complaint, daysRemaining),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Deadline alert sent to ${userEmail}`);
    } catch (error) {
      console.error('Error sending deadline alert:', error);
      throw error;
    }
  }

  async sendArcoRequestNotification(
    userEmail: string,
    requestType: string,
    requesterName: string
  ): Promise<void> {
    try {
      const mailOptions = {
        from: '"LibroVirtual.pe" <noreply@librovirtual.pe>',
        to: userEmail,
        subject: `Nueva Solicitud de Derecho ARCO: ${requestType}`,
        html: this.generateArcoNotificationEmail(requestType, requesterName),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`ARCO request notification sent to ${userEmail}`);
    } catch (error) {
      console.error('Error sending ARCO notification:', error);
      throw error;
    }
  }

  private generateComplaintConfirmationEmail(complaint: Complaint): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #1565C0; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f5f5f5; padding: 15px; margin: 15px 0; border-left: 4px solid #1565C0; }
            .legal-notice { background: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; }
            .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>LibroVirtual.pe</h1>
            <h2>Confirmación de Reclamación</h2>
        </div>
        
        <div class="content">
            <p>Estimado/a <strong>${complaint.consumerFullName}</strong>,</p>
            
            <p>Hemos recibido su ${complaint.complaintType} y ha sido registrada con los siguientes datos:</p>
            
            <div class="info-box">
                <strong>Número de Reclamación:</strong> ${complaint.correlativeNumber}<br>
                <strong>Fecha de Presentación:</strong> ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}<br>
                <strong>Tipo:</strong> ${complaint.complaintType === 'reclamo' ? 'Reclamo' : 'Queja'}<br>
                <strong>Fecha Límite de Respuesta:</strong> ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}
            </div>
            
            <p><strong>Detalle de su ${complaint.complaintType}:</strong></p>
            <div class="info-box">
                ${complaint.complaintDetail}
            </div>
            
            <div class="legal-notice">
                <strong>Importante:</strong> La presentación de esta hoja de reclamación no limita otras vías de solución, 
                ni constituye condición previa para denunciar ante las autoridades competentes. 
                Tiene derecho a recibir respuesta en un plazo máximo de 15 días hábiles.
            </div>
            
            <p>Atentamente,</p>
            <p><strong>Equipo LibroVirtual.pe</strong></p>
        </div>
        
        <div class="footer">
            <p>Este mensaje ha sido generado automáticamente. Para consultas adicionales, 
            contacte al establecimiento donde presentó su reclamación.</p>
            <p>LibroVirtual.pe - Sistema de Gestión Legal de Libro de Reclamaciones</p>
        </div>
    </body>
    </html>
    `;
  }

  private generateResponseEmail(complaint: Complaint, response: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #2E7D32; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f5f5f5; padding: 15px; margin: 15px 0; border-left: 4px solid #2E7D32; }
            .response-box { background: #e8f5e8; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>LibroVirtual.pe</h1>
            <h2>Respuesta a su ${complaint.complaintType}</h2>
        </div>
        
        <div class="content">
            <p>Estimado/a <strong>${complaint.consumerFullName}</strong>,</p>
            
            <div class="info-box">
                <strong>Número de Reclamación:</strong> ${complaint.correlativeNumber}<br>
                <strong>Fecha de Respuesta:</strong> ${new Date().toLocaleDateString('es-PE')}<br>
                <strong>Tipo:</strong> ${complaint.complaintType === 'reclamo' ? 'Reclamo' : 'Queja'}
            </div>
            
            <p>En respuesta a su ${complaint.complaintType} presentada el ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}, nos complace proporcionarle la siguiente respuesta:</p>
            
            <div class="response-box">
                <h3>Respuesta del Proveedor:</h3>
                ${response.replace(/\n/g, '<br>')}
            </div>
            
            <p>Esta respuesta se emite en cumplimiento del Decreto Supremo N° 101-2022-PCM, dentro del plazo de 15 días hábiles establecido por ley.</p>
            
            <p>Si tiene alguna consulta adicional sobre esta respuesta, puede contactarnos a través de los canales oficiales del establecimiento.</p>
            
            <p>Atentamente,</p>
            <p><strong>Equipo LibroVirtual.pe</strong></p>
        </div>
        
        <div class="footer">
            <p>Este mensaje contiene la respuesta oficial a su reclamación según la normativa peruana vigente.</p>
            <p>LibroVirtual.pe - Sistema de Gestión Legal de Libro de Reclamaciones</p>
        </div>
    </body>
    </html>
    `;
  }

  private generateDeadlineAlertEmail(complaint: Complaint, daysRemaining: number): string {
    const urgencyColor = daysRemaining <= 1 ? '#C62828' : '#F57C00';
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: ${urgencyColor}; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .alert-box { background: #fff3e0; padding: 15px; margin: 15px 0; border-left: 4px solid ${urgencyColor}; }
            .action-box { background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>⚠️ Alerta de Vencimiento</h1>
            <h2>LibroVirtual.pe</h2>
        </div>
        
        <div class="content">
            <div class="alert-box">
                <h3>${daysRemaining <= 1 ? '🚨 URGENTE' : '⏰ AVISO'}: Reclamación próxima a vencer</h3>
                <p><strong>Número:</strong> ${complaint.correlativeNumber}</p>
                <p><strong>Consumidor:</strong> ${complaint.consumerFullName}</p>
                <p><strong>Días restantes:</strong> ${daysRemaining} ${daysRemaining === 1 ? 'día hábil' : 'días hábiles'}</p>
                <p><strong>Fecha límite:</strong> ${new Date(complaint.dueDate).toLocaleDateString('es-PE')}</p>
            </div>
            
            <div class="action-box">
                <h4>Acciones requeridas:</h4>
                <ul>
                    <li>Revisar el detalle de la reclamación</li>
                    <li>Preparar respuesta conforme a la normativa</li>
                    <li>Enviar respuesta antes del vencimiento</li>
                    <li>Documentar la respuesta en el sistema</li>
                </ul>
            </div>
            
            <p><strong>Recordatorio legal:</strong> Según DS 101-2022-PCM, las reclamaciones deben ser respondidas en un plazo máximo de 15 días hábiles improrrogables.</p>
            
            <p>Ingrese al sistema LibroVirtual.pe para gestionar esta reclamación.</p>
        </div>
        
        <div class="footer">
            <p>Alerta automática del Sistema de Gestión Legal LibroVirtual.pe</p>
        </div>
    </body>
    </html>
    `;
  }

  private generateArcoNotificationEmail(requestType: string, requesterName: string): string {
    const typeLabels = {
      'access': 'Acceso a datos personales',
      'rectification': 'Rectificación de datos',
      'cancellation': 'Cancelación de datos',
      'opposition': 'Oposición al tratamiento'
    };
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #673AB7; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .info-box { background: #f3e5f5; padding: 15px; margin: 15px 0; border-left: 4px solid #673AB7; }
            .legal-box { background: #e8f5e8; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🛡️ Nueva Solicitud ARCO</h1>
            <h2>LibroVirtual.pe</h2>
        </div>
        
        <div class="content">
            <div class="info-box">
                <h3>Solicitud de Derecho ARCO Recibida</h3>
                <p><strong>Tipo de solicitud:</strong> ${typeLabels[requestType as keyof typeof typeLabels] || requestType}</p>
                <p><strong>Solicitante:</strong> ${requesterName}</p>
                <p><strong>Fecha de recepción:</strong> ${new Date().toLocaleDateString('es-PE')}</p>
            </div>
            
            <div class="legal-box">
                <h4>Marco Legal - Ley 29733 y DS 016-2024-JUS:</h4>
                <ul>
                    <li>Plazo de respuesta: 10-15 días hábiles según tipo de solicitud</li>
                    <li>Debe verificar identidad del solicitante</li>
                    <li>Documentar toda la gestión realizada</li>
                    <li>Respuesta debe ser clara y completa</li>
                </ul>
            </div>
            
            <p>Ingrese al sistema LibroVirtual.pe para revisar los detalles completos de la solicitud y gestionar la respuesta.</p>
        </div>
        
        <div class="footer">
            <p>Notificación automática del Sistema de Gestión Legal LibroVirtual.pe</p>
        </div>
    </body>
    </html>
    `;
  }
}

export const emailService = new EmailService();
