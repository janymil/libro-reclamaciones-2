/**
 * Comprobantes de pago electrónicos (Perú) — the domain vocabulary.
 *
 * Phase 1 of the invoicing plan is deliberately MANUAL: every confirmed payment
 * creates a "comprobante pendiente" with the data captured at checkout, an
 * operator issues it in SUNAT's own tool and uploads the PDF/XML here. This
 * module is the single source of truth for the labels, the SUNAT codes, the
 * validation and the text the operator copies into SUNAT, so the checkout, the
 * console and the customer's page cannot disagree about what a factura is.
 *
 * Pure by design: no I/O, no framework. Unit-tested in
 * `shared/comprobantes.test.ts`.
 */

import { formatIgvRate } from "./tax";

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

export type ComprobanteDocType = "factura" | "boleta";

export interface ComprobanteDocTypeInfo {
  id: ComprobanteDocType;
  /** SUNAT catalog 01 code: 01 = Factura, 03 = Boleta de venta. */
  code: "01" | "03";
  /** SUNAT catalog 06 code for the buyer's document: 6 = RUC, 1 = DNI. */
  customerDocTypeCode: "6" | "1" | "0";
  label: string;
  shortLabel: string;
  /** Default serie; the last three characters are the establishment. */
  defaultSerie: string;
  /** A factura can only be issued to a RUC. */
  requiresRuc: boolean;
  /** One line of help shown at checkout. */
  hint: string;
}

export const COMPROBANTE_DOC_TYPES: Record<ComprobanteDocType, ComprobanteDocTypeInfo> = {
  factura: {
    id: "factura",
    code: "01",
    customerDocTypeCode: "6",
    label: "Factura electrónica",
    shortLabel: "Factura",
    defaultSerie: "F001",
    requiresRuc: true,
    hint: "Para empresas. Necesita RUC y razón social; permite sustentar gasto y crédito fiscal.",
  },
  boleta: {
    id: "boleta",
    code: "03",
    customerDocTypeCode: "1",
    label: "Boleta de venta electrónica",
    shortLabel: "Boleta",
    defaultSerie: "B001",
    requiresRuc: false,
    hint: "Para personas naturales. El DNI es opcional; si no lo indica se emite a consumidor final.",
  },
};

export function isComprobanteDocType(value: unknown): value is ComprobanteDocType {
  return value === "factura" || value === "boleta";
}

/** Falls back to a factura: the platform sells to businesses. */
export function getComprobanteDocType(value: unknown): ComprobanteDocTypeInfo {
  return isComprobanteDocType(value) ? COMPROBANTE_DOC_TYPES[value] : COMPROBANTE_DOC_TYPES.factura;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type ComprobanteStatus = "pendiente" | "emitido" | "anulado";

export const COMPROBANTE_STATUS_LABELS: Record<ComprobanteStatus, string> = {
  pendiente: "Pendiente de emisión",
  emitido: "Emitido",
  anulado: "Anulado (nota de crédito)",
};

export function isComprobanteStatus(value: unknown): value is ComprobanteStatus {
  return value === "pendiente" || value === "emitido" || value === "anulado";
}

// ---------------------------------------------------------------------------
// Billing data (who the comprobante is made out to)
// ---------------------------------------------------------------------------

export interface BillingData {
  docType: ComprobanteDocType;
  /** RUC (factura) or DNI (boleta). Empty string = consumidor final. */
  docNumber: string;
  /** Razón social (factura) or full name (boleta). */
  name: string;
  /** Fiscal address. Required on a factura. */
  address: string;
  /** Where the PDF/XML is delivered. Always required. */
  email: string;
}

export const EMPTY_BILLING: BillingData = {
  docType: "factura",
  docNumber: "",
  name: "",
  address: "",
  email: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Peruvian RUC checksum (módulo 11).
 *
 * Eleven digits, weights 5-4-3-2-7-6-5-4-3-2 over the first ten, and the check
 * digit is `11 - (sum % 11)`, with 10 -> 1 and 11 -> 0. Catching a typo here is
 * what stops a factura rejected by SUNAT after the customer already paid.
 */
export function isValidRuc(value: string): boolean {
  const ruc = (value ?? "").replace(/\D/g, "");
  if (ruc.length !== 11) {
    return false;
  }

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(ruc[index]) * weights[index];
  }

  const remainder = 11 - (sum % 11);
  const check = remainder === 11 ? 0 : remainder === 10 ? 1 : remainder;
  return check === Number(ruc[10]);
}

/** DNI: exactly eight digits (SUNAT catalog 06 code 1). */
export function isValidDni(value: string): boolean {
  return /^\d{8}$/.test((value ?? "").trim());
}

/**
 * Validation shared by the checkout and the API. Returns human messages in
 * Spanish, ready to show under the field.
 */
export function validateBilling(billing: BillingData): string[] {
  const errors: string[] = [];
  const doc = getComprobanteDocType(billing.docType);

  if (!billing.email.trim()) {
    errors.push("Indique el correo donde desea recibir el comprobante.");
  } else if (!EMAIL_PATTERN.test(billing.email.trim())) {
    errors.push("El correo del comprobante no es válido.");
  }

  if (doc.requiresRuc) {
    if (!isValidRuc(billing.docNumber)) {
      errors.push("El RUC de la factura no es válido (11 dígitos y dígito verificador).");
    }
    if (billing.name.trim().length < 2) {
      errors.push("Indique la razón social tal como figura en SUNAT.");
    }
    if (billing.address.trim().length < 5) {
      errors.push("Indique el domicilio fiscal de la empresa.");
    }
  } else if (billing.docNumber.trim() && !isValidDni(billing.docNumber)) {
    errors.push("El DNI debe tener 8 dígitos (déjelo vacío para consumidor final).");
  }

  return errors;
}

/**
 * Trims and normalizes untrusted billing input (HTTP body, browser state).
 * Never throws: the caller validates afterwards with `validateBilling`.
 */
export function normalizeBilling(raw: unknown, fallback?: Partial<BillingData>): BillingData {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown, maxLength: number): string =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";

  const docType = isComprobanteDocType(source.docType)
    ? source.docType
    : isComprobanteDocType(fallback?.docType)
      ? fallback.docType
      : "factura";

  return {
    docType,
    docNumber: text(source.docNumber, 20).replace(/[^\d]/g, ""),
    name: text(source.name, 200),
    address: text(source.address, 300),
    email: text(source.email, 255).toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/** SUNAT series: four alphanumeric characters, e.g. F001 / B001. */
export function normalizeSerie(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  return (raw || fallback).slice(0, 4);
}

export function isValidSerie(value: string): boolean {
  return /^[A-Z0-9]{4}$/.test(value);
}

/** The correlative is numeric and printed with eight digits: F001-00000001. */
export function normalizeComprobanteNumber(value: unknown): string {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : String(value ?? "");
  return digits.slice(0, 8);
}

export function isValidComprobanteNumber(value: string): boolean {
  const digits = normalizeComprobanteNumber(value);
  return digits.length >= 1 && Number(digits) > 0;
}

/** "F001-00000123" */
export function formatComprobanteNumber(serie: string, number: string): string {
  return `${serie}-${normalizeComprobanteNumber(number).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// Text: description, legal notes and the data sheet for SUNAT
// ---------------------------------------------------------------------------

/**
 * The line that goes in the comprobante's "descripción" field.
 * It names the service and the plan, which is what an accountant needs to
 * recognize the charge without opening the payment record.
 */
export function buildComprobanteDescription(input: {
  planName: string;
  period: string;
}): string {
  const periodLabel = input.period === "annual" ? "anual" : "mensual";
  return `Servicio de Libro de Reclamaciones virtual - Plan ${input.planName} (${periodLabel})`;
}

/** What the operator needs to know before issuing in SUNAT's tool. */
export const COMPROBANTE_LEGAL_NOTE =
  "Representación impresa de un comprobante de pago electrónico. El documento válido es el XML con la constancia de recepción (CDR) de SUNAT.";

export const COMPROBANTE_VERIFICATION_NOTE =
  "Puede verificar este comprobante en sunat.gob.pe con el RUC del emisor y el número de comprobante.";

/** What the customer is promised when the emission is manual. */
export const COMPROBANTE_ISSUE_DAYS = 3;

export const COMPROBANTE_ISSUE_NOTE = `Su comprobante electrónico se envía a su correo dentro de los ${COMPROBANTE_ISSUE_DAYS} días hábiles siguientes al pago.`;

export interface DataSheetInput {
  docType: ComprobanteDocType;
  /** Serie chosen by the operator; defaults to the document type's serie. */
  serie?: string;
  /** Buyer. */
  docNumber: string;
  name: string;
  address: string;
  email: string;
  description: string;
  /** ISO date (YYYY-MM-DD) or already formatted date. */
  issueDate: string;
  subtotalCents: number;
  igvCents: number;
  totalCents: number;
  rateBps: number;
  paymentReference: string;
  paymentMethodLabel: string;
  notes?: string | null;
}

const soles = (cents: number): string => `S/ ${(Math.round(cents) / 100).toFixed(2)}`;

/**
 * Copy-paste block for SUNAT's free "Facturador"/"Emisor electrónico".
 *
 * Phase 1 is manual, so the console shows exactly this text next to the form:
 * the operator never has to reconstruct an amount or a RUC from memory, which
 * is where manual invoicing usually goes wrong.
 */
export function formatDataSheet(input: DataSheetInput): string {
  const doc = getComprobanteDocType(input.docType);
  const serie = normalizeSerie(input.serie, doc.defaultSerie);
  const lines = [
    `Tipo: ${doc.label} (código ${doc.code})`,
    `Serie: ${serie}`,
    `Fecha de emisión: ${input.issueDate}`,
    `Documento del cliente: ${doc.requiresRuc ? "RUC" : "DNI"} ${input.docNumber || "(consumidor final)"}`,
    `Nombre / razón social: ${input.name || "Consumidor final"}`,
    `Domicilio: ${input.address || "-"}`,
    `Correo: ${input.email || "-"}`,
    `Descripción: ${input.description}`,
    `Valor de venta (sin IGV): ${soles(input.subtotalCents)}`,
    `IGV (${formatIgvRate(input.rateBps)}): ${soles(input.igvCents)}`,
    `Total: ${soles(input.totalCents)}`,
    `Moneda: PEN`,
    `Forma de pago: contado`,
    `Medio de pago: ${input.paymentMethodLabel}`,
    `Referencia de pago: ${input.paymentReference}`,
  ];

  if (input.notes?.trim()) {
    lines.push(`Nota: ${input.notes.trim()}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public projections
// ---------------------------------------------------------------------------

/** What a customer may see about their own comprobante (no operator notes). */
export interface PublicComprobante {
  id: string;
  paymentId: string;
  docType: ComprobanteDocType;
  docTypeLabel: string;
  status: ComprobanteStatus;
  statusLabel: string;
  serie: string | null;
  number: string | null;
  fullNumber: string | null;
  issueDate: string | null;
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  description: string;
  subtotalCents: number;
  igvCents: number;
  totalCents: number;
  rateBps: number;
  currency: string;
  hasPdf: boolean;
  hasXml: boolean;
  emailSentAt: string | null;
  createdAt: string;
}
