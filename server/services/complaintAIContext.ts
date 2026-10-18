import type { Complaint } from "@shared/schema";
import { formatCalendarDate } from "@shared/peru-time";

/**
 * Metadata of a stored complaint, for an AI prompt.
 *
 * The server loads the complaint by id (tenant-scoped) instead of trusting
 * whatever the client sent, so the model always reasons about the real record -
 * including facts the textarea does not carry (status, priority, correlative,
 * submission date).
 *
 * Deliberately excludes the consumer's contact data (document number, email,
 * phone, address): the model never needs it, and sending PII to a third-party
 * provider is a Ley 29733 risk.
 */

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  in_progress: "En proceso",
  responded: "Respondido",
  resolved: "Resuelto",
  overdue: "Vencido",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const TYPE_LABELS: Record<string, string> = {
  reclamo: "Reclamo",
  queja: "Queja",
};

export function renderComplaintAIContext(complaint: Complaint): string {
  const lines = [
    `[Ficha del reclamo registrado]`,
    `N° correlativo: ${complaint.correlativeNumber}`,
    `Tipo: ${TYPE_LABELS[complaint.complaintType] ?? complaint.complaintType}`,
    `Estado: ${STATUS_LABELS[complaint.status] ?? complaint.status}`,
    `Prioridad: ${PRIORITY_LABELS[complaint.priority] ?? complaint.priority}`,
    `Fecha de presentación: ${formatCalendarDate(new Date(complaint.submissionDate))}`,
    `Producto/servicio: ${complaint.productServiceName}`,
  ];

  if (complaint.consumerRequest?.trim()) {
    lines.push(`Pedido del consumidor: ${complaint.consumerRequest.trim()}`);
  }

  return lines.join("\n");
}
