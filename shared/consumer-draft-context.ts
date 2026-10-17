/**
 * The non-personal data the visitor already typed into the public complaint form.
 *
 * The public "Revisar mi borrador con IA" assistant used to receive only the
 * `complaintDetail` textarea, so it reported as missing data the visitor had
 * already entered in the fields above it ("falta el nombre del producto", "falta
 * la fecha de la compra", "falta el número de factura") even though the form
 * carried all of it. The answer was technically true for the text it was given
 * and useless for the person reading it, which is the worst combination.
 *
 * This module is the single whitelist of the fields that travel with the draft,
 * and nothing else leaves the browser with it. Personal data (nombres, documento,
 * domicilio, teléfono, correo y los datos del padre/madre/tutor) is deliberately
 * absent: the model does not need it to review a narrative, and Ley 29733 asks
 * for the minimum necessary.
 *
 * Pure by design (no I/O, no framework), so it is unit-tested
 * (consumer-draft-context.test.ts), used by the form to build the snapshot it
 * sends and by the route to sanitize what arrives - the second use is what makes
 * the whitelist enforceable instead of merely polite.
 */

/** Fields of the form that may accompany the draft to the model. */
export interface ConsumerDraftContext {
  productServiceName?: string;
  productServiceDescription?: string;
  purchaseAmount?: string;
  purchaseDate?: string;
  receiptNumber?: string;
  complaintType?: string;
  consumerRequest?: string;
}

interface ConsumerDraftContextField {
  key: keyof ConsumerDraftContext;
  /** Human label used in the model prompt. Never rendered to the visitor. */
  label: string;
  /** Hard cap: a pasted wall of text must not become the prompt. */
  maxLength: number;
  /**
   * `purchaseAmount` is registered with `valueAsNumber`, so the form hands over a
   * number (and an untouched input yields NaN). Every other field is text: a
   * number arriving for one of them is not something the form can produce.
   */
  numeric?: boolean;
}

/**
 * The whitelist, and the only way another field can ever be sent. Every PII field
 * is absent on purpose - filtering a full form object afterwards would be one
 * forgotten key away from shipping a name to a third-party model.
 */
export const CONSUMER_DRAFT_CONTEXT_FIELDS: readonly ConsumerDraftContextField[] = [
  { key: "productServiceName", label: "Nombre del producto o servicio", maxLength: 200 },
  { key: "productServiceDescription", label: "Descripción del producto o servicio", maxLength: 500 },
  { key: "purchaseAmount", label: "Monto reclamado (S/)", maxLength: 30, numeric: true },
  { key: "purchaseDate", label: "Fecha de consumo o compra", maxLength: 30 },
  { key: "receiptNumber", label: "N° de comprobante", maxLength: 100 },
  { key: "complaintType", label: "Tipo de solicitud (reclamo o queja)", maxLength: 20 },
  { key: "consumerRequest", label: "Solución solicitada por el consumidor", maxLength: 500 },
];

/** True when at least one declared field carries a value worth sending. */
export function hasConsumerDraftContext(context?: ConsumerDraftContext | null): boolean {
  return Boolean(context && CONSUMER_DRAFT_CONTEXT_FIELDS.some((field) => Boolean(context[field.key])));
}

function normalizeContextValue(value: unknown, field: ConsumerDraftContextField): string | undefined {
  if (typeof value === "number") {
    // An untouched number input yields NaN, which must not reach the model as
    // "NaN", and no other field of the form can produce a number at all.
    return field.numeric && Number.isFinite(value) ? String(value).slice(0, field.maxLength) : undefined;
  }

  if (typeof value === "string") {
    // Consumer values are embedded in the prompt between delimiter tags, so a
    // value carrying a closing tag could step outside them. Markup is stripped:
    // no legitimate product name, amount, date or receipt number needs it, and
    // the model is told the block is data rather than instructions anyway.
    const cleaned = value.trim().replace(/<[^>]*>/g, " ").trim();
    return cleaned ? cleaned.slice(0, field.maxLength) : undefined;
  }

  return undefined;
}

/**
 * Keeps only the whitelisted, non-empty fields of whatever it is handed: the form
 * values in the browser, and `req.body.context` on the server, where the input is
 * untrusted and may be a string, an array or anything else at all.
 *
 * Returns `undefined` when nothing usable remains, so "the visitor filled in no
 * other field" and "the visitor filled in other fields" stay distinguishable and
 * the prompt only grows when there is something to add.
 */
export function buildConsumerDraftContext(source: unknown): ConsumerDraftContext | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }

  const record = source as Record<string, unknown>;
  const context: ConsumerDraftContext = {};

  for (const field of CONSUMER_DRAFT_CONTEXT_FIELDS) {
    const value = normalizeContextValue(record[field.key], field);
    if (value) {
      context[field.key] = value;
    }
  }

  return hasConsumerDraftContext(context) ? context : undefined;
}
