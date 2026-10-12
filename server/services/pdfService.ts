import PDFDocument from 'pdfkit';
import type { Complaint, Business, Establishment } from '@shared/schema';

export interface ComplianceReportData {
  ds011Status: boolean;
  ds101Status: boolean;
  ley29733Status: boolean;
  nextActions: string[];
  overdueItems: Array<{
    complianceType: string;
    status: string;
    dueDate?: Date | string | null;
  }>;
}

export interface RnpdActivity {
  activityName: string;
  purpose: string;
  dataCategories: unknown;
  dataSubjects: unknown;
  legalBasis: string;
  retentionPeriod: string;
  securityMeasures?: unknown;
}

/** Joins a jsonb array (or string) column into a readable, comma separated list. */
function toList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ') || 'No especificado';
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return 'No especificado';
}

class PDFService {
  /**
   * Shared boilerplate for the newer documents: collects the emitted chunks and
   * resolves with the final buffer, rejecting on any rendering error.
   */
  private render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        build(doc);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

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
        doc.text(`librovirtual.pe/${business.ruc}`, { align: 'center' });
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

  /**
   * Compliance report PDF summarising the three legal pillars tracked by the
   * platform (DS 011-2011-PCM, DS 101-2022-PCM, Ley 29733).
   */
  async generateComplianceReportPdf(report: ComplianceReportData, business: Business): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(16).font('Helvetica-Bold').text('REPORTE DE CUMPLIMIENTO LEGAL', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Empresa: ${business.businessName}`);
      doc.text(`RUC: ${business.ruc}`);
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PE')}`);
      doc.moveDown(1.5);

      const compliant = [report.ds011Status, report.ds101Status, report.ley29733Status].filter(Boolean).length;
      doc.fontSize(12).font('Helvetica-Bold').text(`Cumplimiento general: ${Math.round((compliant / 3) * 100)}%`);
      doc.moveDown();

      const rows: Array<[string, boolean, string]> = [
        ['DS 011-2011-PCM — Reglamento del Libro de Reclamaciones', report.ds011Status, 'Libro de Reclamaciones habilitado y publicado'],
        ['DS 101-2022-PCM — Plazo de 15 días hábiles', report.ds101Status, 'Respuestas a reclamos dentro del plazo legal'],
        ['Ley 29733 — Protección de Datos Personales', report.ley29733Status, 'Tratamiento de datos conforme a la normativa'],
      ];

      for (const [label, ok, description] of rows) {
        doc.fontSize(11).font('Helvetica-Bold').text(`${ok ? '[X]' : '[ ]'} ${label}`);
        doc.fontSize(9).font('Helvetica').fillColor('#555555').text(description);
        doc.fillColor('black');
        doc.moveDown(0.5);
      }

      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text('ACCIONES RECOMENDADAS:');
      doc.fontSize(10).font('Helvetica');
      if (report.nextActions.length === 0) {
        doc.text('Sin acciones pendientes.');
      } else {
        for (const action of report.nextActions) {
          doc.text(`- ${action}`);
        }
      }

      if (report.overdueItems.length > 0) {
        doc.moveDown();
        doc.fontSize(12).font('Helvetica-Bold').text('ELEMENTOS VENCIDOS:');
        doc.fontSize(10).font('Helvetica');
        for (const item of report.overdueItems) {
          doc.text(`- ${item.complianceType} (${item.status})`);
        }
      }

      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica-Oblique').text(
        `Documento generado automáticamente por LibroVirtual.pe el ${new Date().toLocaleString('es-PE')}`,
        { align: 'center' },
      );
    });
  }

  /**
   * Privacy policy draft compliant with Ley 29733 and its Reglamento DS 016-2024-JUS.
   */
  async generatePrivacyPolicy(business: Business): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(16).font('Helvetica-Bold').text('POLÍTICA DE PRIVACIDAD', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Proveedor: ${business.businessName}`);
      doc.text(`RUC: ${business.ruc}`);
      doc.text(`Domicilio: ${business.address}, ${business.distrito}, ${business.provincia}, ${business.departamento}`);
      doc.moveDown(1.5);

      const sections: Array<[string, string]> = [
        [
          '1. Marco normativo',
          'La presente política se elabora conforme a la Ley N° 29733, Ley de Protección de Datos Personales, ' +
            'y su Reglamento aprobado por DS N° 016-2024-JUS, vigente desde el 30 de marzo de 2025.',
        ],
        [
          '2. Finalidad del tratamiento',
          'Los datos personales consignados en el Libro de Reclamaciones son tratados con la única finalidad de ' +
            'atender y dar respuesta a los reclamos y quejas formulados por los consumidores.',
        ],
        [
          '3. Datos recopilados',
          'Nombres y apellidos, tipo y número de documento de identidad, domicilio, teléfono, correo electrónico ' +
            'y la información referida al bien o servicio contratado.',
        ],
        [
          '4. Consentimiento',
          'El titular otorga su consentimiento libre, previo, expreso e informado para el tratamiento de sus datos ' +
            'al momento de registrar la reclamación, salvo en los supuestos de excepción previstos por ley.',
        ],
        [
          '5. Plazo de conservación',
          'Los datos se conservan durante el plazo legal requerido para la atención de reclamos y las obligaciones ' +
            'de fiscalización posteriores, tras lo cual son eliminados o anonimizados.',
        ],
        [
          '6. Derechos ARCO',
          'El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición (ARCO) ' +
            'escribiendo al correo electrónico de contacto del proveedor.',
        ],
        [
          '7. Seguridad',
          'Se adoptan medidas técnicas y organizativas razonables para resguardar la confidencialidad, integridad ' +
            'y disponibilidad de los datos personales.',
        ],
        [
          '8. Transferencias',
          'No se realizan transferencias de datos personales a terceros salvo obligación legal o autorización ' +
            'expresa del titular.',
        ],
      ];

      for (const [title, body] of sections) {
        doc.fontSize(11).font('Helvetica-Bold').text(title);
        doc.fontSize(10).font('Helvetica').text(body, { align: 'justify' });
        doc.moveDown();
      }

      doc.moveDown();
      doc.fontSize(8).font('Helvetica-Oblique').text(
        `Documento generado automáticamente por LibroVirtual.pe el ${new Date().toLocaleString('es-PE')}`,
        { align: 'center' },
      );
    });
  }

  /**
   * Registro de Actividades de Tratamiento, required for the RNPD registration.
   */
  async generateRnpdRegister(activities: RnpdActivity[], business: Business): Promise<Buffer> {
    return this.render((doc) => {
      doc.fontSize(16).font('Helvetica-Bold').text('REGISTRO DE ACTIVIDADES DE TRATAMIENTO', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica').text(`Titular del banco de datos: ${business.businessName}`);
      doc.text(`RUC: ${business.ruc}`);
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PE')}`);
      doc.moveDown(1.5);

      if (activities.length === 0) {
        doc.fontSize(11).font('Helvetica').text(
          'Aún no se han registrado actividades de tratamiento. Use el asistente RNPD para incorporarlas.',
        );
      }

      activities.forEach((activity, index) => {
        doc.fontSize(12).font('Helvetica-Bold').text(`${index + 1}. ${activity.activityName}`);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Finalidad: ${activity.purpose}`);
        doc.text(`Base legal: ${activity.legalBasis}`);
        doc.text(`Categorías de datos: ${toList(activity.dataCategories)}`);
        doc.text(`Titulares: ${toList(activity.dataSubjects)}`);
        doc.text(`Plazo de conservación: ${activity.retentionPeriod}`);
        doc.text(`Medidas de seguridad: ${toList(activity.securityMeasures)}`);
        doc.moveDown();
      });

      doc.moveDown();
      doc.fontSize(8).font('Helvetica-Oblique').text(
        `Documento generado automáticamente por LibroVirtual.pe el ${new Date().toLocaleString('es-PE')}`,
        { align: 'center' },
      );
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
