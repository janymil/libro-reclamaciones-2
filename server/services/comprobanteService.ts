import fs from "fs";

import {
  COMPROBANTE_DOC_TYPES,
  buildComprobanteDescription,
  formatComprobanteNumber,
  getComprobanteDocType,
  isComprobanteDocType,
  isValidComprobanteNumber,
  isValidSerie,
  normalizeComprobanteNumber,
  normalizeSerie,
  type BillingData,
  type PublicComprobante,
} from "@shared/comprobantes";
import { PAYMENT_METHODS, isPaymentMethodId } from "@shared/payments";
import { getPlan } from "@shared/plans";
import type { Business, Comprobante, Payment } from "@shared/schema";
import { igvBreakdown } from "@shared/tax";

import { storage } from "../storage";
import { deleteComprobanteFile, resolveComprobantePath } from "./comprobanteFileService";
import { emailService } from "./emailService";
import { getIdentity } from "./platformSettingsService";

/**
 * Comprobantes — Phase 1 (manual emission).
 *
 * The flow this implements, end to end:
 *
 *   payment becomes `paid`
 *     -> `ensureComprobanteForPayment` creates a `pendiente` row with the buyer
 *        snapshot and the IGV breakdown (idempotent: a retried webhook reuses it)
 *     -> an operator issues it in SUNAT's own tool, using the data sheet printed
 *        in the console
 *     -> `markComprobanteEmitted` records serie/correlativo + the PDF/XML
 *     -> `sendComprobanteToCustomer` mails them and stamps `emailSentAt`
 *     -> a refund leads to `voidComprobante` (the operator issues the nota de
 *        crédito in SUNAT; this app records it)
 *
 * Nothing here talks to SUNAT: that is Phase 2, and it will fill the same rows.
 */

/** "Av. Lima 123, Miraflores, Lima, Lima" — the fiscal address as one line. */
function composeAddress(business: Business): string {
  return [business.address, business.distrito, business.provincia, business.departamento]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** The "medio de pago" line required on sales over S/ 2,000 (Ley 28194). */
export function paymentMethodLabel(payment: Payment): string {
  if (payment.method && isPaymentMethodId(payment.method)) {
    return PAYMENT_METHODS[payment.method].name;
  }
  return payment.provider === "manual"
    ? "Transferencia o depósito bancario"
    : "Tarjeta de crédito o débito";
}

/** Who receives the comprobante when the payment has no billing snapshot. */
async function resolveOwnerEmail(payment: Payment, business: Business): Promise<string> {
  if (payment.userId) {
    const user = await storage.getUser(payment.userId);
    if (user?.email) {
      return user.email;
    }
  }

  const users = await storage.getUsersByBusinessIds([business.id]);
  const owner = users.find((user) => user.role === "admin" && user.isActive) ?? users[0];
  return owner?.email ?? "";
}

/**
 * The buyer snapshot for a payment: what was captured at checkout, falling back
 * to the company profile for payments that predate this feature (or that were
 * registered by an operator without a checkout).
 */
export function resolveBillingForPayment(
  payment: Payment,
  business: Business,
  ownerEmail: string,
): BillingData {
  const docType = isComprobanteDocType(payment.billingDocType)
    ? payment.billingDocType
    : isComprobanteDocType(business.billingDocType)
      ? business.billingDocType
      : "factura";

  const docNumber =
    payment.billingDocNumber ??
    (docType === "factura" ? business.ruc : business.billingDni ?? "");

  // A factura is made out to the company, so the profile is the right fallback.
  // A boleta is made out to a person: inheriting the company's razón social or
  // fiscal address would print the wrong buyer on the document.
  const fallbackName = docType === "factura" ? business.businessName : "";
  const fallbackAddress = docType === "factura" ? composeAddress(business) : "";

  return {
    docType,
    docNumber: (docNumber ?? "").trim(),
    name: (payment.billingName ?? fallbackName ?? "").trim(),
    address: (payment.billingAddress ?? fallbackAddress).trim(),
    email: (payment.billingEmail ?? business.billingEmail ?? ownerEmail ?? "").trim().toLowerCase(),
  };
}

/** What the customer is allowed to see. Operator notes never leave the console. */
export function toPublicComprobante(row: Comprobante): PublicComprobante {
  const doc = getComprobanteDocType(row.docType);
  const status = row.status === "emitido" || row.status === "anulado" ? row.status : "pendiente";

  return {
    id: row.id,
    paymentId: row.paymentId,
    docType: doc.id,
    docTypeLabel: doc.label,
    status,
    statusLabel:
      status === "emitido"
        ? "Emitido"
        : status === "anulado"
          ? "Anulado (nota de crédito)"
          : "Pendiente de emisión",
    serie: row.serie,
    number: row.number,
    fullNumber:
      row.serie && row.number ? formatComprobanteNumber(row.serie, row.number) : null,
    issueDate: row.issueDate ? new Date(row.issueDate).toISOString() : null,
    customerDocType: row.customerDocType,
    customerDocNumber: row.customerDocNumber,
    customerName: row.customerName,
    customerAddress: row.customerAddress,
    customerEmail: row.customerEmail,
    description: row.description,
    subtotalCents: row.subtotalCents,
    igvCents: row.igvCents,
    totalCents: row.totalCents,
    rateBps: row.igvRateBps,
    currency: row.currency,
    hasPdf: Boolean(row.pdfPath),
    hasXml: Boolean(row.xmlPath),
    emailSentAt: row.emailSentAt ? new Date(row.emailSentAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Creation (called when a payment turns paid)
// ---------------------------------------------------------------------------

/**
 * Creates the pending comprobante for a paid order, exactly once.
 *
 * Idempotent by `payment_id`: providers retry webhooks, and two concurrent
 * notifications must not produce two invoices. The unique index is the real
 * guarantee; on a duplicate key we simply re-read the row the other request won.
 *
 * Deliberately never throws for a missing buyer email: the operator can still
 * issue and download the document, and the email is sent later from the console.
 */
export async function ensureComprobanteForPayment(
  payment: Payment,
): Promise<Comprobante | null> {
  if (payment.status !== "paid") {
    return null;
  }

  const existing = await storage.getComprobanteByPaymentId(payment.id);
  if (existing) {
    return existing;
  }

  const business =
    (await storage.getBusinessById(payment.businessId)) ??
    (await storage.getBusiness(payment.businessId));
  if (!business) {
    console.error(`[comprobantes] pago ${payment.reference} sin empresa asociada`);
    return null;
  }

  const ownerEmail = await resolveOwnerEmail(payment, business);
  const billing = resolveBillingForPayment(payment, business, ownerEmail);
  const doc = getComprobanteDocType(billing.docType);
  const breakdown = igvBreakdown(payment.amountCents);
  const description = buildComprobanteDescription({
    planName: getPlan(payment.planId).name,
    period: payment.period,
  });

  try {
    return await storage.createComprobante({
      paymentId: payment.id,
      businessId: payment.businessId,
      docType: doc.id,
      status: "pendiente",
      customerDocType: billing.docNumber ? doc.customerDocTypeCode : "0",
      customerDocNumber: billing.docNumber,
      customerName: billing.name || (doc.id === "boleta" ? "Consumidor final" : business.businessName),
      customerAddress: billing.address || null,
      customerEmail: billing.email || null,
      description,
      subtotalCents: breakdown.subtotalCents,
      igvCents: breakdown.igvCents,
      totalCents: breakdown.totalCents,
      igvRateBps: breakdown.rateBps,
      currency: payment.currency || "PEN",
      paymentMethod: paymentMethodLabel(payment),
    });
  } catch (error) {
    const raced = await storage.getComprobanteByPaymentId(payment.id);
    if (raced) {
      return raced;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Billing defaults (pre-filled at the next checkout)
// ---------------------------------------------------------------------------

export interface BillingDefaults extends BillingData {
  /** The company's RUC, so the UI can show it even on a boleta. */
  ruc: string;
  businessName: string;
}

export async function getBillingDefaults(businessId: string): Promise<BillingDefaults | null> {
  const business =
    (await storage.getBusinessById(businessId)) ?? (await storage.getBusiness(businessId));
  if (!business) {
    return null;
  }

  const docType = isComprobanteDocType(business.billingDocType)
    ? business.billingDocType
    : "factura";
  const users = await storage.getUsersByBusinessIds([business.id]);
  const owner = users.find((user) => user.role === "admin" && user.isActive) ?? users[0];

  return {
    docType,
    docNumber: docType === "factura" ? business.ruc : business.billingDni ?? "",
    // A boleta is issued to a person; the company's razón social is not the buyer.
    name: docType === "factura" ? business.businessName : "",
    address: docType === "factura" ? composeAddress(business) : "",
    email: business.billingEmail ?? owner?.email ?? "",
    ruc: business.ruc,
    businessName: business.businessName,
  };
}

/**
 * Remembers the choice for next time. Only preference fields are written:
 * the legal identity (razón social, RUC, address) is edited in the company
 * profile, not here.
 */
export async function saveBillingDefaults(
  businessId: string,
  billing: BillingData,
): Promise<void> {
  await storage.updateBusiness(businessId, {
    billingDocType: billing.docType,
    billingEmail: billing.email || null,
    billingDni: billing.docType === "boleta" ? billing.docNumber || null : null,
  });
}

/** Next correlativo to type in SUNAT's tool, per document type. */
export async function getNextNumberSuggestion(
  docType: string,
  serie?: string,
): Promise<{ serie: string; number: string; display: string }> {
  const doc = getComprobanteDocType(docType);
  const chosenSerie = normalizeSerie(serie, doc.defaultSerie);
  const max = await storage.maxComprobanteNumber(doc.id, chosenSerie);
  const number = String(max + 1).padStart(8, "0");
  return {
    serie: chosenSerie,
    number,
    display: formatComprobanteNumber(chosenSerie, number),
  };
}

// ---------------------------------------------------------------------------
// Manual emission (Phase 1)
// ---------------------------------------------------------------------------

export interface EmitComprobanteInput {
  /** Defaults to the serie already stored, then to F001/B001. */
  serie?: string;
  /** The correlativo SUNAT assigned. */
  number: string;
  issueDate?: Date;
  notes?: string | null;
  /** Already stored by multer (random name) plus the name the customer sees. */
  pdf?: { fileName: string; originalName: string } | null;
  xml?: { fileName: string; originalName: string } | null;
  actorUserId: string;
}

/**
 * Records the document SUNAT actually issued.
 *
 * This is the step where a manual process usually breaks: two payments get the
 * same correlativo, or a number is typed with the wrong serie. Both are refused
 * here (duplicate check + shape validation) before anything is mailed, because
 * a comprobante with a duplicate number is worthless to the customer's
 * accountant and a pain to correct with a nota de crédito.
 */
export async function markComprobanteEmitted(
  id: string,
  input: EmitComprobanteInput,
): Promise<Comprobante> {
  const row = await storage.getComprobante(id);
  if (!row) {
    throw new Error("Comprobante no encontrado");
  }
  if (row.status === "anulado") {
    throw new Error(
      "Un comprobante anulado no se puede volver a emitir: emita uno nuevo en SUNAT.",
    );
  }

  const doc = getComprobanteDocType(row.docType);
  const serie = normalizeSerie(input.serie, row.serie ?? doc.defaultSerie);
  if (!isValidSerie(serie)) {
    throw new Error("La serie debe tener 4 caracteres alfanuméricos (por ejemplo F001).");
  }

  const number = normalizeComprobanteNumber(input.number);
  if (!isValidComprobanteNumber(number)) {
    throw new Error("El correlativo debe ser un número mayor que cero.");
  }
  // Always store the eight-digit form, so "123" and "00000123" cannot both exist.
  const paddedNumber = number.padStart(8, "0");

  // A document that has already been issued and mailed cannot silently change
  // its identity: that is a new comprobante (after a nota de crédito), never an
  // edit. Files and notes remain updateable.
  if (row.status === "emitido" && (serie !== row.serie || paddedNumber !== row.number)) {
    throw new Error(
      "El comprobante ya fue emitido: no se puede cambiar la serie ni el correlativo. Emita una nota de crédito y un comprobante nuevo.",
    );
  }

  const duplicate = await storage.getComprobanteByNumber(row.docType, serie, paddedNumber);
  if (duplicate && duplicate.id !== row.id) {
    throw new Error(
      `El comprobante ${formatComprobanteNumber(serie, paddedNumber)} ya está registrado en otro pago.`,
    );
  }

  const issueDate = input.issueDate ?? new Date();
  if (Number.isNaN(issueDate.getTime())) {
    throw new Error("La fecha de emisión no es válida.");
  }

  let updated: Comprobante | undefined;
  try {
    updated = await storage.updateComprobante(row.id, {
      status: "emitido",
      serie,
      number: paddedNumber,
      issueDate,
      emittedAt: new Date(),
      emittedByUserId: input.actorUserId,
      notes: input.notes ?? row.notes,
      ...(input.pdf
        ? { pdfPath: input.pdf.fileName, pdfOriginalName: input.pdf.originalName }
        : {}),
      ...(input.xml
        ? { xmlPath: input.xml.fileName, xmlOriginalName: input.xml.originalName }
        : {}),
    });
  } catch (error) {
    // The unique index is the last word on duplicates: two operators saving the
    // same correlativo at once must get a clear message, not a 500.
    if ((error as { code?: string }).code === "23505") {
      if (input.pdf) {
        deleteComprobanteFile(input.pdf.fileName);
      }
      if (input.xml) {
        deleteComprobanteFile(input.xml.fileName);
      }
      throw new Error(
        `El comprobante ${formatComprobanteNumber(serie, paddedNumber)} ya está registrado en otro pago.`,
      );
    }
    throw error;
  }

  // Replacing a file must not leave the old one orphaned on disk.
  if (input.pdf && row.pdfPath && row.pdfPath !== input.pdf.fileName) {
    deleteComprobanteFile(row.pdfPath);
  }
  if (input.xml && row.xmlPath && row.xmlPath !== input.xml.fileName) {
    deleteComprobanteFile(row.xmlPath);
  }

  return updated ?? row;
}

/**
 * Mails the issued PDF/XML to the buyer.
 *
 * Called right after a successful emission (best effort: a failed mailbox must
 * never make the operator think the invoice was not recorded) and on demand
 * from the console when the customer asks for it again.
 */
export async function sendComprobanteToCustomer(id: string): Promise<Comprobante> {
  const row = await storage.getComprobante(id);
  if (!row) {
    throw new Error("Comprobante no encontrado");
  }
  if (row.status !== "emitido") {
    throw new Error("El comprobante todavía no está emitido: no hay nada que enviar.");
  }

  const email = (row.customerEmail ?? "").trim();
  if (!email) {
    throw new Error(
      "El comprobante no tiene correo de destino. Actualice los datos de facturación del cliente.",
    );
  }

  const attachments: Array<{ filename: string; path: string }> = [];
  for (const [pathKey, nameKey] of [
    ["pdfPath", "pdfOriginalName"],
    ["xmlPath", "xmlOriginalName"],
  ] as const) {
    const absolute = resolveComprobantePath(row[pathKey]);
    if (absolute && fs.existsSync(absolute)) {
      attachments.push({
        filename: row[nameKey] ?? absolute.split("/").pop() ?? "comprobante",
        path: absolute,
      });
    }
  }

  const identity = await getIdentity().catch(() => undefined);
  const doc = getComprobanteDocType(row.docType);

  await emailService.sendComprobanteIssued({
    email,
    customerName: row.customerName,
    docLabel: doc.label,
    fullNumber: formatComprobanteNumber(row.serie ?? doc.defaultSerie, row.number ?? ""),
    issueDateLabel: row.issueDate
      ? new Date(row.issueDate).toLocaleDateString("es-PE", { dateStyle: "long" })
      : "",
    subtotalCents: row.subtotalCents,
    igvCents: row.igvCents,
    totalCents: row.totalCents,
    rateBps: row.igvRateBps,
    description: row.description,
    paymentMethod: row.paymentMethod,
    attachments,
    identity,
  });

  const updated = await storage.updateComprobante(id, { emailSentAt: new Date() });
  return updated ?? row;
}

/**
 * Marks the document as no longer valid.
 *
 * The actual nota de crédito is issued in SUNAT by the operator; this records
 * it so the customer's page and the console stop showing a live invoice. A
 * pending comprobante can be discarded the same way (nothing was issued yet),
 * which is what keeps the queue clean after a refund.
 */
export async function voidComprobante(
  id: string,
  note: string | null,
  actorUserId: string,
): Promise<Comprobante> {
  const row = await storage.getComprobante(id);
  if (!row) {
    throw new Error("Comprobante no encontrado");
  }
  if (row.status === "anulado") {
    return row;
  }

  const updated = await storage.updateComprobante(id, {
    status: "anulado",
    notes: note?.trim() || row.notes,
    emittedByUserId: row.emittedByUserId ?? actorUserId,
  });

  return updated ?? row;
}

/** The two series the console offers, one per document type. */
export const DEFAULT_SERIES = {
  factura: COMPROBANTE_DOC_TYPES.factura.defaultSerie,
  boleta: COMPROBANTE_DOC_TYPES.boleta.defaultSerie,
} as const;

/**
 * Creates the missing pending rows for charges paid before this feature existed
 * (or whose creation failed at webhook time).
 *
 * Idempotent: each iteration goes through `ensureComprobanteForPayment`, which
 * reuses an existing row. Safe to press twice.
 */
export async function backfillPendingComprobantes(
  limit = 500,
): Promise<{ created: number; failed: number; scanned: number }> {
  const pending = await storage.listPaymentsWithoutComprobante(limit);
  let created = 0;
  let failed = 0;

  for (const payment of pending) {
    try {
      const row = await ensureComprobanteForPayment(payment);
      if (row) {
        created += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[comprobantes] no se pudo generar el pendiente de ${payment.reference}:`,
        error,
      );
    }
  }

  return { created, failed, scanned: pending.length };
}
