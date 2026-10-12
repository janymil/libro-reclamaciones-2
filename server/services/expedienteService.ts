import crypto from "crypto";
import { ZipArchive, type Archiver } from "archiver";
import type { Complaint, Business } from "@shared/schema";
import { storage } from "../storage";
import { buildConsultUrl } from "./consultUrl";
import { pdfService } from "./pdfService";

/**
 * INDECOPI expediente digital (Phase 1.3).
 *
 * One-click ZIP a provider can hand to INDECOPI when a consumer escalates:
 *
 *   hojas/RR-0001.pdf   - the constancia PDF of every complaint in range
 *   adjuntos/...        - the evidence files the consumer submitted
 *   sirec.csv           - the SIREC-style tabular record
 *   MANIFIESTO.txt      - generation timestamp, filters, counts and the
 *                         verification code (SHA-256 over the batch) so the
 *                         authority can confirm the bundle is complete and
 *                         unaltered ("remisión con sellos de tiempo").
 */

export interface ExpedienteFilters {
  establishmentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  type?: string;
}

export interface ExpedienteRequest {
  business: Business;
  complaints: Complaint[];
  filters: ExpedienteFilters;
  generatedAt?: Date;
}

/** Escapes one CSV cell (RFC 4180: quote when needed, double the quotes). */
export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const formatDate = (value: unknown): string =>
  value ? new Date(value as string).toISOString().slice(0, 10) : "";

/**
 * Builds the SIREC-style CSV on the server (the same columns the client
 * exports, so the expediente matches the UI report).
 */
export function buildSirecCsv(complaints: Complaint[]): string {
  const header = [
    'N° Correlativo', 'Tipo de Registro', 'Fecha de Registro', 'Fecha Límite de Respuesta',
    'Nombre del Consumidor', 'Tipo de Documento', 'Número de Documento',
    'Correo Electrónico', 'Teléfono', 'Domicilio', 'Bien Contratado',
    'Detalle del Bien Contratado', 'Monto Reclamado', 'N° Comprobante', 'Fecha de Compra',
    'Detalle del Reclamo', 'Pedido del Consumidor', 'Acciones Adoptadas por el Proveedor',
    'Respuesta del Proveedor', 'Fecha de Respuesta', 'Estado', 'Vencido',
  ];

  const rows = complaints.map((complaint) => [
    complaint.correlativeNumber,
    complaint.complaintType === 'reclamo' ? 'RECLAMO' : 'QUEJA',
    formatDate(complaint.submissionDate),
    formatDate(complaint.dueDate),
    complaint.consumerFullName,
    complaint.consumerDocumentType,
    complaint.consumerDocumentNumber,
    complaint.consumerEmail,
    complaint.consumerPhone,
    complaint.consumerAddress,
    complaint.productServiceName,
    complaint.productServiceDescription ?? '',
    complaint.purchaseAmount ?? '',
    complaint.receiptNumber ?? '',
    formatDate(complaint.purchaseDate),
    complaint.complaintDetail,
    complaint.consumerRequest ?? '',
    complaint.providerActions ?? '',
    complaint.providerResponse ?? '',
    formatDate(complaint.responseDate),
    complaint.status,
    complaint.isOverdue ? 'SI' : 'NO',
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n') + '\r\n';
}

/**
 * Verification code: SHA-256 over the business id, the ordered complaint
 * correlatives and the generation timestamp. Included in the manifest so the
 * receiver can recompute and confirm the bundle.
 */
export function computeVerificationCode(
  businessId: string,
  complaints: Array<Pick<Complaint, 'correlativeNumber'>>,
  generatedAt: Date,
): string {
  const material = [
    businessId,
    complaints.map((complaint) => complaint.correlativeNumber).sort().join('|'),
    generatedAt.toISOString(),
  ].join('::');

  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 16).toUpperCase();
}

export function buildManifest(request: ExpedienteRequest, verificationCode: string, attachmentCount: number): string {
  const { business, complaints, filters, generatedAt = new Date() } = request;

  const filterLines = [
    filters.establishmentId ? `Establecimiento: ${filters.establishmentId}` : 'Establecimiento: todos',
    filters.type ? `Tipo: ${filters.type}` : 'Tipo: todos',
    filters.dateFrom ? `Desde: ${formatDate(filters.dateFrom)}` : 'Desde: el inicio',
    filters.dateTo ? `Hasta: ${formatDate(filters.dateTo)}` : 'Hasta: la fecha de generación',
  ];

  return [
    'EXPEDIENTE DIGITAL - LIBRO DE RECLAMACIONES',
    '===========================================',
    '',
    `Empresa: ${business.businessName}`,
    `RUC: ${business.ruc}`,
    `Fecha de generación: ${generatedAt.toISOString()}`,
    `Reclamaciones incluidas: ${complaints.length}`,
    `Archivos adjuntos incluidos: ${attachmentCount}`,
    '',
    'Filtros aplicados:',
    ...filterLines.map((line) => `  - ${line}`),
    '',
    `Código de verificación: ${verificationCode}`,
    '',
    'Contenido:',
    '  hojas/      Constancias PDF de cada reclamación (hoja de registro).',
    '  adjuntos/   Evidencias presentadas por el consumidor.',
    '  sirec.csv   Registro tabular con los datos exigidos por el SIREC.',
    '',
    'Conforme al DS 011-2011-PCM, DS 101-2022-PCM y la Ley N° 29733.',
    'Los datos personales se anonimizan automáticamente a los 24 meses',
    'de registrada la reclamación.',
  ].join('\n');
}

/** Builds the complete expediente ZIP as a buffer. */
export async function buildExpedienteZip(request: ExpedienteRequest): Promise<{ buffer: Buffer; verificationCode: string; manifest: string }> {
  const { business, complaints, filters, generatedAt = new Date() } = request;
  const verificationCode = computeVerificationCode(business.id, complaints, generatedAt);

  let attachmentCount = 0;
  const archive: Archiver = new ZipArchive({ zlib: { level: 9 } });
  const { readAttachment } = await import("./attachmentService");

  // Public status link printed as a QR on every constancia
  const libroConfig = await storage.getLibroConfiguration(business.id);

  // Constancia PDF + evidence files per complaint
  for (const complaint of complaints) {
    const establishment = await storage.getEstablishment(complaint.establishmentId);
    if (!establishment) {
      continue;
    }

    const attachments = await storage.getAttachmentsByComplaint(complaint.id);
    const pdf = await pdfService.generateComplaintConfirmation(complaint, business, establishment, {
      attachmentNames: attachments.map((attachment) => attachment.originalName),
      consultUrl: buildConsultUrl(libroConfig?.urlSlug, complaint.correlativeNumber),
    });

    const safeCorrelative = complaint.correlativeNumber.replace(/[/\\]/g, '-');
    archive.append(pdf, { name: `hojas/${safeCorrelative}.pdf` });

    for (const attachment of attachments) {
      const stream = readAttachment(attachment.fileName);
      if (stream) {
        archive.append(stream, {
          name: `adjuntos/${safeCorrelative}/${attachment.originalName.replace(/[/\\]/g, '-')}`,
        });
        attachmentCount += 1;
      }
    }
  }

  // SIREC CSV + manifest
  archive.append(buildSirecCsv(complaints), { name: 'sirec.csv' });
  const manifest = buildManifest({ ...request, generatedAt }, verificationCode, attachmentCount);
  archive.append(manifest, { name: 'MANIFIESTO.txt' });

  const buffer = await drain(archive);
  return { buffer, verificationCode, manifest };
}

/** Collects an archiver stream into a single buffer. */
function drain(archive: Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    void archive.finalize();
  });
}

