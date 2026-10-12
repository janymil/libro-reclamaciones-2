/**
 * Export helpers for the SIREC-style complaints report.
 *
 * Peruvian providers must be able to hand over the record of every complaint
 * they received (consumer identification, the contracted good/service, the
 * claim, the provider's reply and the legal deadlines) to the authorities.
 * The CSV produced here uses those standard columns.
 */

import { downloadCsv, todayStamp } from "./export";
import type { Complaint } from "@shared/schema";

const formatDate = (value: unknown): string =>
  value ? new Date(value as string).toLocaleDateString('es-PE') : "";

export function buildSirecRows(complaints: Complaint[]): Array<Record<string, unknown>> {
  return complaints.map((complaint) => ({
    'N° Correlativo': complaint.correlativeNumber,
    'Tipo de Registro': complaint.complaintType === 'reclamo' ? 'RECLAMO' : 'QUEJA',
    'Fecha de Registro': formatDate(complaint.submissionDate),
    'Fecha Límite de Respuesta': formatDate(complaint.dueDate),
    'Nombre del Consumidor': complaint.consumerFullName,
    'Tipo de Documento': complaint.consumerDocumentType,
    'Número de Documento': complaint.consumerDocumentNumber,
    'Correo Electrónico': complaint.consumerEmail,
    'Teléfono': complaint.consumerPhone,
    'Domicilio': complaint.consumerAddress,
    'Bien Contratado': complaint.productServiceName,
    'Detalle del Bien Contratado': complaint.productServiceDescription ?? '',
    'Monto Reclamado': complaint.purchaseAmount ?? '',
    'N° Comprobante': complaint.receiptNumber ?? '',
    'Fecha de Compra': formatDate(complaint.purchaseDate),
    'Detalle del Reclamo': complaint.complaintDetail,
    'Pedido del Consumidor': complaint.consumerRequest ?? '',
    'Acciones Adoptadas por el Proveedor': complaint.providerActions ?? '',
    'Respuesta del Proveedor': complaint.providerResponse ?? '',
    'Fecha de Respuesta': formatDate(complaint.responseDate),
    'Estado': complaint.status,
    'Vencido': complaint.isOverdue ? 'SI' : 'NO',
  }));
}

/** Downloads the SIREC-style report as a CSV that opens directly in Excel. */
export function downloadSirecReport(complaints: Complaint[]): string {
  const filename = `reporte-sirec-${todayStamp()}`;
  downloadCsv(filename, buildSirecRows(complaints));
  return filename;
}
