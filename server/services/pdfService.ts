import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Complaint, Business, Establishment } from '@shared/schema';
import type { ExecutiveReport } from './aiService';

export interface ComplianceReportData {
  standards: Array<{
    label: string;
    status: string;
    detail: string;
    action: string | null;
  }>;
  applicableStandards: number;
  compliantStandards: number;
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

/**
 * Alphabet without look-alike characters (0/O, 1/I/L) so a verification code can
 * be read aloud over the phone or copied by hand without ambiguity.
 */
const VERIFICATION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Short verification code for a single constancia (Phase: evidence trail).
 *
 * Deterministic on (business, complaint id, correlative) so the consumer, the
 * business and an INDECOPI inspector can recompute and confirm the same code
 * from the printed hoja alone.
 */
export function computeComplaintVerificationCode(
  businessId: string,
  complaint: Pick<Complaint, 'id' | 'correlativeNumber'>,
): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${businessId}|${complaint.id}|${complaint.correlativeNumber}`)
    .digest();

  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += VERIFICATION_ALPHABET[digest[i] % VERIFICATION_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
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
    establishment: Establishment,
    options?: { attachmentNames?: string[]; consultUrl?: string; logo?: Buffer | null },
  ): Promise<Buffer> {
    const verificationCode = computeComplaintVerificationCode(business.id, complaint);
    const consultUrl = options?.consultUrl;

    // QR to the public status page. Best effort: a QR failure must never block
    // the legal constancia from being issued.
    let qrBuffer: Buffer | null = null;
    if (consultUrl) {
      try {
        qrBuffer = await QRCode.toBuffer(consultUrl, { type: 'png', margin: 1, width: 160 });
      } catch (error) {
        console.error('No se pudo generar el QR de la constancia:', error);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Header: the business's own logo first, so the printed constancia is
        // recognizable as coming from the business. Best effort - a corrupt
        // image must never block a legal document from being issued.
        const logo = options?.logo;
        if (logo) {
          try {
            const boxWidth = 140;
            const boxHeight = 60;
            const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
            doc.image(logo, doc.page.margins.left + (usableWidth - boxWidth) / 2, doc.y, {
              fit: [boxWidth, boxHeight],
            });
            doc.y += boxHeight + 10;
          } catch (error) {
            console.error('No se pudo incluir el logo en la constancia:', error);
          }
        }

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

        // Evidence attachments submitted with the complaint (Phase 1.1)
        const attachmentNames = options?.attachmentNames ?? [];
        if (attachmentNames.length > 0) {
          doc.fontSize(12).font('Helvetica-Bold').text('ARCHIVOS ADJUNTOS:');
          doc.fontSize(10).font('Helvetica');
          attachmentNames.forEach((name) => doc.text(`- ${name}`));
          doc.moveDown();
        }

        // Legal notice. El plazo es improrrogable desde la Ley N.° 31435: no se
        // puede prometer una extensión de 30 días que el Código ya no permite.
        const noticeTop = doc.y;
        doc.rect(50, noticeTop, 500, 60).stroke();
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.text('IMPORTANTE: La formulación de esta queja o reclamo no limita otras vías de solución, ' +
                 'ni constituye vía previa necesaria para denunciar ante INDECOPI. ' +
                 'El proveedor debe responder por escrito en un plazo no mayor a 15 días hábiles ' +
                 'improrrogables (art. 152 del Código, modificado por la Ley N.° 31435).', 
                 60, noticeTop + 10, { width: 480 });
        doc.y = noticeTop + 70;

        // Verification block: code + QR to the public status page
        if (doc.y > 640) {
          doc.addPage();
        }
        const blockTop = doc.y;
        doc.rect(50, blockTop, 500, 86).stroke();
        doc.fontSize(9).font('Helvetica-Bold').text(
          'CÓDIGO DE VERIFICACIÓN',
          60,
          blockTop + 10,
          { width: 480 }
        );

        if (qrBuffer) {
          doc.image(qrBuffer, 60, blockTop + 26, { width: 52 });
          doc.fontSize(12).font('Helvetica-Bold').text(verificationCode, 128, blockTop + 30);
          if (consultUrl) {
            doc.fontSize(7.5).font('Helvetica').text(
              `Consulte el estado de esta reclamación en: ${consultUrl}`,
              128,
              blockTop + 50,
              { width: 408 }
            );
          }
        } else {
          doc.fontSize(12).font('Helvetica-Bold').text(verificationCode, 60, blockTop + 32);
          if (consultUrl) {
            doc.fontSize(7.5).font('Helvetica').text(
              `Consulte el estado de esta reclamación en: ${consultUrl}`,
              60,
              blockTop + 52,
              { width: 470 }
            );
          }
        }
        doc.y = blockTop + 96;

        // Footer
        if (doc.y > 740) {
          doc.addPage();
        }
        doc.fontSize(8).font('Helvetica').text(
          `Generado automáticamente por LibroDigital.pe el ${new Date().toLocaleString('es-PE')}`,
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

        // Título >= 1x1 cm (1 cm = 28.35 pt): 30 pt para no quedar al filo.
        doc.fontSize(30).font('Helvetica-Bold').text('LIBRO DE RECLAMACIONES', { align: 'center' });
        doc.moveDown(2);

        // Resto del texto >= 0.5x0.5 cm (0.5 cm = 14.17 pt): 15 pt.
        doc.fontSize(15).font('Helvetica');

        // Texto del aviso del Anexo II, literal del Reglamento: no se parafrasea.
        doc.text('Conforme a lo establecido en el Código de Protección y Defensa del Consumidor este ' +
                'establecimiento cuenta con un Libro de Reclamaciones a tu disposición. Solicítalo ' +
                'para registrar la queja o reclamo que tengas.');
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
        doc.text(`librodigital.pe/${business.ruc}`, { align: 'center' });
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
   * Print-ready blank "hoja de reclamación" with the fields of Anexo I of DS
   * 011-2011-PCM (formato vigente aprobado por el DS N.° 101-2022-PCM).
   *
   * No es el Anexo I oficial: es un formato de apoyo para transcribir el
   * reclamo cuando el libro es virtual. Por eso el PDF no se rotula como
   * "Anexo I" — el Anexo II del Reglamento es el aviso, no la hoja, y decir lo
   * contrario sería describir mal la norma. Título >= 1x1 cm y cuerpo >= 0.5x0.5
   * cm, las medidas que exige el Reglamento para el material impreso.
   */
  async generateAnexoRegistroForm(business: Business): Promise<Buffer> {
    return this.render((doc) => {
      // Title >= 1 cm high (29 pt) - regulation minimum
      doc.fontSize(29).font('Helvetica-Bold').text('HOJA DE RECLAMACIÓN', { align: 'center' });
      doc.fontSize(15).font('Helvetica').text('Campos del Anexo I · DS 011-2011-PCM', { align: 'center' });
      doc.moveDown(2);

      // Body >= 0.5 cm high (15 pt) - regulation minimum
      doc.fontSize(15).font('Helvetica-Bold').text('I. DATOS DEL PROVEEDOR');
      doc.fontSize(15).font('Helvetica');
      doc.text(`Razón Social / Nombre Comercial: ${business.businessName}`);
      doc.text(`RUC: ${business.ruc}`);
      doc.text(`Domicilio: ${business.address}`);
      doc.moveDown();

      doc.fontSize(15).font('Helvetica-Bold').text('II. DATOS DEL CONSUMIDOR');
      doc.fontSize(15).font('Helvetica');
      doc.text('Nombres y apellidos: ______________________________________');
      doc.text('DNI / CE / Pasaporte: ______________________________________');
      doc.text('Domicilio: ________________________________________________');
      doc.text('Teléfono: ______________  Correo: __________________________');
      doc.text('Padre/madre/tutor (si es menor de edad): ___________________');
      doc.moveDown();

      doc.fontSize(15).font('Helvetica-Bold').text('III. IDENTIFICACIÓN DEL BIEN O SERVICIO');
      doc.fontSize(15).font('Helvetica');
      doc.text('Producto / servicio: _______________________________________');
      doc.text('Monto: S/ ____________  Comprobante: _______________________');
      doc.moveDown();

      doc.fontSize(15).font('Helvetica-Bold').text('IV. TIPO DE RECLAMACIÓN');
      doc.fontSize(15).font('Helvetica');
      doc.text('☐ Reclamo   ☐ Queja');
      doc.moveDown();

      doc.fontSize(15).font('Helvetica-Bold').text('V. DETALLE DE LA RECLAMACIÓN Y PEDIDO');
      doc.fontSize(15).font('Helvetica');
      for (let i = 0; i < 8; i += 1) {
        doc.text('____________________________________________________________');
      }
      doc.moveDown();

      doc.fontSize(15).font('Helvetica-Bold').text('VI. OBSERVACIONES Y FIRMAS');
      doc.fontSize(15).font('Helvetica');
      doc.text('La presentación de esta hoja no limita otras vías de solución ni es');
      doc.text('condición previa para acudir a INDECOPI.');
      doc.moveDown(2);
      doc.text('Firma del consumidor: _______________________________________');
      doc.text('Fecha: _____ / _____ / __________');

      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica-Oblique').text(
        `Formato generado por LibroDigital.pe el ${new Date().toLocaleString('es-PE')} - ${business.businessName}`,
        { align: 'center' },
      );
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

      doc.fontSize(12).font('Helvetica-Bold').text(
        `Obligaciones cumplidas: ${report.compliantStandards} de ${report.applicableStandards} aplicables`,
      );
      if (report.applicableStandards < report.standards.length) {
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#555555')
          .text(
            'Las obligaciones sin datos (por ejemplo, el plazo de 15 días antes del primer reclamo) no se cuentan.',
          );
        doc.fillColor('black');
      }
      doc.moveDown();

      const statusLabel: Record<string, string> = {
        compliant: 'Conforme',
        pending: 'Pendiente',
        overdue: 'Incumplido',
        not_applicable: 'Sin datos',
      };

      for (const standard of report.standards) {
        const mark =
          standard.status === 'compliant' ? '[X]' : standard.status === 'not_applicable' ? '[-]' : '[ ]';
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(`${mark} ${standard.label} — ${statusLabel[standard.status] ?? standard.status}`);
        doc.fontSize(9).font('Helvetica').fillColor('#555555').text(standard.detail);
        if (standard.action) {
          doc.text(`Acción: ${standard.action}`);
        }
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
        `Documento generado automáticamente por LibroDigital.pe el ${new Date().toLocaleString('es-PE')}`,
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
          'Los datos personales de cada reclamación se conservan durante 24 meses desde su registro, ' +
            'plazo durante el cual el Libro de Reclamaciones debe permanecer a disposición de la autoridad ' +
            'de consumo. Cumplido el plazo, los datos personales son anonimizados automáticamente y los ' +
            'archivos adjuntos eliminados, conservándose únicamente los datos agregados exigidos por la normativa.',
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
        `Documento generado automáticamente por LibroDigital.pe el ${new Date().toLocaleString('es-PE')}`,
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
          'Aún no se han registrado actividades de tratamiento. Confírmalas en Cumplimiento → Registro de actividades de tratamiento.',
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
        `Documento generado automáticamente por LibroDigital.pe el ${new Date().toLocaleString('es-PE')}`,
        { align: 'center' },
      );
    });
  }

  async generateComplaintReport(
    complaints: Complaint[], 
    business: Business, 
    _filters: any
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

  /**
   * Monthly executive report (AI). A one-page manager brief generated from
   * aggregates, so it can be e-mailed as an attachment and kept as evidence of
   * the monthly review. The AI disclaimer is printed at the bottom.
   */
  async generateExecutiveReportPdf(
    report: ExecutiveReport,
    business: Business,
    periodLabel: string,
    start: Date,
    end: Date,
  ): Promise<Buffer> {
    return this.render((doc) => {
      const range = `${start.toLocaleDateString('es-PE')} — ${new Date(end.getTime() - 1).toLocaleDateString('es-PE')}`;

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#1b1611').text('Reporte Ejecutivo');
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#5c5246');
      doc.text(`${business.businessName} · RUC ${business.ruc}`);
      doc.text(`Periodo: ${periodLabel} (${range})`);
      doc.moveDown(0.8);

      doc.fillColor('#1b1611').fontSize(14).font('Helvetica-Bold').text(report.headline);
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica').fillColor('#333333').text(report.summary, { align: 'justify' });

      const section = (title: string, items: string[]) => {
        if (items.length === 0) return;
        doc.moveDown(0.8);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e6b4a').text(title);
        doc.fillColor('#333333').fontSize(10).font('Helvetica');
        for (const item of items) {
          doc.text(`• ${item}`, { indent: 10 });
        }
      };

      section('Hallazgos', report.highlights);
      section('Riesgos', report.risks);
      section('Acciones recomendadas', report.actions);
      section('Indicadores', report.kpiNotes);

      doc.moveDown(1.5);
      doc
        .fontSize(8)
        .fillColor('#777777')
        .text(
          'Reporte generado con asistencia de IA a partir de los datos del Libro de Reclamaciones. ' +
            'Es una herramienta de apoyo: revise las cifras y las recomendaciones antes de tomar decisiones.',
          { align: 'center' },
        );
    });
  }
}

export const pdfService = new PDFService();
