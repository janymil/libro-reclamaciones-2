import PDFDocument from 'pdfkit';
import type { Complaint, Business, Establishment } from '@shared/schema';

class PDFService {
  async generateComplaintConfirmation(
    complaint: Complaint, 
    business: Business, 
    establishment: Establishment
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Header
        doc.fontSize(16).font('Helvetica-Bold').text('CONSTANCIA DE RECLAMACIÓN', { align: 'center' });
        doc.moveDown();
        
        // Legal reference
        doc.fontSize(10).font('Helvetica').text('Conforme al DS 011-2011-PCM y DS 101-2022-PCM', { align: 'center' });
        doc.moveDown(2);

        // Business information
        doc.fontSize(12).font('Helvetica-Bold').text('DATOS DEL PROVEEDOR:');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Razón Social: ${business.businessName}`);
        doc.text(`RUC: ${business.ruc}`);
        doc.text(`Establecimiento: ${establishment.name}`);
        doc.text(`Dirección: ${establishment.address}`);
        doc.moveDown();

        // Complaint information
        doc.fontSize(12).font('Helvetica-Bold').text('DATOS DE LA RECLAMACIÓN:');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Número Correlativo: ${complaint.correlativeNumber}`);
        doc.text(`Fecha de Presentación: ${new Date(complaint.submissionDate).toLocaleDateString('es-PE')}`);
        doc.text(`Tipo: ${complaint.complaintType === 'reclamo' ? 'Reclamo' : 'Queja'}`);
        doc.text(`Fecha Límite de Respuesta: ${new Date(complaint.dueDate).toLocaleDateString('es-PE')} (15 días hábiles)`);
        doc.moveDown();

        // Consumer information
        doc.fontSize(12).font('Helvetica-Bold').text('DATOS DEL CONSUMIDOR:');
        doc.fontSize(10).font('Helvetica');
        doc.text(`Nombre Completo: ${complaint.consumerFullName}`);
        doc.text(`Documento: ${complaint.consumerDocumentType} ${complaint.consumerDocumentNumber}`);
        doc.text(`Domicilio: ${complaint.consumerAddress}`);
        doc.text(`Teléfono: ${complaint.consumerPhone}`);
        doc.text(`Email: ${complaint.consumerEmail}`);
        doc.moveDown();

        // Product/Service information
        if (complaint.productServiceName) {
          doc.fontSize(12).font('Helvetica-Bold').text('PRODUCTO/SERVICIO:');
          doc.fontSize(10).font('Helvetica');
          doc.text(`Nombre: ${complaint.productServiceName}`);
          if (complaint.purchaseAmount) {
            doc.text(`Monto: S/ ${complaint.purchaseAmount}`);
          }
          if (complaint.receiptNumber) {
            doc.text(`Comprobante: ${complaint.receiptNumber}`);
          }
          doc.moveDown();
        }

        // Complaint detail
        doc.fontSize(12).font('Helvetica-Bold').text('DETALLE DE LA RECLAMACIÓN:');
        doc.fontSize(10).font('Helvetica');
        doc.text(complaint.complaintDetail, { width: 500 });
        doc.moveDown();

        // Legal notice
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.rect(50, doc.y, 500, 60).stroke();
        doc.text('IMPORTANTE: La presentación de esta hoja de reclamación no limita otras vías de solución, ' +
                 'ni constituye condición previa para denunciar ante las autoridades competentes. ' +
                 'El proveedor deberá dar respuesta en un plazo no mayor a 15 días hábiles, ' +
                 'pudiendo extenderse hasta 30 días en casos debidamente justificados.', 
                 60, doc.y + 10, { width: 480 });

        // Footer
        doc.fontSize(8).font('Helvetica').text(
          `Generado automáticamente por LibroVirtual.pe el ${new Date().toLocaleString('es-PE')}`,
          { align: 'center' }
        );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateComplaintNotice(business: Business): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Title with required font size (minimum 1x1 cm)
        doc.fontSize(28).font('Helvetica-Bold').text('LIBRO DE RECLAMACIONES', { align: 'center' });
        doc.moveDown(2);

        // Rest of text with minimum 0.5x0.5 cm
        doc.fontSize(14).font('Helvetica');
        
        doc.text('Conforme a lo establecido en el Código de Protección y Defensa del Consumidor ' +
                'este establecimiento cuenta con un Libro de Reclamaciones a disposición del consumidor.');
        doc.moveDown();

        doc.text('El consumidor puede formular su reclamo o queja y solicitar el Libro de Reclamaciones:');
        doc.moveDown();

        // Checkbox style options
        doc.text('☐ Físico', { continued: true });
        doc.text('     ☐ Virtual');
        doc.moveDown(2);

        doc.text('También puede acceder al libro de reclamaciones virtual de este proveedor ' +
                'ingresando a la siguiente dirección electrónica:');
        doc.moveDown();

        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`librovirtual.pe/r/${business.ruc}`, { align: 'center' });
        doc.moveDown(2);

        doc.fontSize(14).font('Helvetica');
        doc.text('La formulación de la reclamación no limita el ejercicio de otras vías de solución, ' +
                'ni es requisito previo para denunciar ante las autoridades competentes.');
        doc.moveDown(2);

        doc.text('Para consultas de carácter general puede dirigirse a nuestro portal institucional: ' +
                'www.consumidor.gob.pe o comunicarse a nuestro Teléfono de consultas: 224-7777 ' +
                'o al correo electrónico: sacreclamo@indecopi.gob.pe');

        // Business information box
        doc.moveDown(2);
        doc.rect(50, doc.y, 500, 100).stroke();
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('DATOS DEL PROVEEDOR:', 60, doc.y + 10);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Razón Social: ${business.businessName}`, 60, doc.y + 30);
        doc.text(`RUC: ${business.ruc}`, 60, doc.y + 45);
        doc.text(`Dirección: ${business.address}`, 60, doc.y + 60);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateComplaintReport(
    complaints: Complaint[], 
    business: Business, 
    filters: any
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Header
        doc.fontSize(16).font('Helvetica-Bold').text('REPORTE DE RECLAMACIONES', { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12).font('Helvetica');
        doc.text(`Empresa: ${business.businessName}`);
        doc.text(`RUC: ${business.ruc}`);
        doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString('es-PE')}`);
        doc.text(`Total de Reclamaciones: ${complaints.length}`);
        doc.moveDown(2);

        // Table header
        const tableTop = doc.y;
        const rowHeight = 25;
        
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('N° Correlativo', 50, tableTop, { width: 80 });
        doc.text('Tipo', 130, tableTop, { width: 60 });
        doc.text('Fecha', 190, tableTop, { width: 70 });
        doc.text('Consumidor', 260, tableTop, { width: 120 });
        doc.text('Estado', 380, tableTop, { width: 80 });
        doc.text('Días Rest.', 460, tableTop, { width: 60 });

        // Line under header
        doc.moveTo(50, tableTop + 15).lineTo(520, tableTop + 15).stroke();

        // Table rows
        doc.font('Helvetica');
        complaints.slice(0, 25).forEach((complaint, index) => { // Limit to 25 for space
          const y = tableTop + 20 + (index * rowHeight);
          
          doc.text(complaint.correlativeNumber, 50, y, { width: 80 });
          doc.text(complaint.complaintType === 'reclamo' ? 'Reclamo' : 'Queja', 130, y, { width: 60 });
          doc.text(new Date(complaint.submissionDate).toLocaleDateString('es-PE'), 190, y, { width: 70 });
          doc.text(complaint.consumerFullName.substring(0, 20) + '...', 260, y, { width: 120 });
          doc.text(complaint.status, 380, y, { width: 80 });
          
          const remainingDays = Math.max(0, Math.ceil((new Date(complaint.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
          doc.text(remainingDays.toString(), 460, y, { width: 60 });
        });

        if (complaints.length > 25) {
          doc.moveDown().text(`... y ${complaints.length - 25} reclamaciones adicionales`, { align: 'center' });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const pdfService = new PDFService();
