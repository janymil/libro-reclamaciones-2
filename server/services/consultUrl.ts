/**
 * Public status-page URL for a complaint.
 *
 * Printed as a QR on the constancia PDF so the consumer can scan it and jump
 * straight to the "Consultar estado" tab of the business's public libro with
 * the folio pre-filled (the document number is never included: it is PII).
 *
 * Returns undefined when APP_URL or the business slug is missing, so callers
 * can simply omit the QR instead of printing a broken link.
 */
export function buildConsultUrl(
  slug: string | null | undefined,
  correlativeNumber: string,
): string | undefined {
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!appUrl || !slug) {
    return undefined;
  }
  return `${appUrl}/libro/${slug}?folio=${encodeURIComponent(correlativeNumber)}`;
}
