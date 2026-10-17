/**
 * Minimal, conservative PII masking for text sent to an external model.
 *
 * The AI provider only needs the facts of a case to classify, summarise or
 * detect trends; it never needs the consumer's e-mail, phone, document number or
 * receipt number. Masking those before the prompt is both data minimisation
 * (Ley 29733) and a defence against the model echoing them into a draft.
 *
 * Names and addresses cannot be detected reliably without hurting the text, so
 * callers that know a structured consumer name (the case-summary route) must
 * omit it from the prompt themselves.
 */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PERU_MOBILE = /(?:\+?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g;
const DNI = /\b\d{8}\b/g;
/** Long digit runs: card / account / receipt numbers. Keep the last 4? No: mask all. */
const LONG_NUMBER = /\b\d{12,}\b/g;

export function redactPII(text: string): string {
  return text
    .replace(EMAIL, '[correo]')
    .replace(PERU_MOBILE, '[teléfono]')
    .replace(LONG_NUMBER, '[número]')
    .replace(DNI, '[documento]');
}

/** Convenience for arrays of complaint narratives sent to trend/analysis prompts. */
export function redactPIIList(items: string[]): string[] {
  return items.map(redactPII);
}
