/**
 * IGV — the one place that knows how a price becomes a fiscal breakdown.
 *
 * The commercial decision (Phase "precios con IGV") is that EVERY published
 * price is the final price a customer pays, with IGV already inside it. So the
 * gross amount is the source of truth and the taxable base is derived from it,
 * never the other way around: adding 18% at checkout would both raise the
 * price and contradict how prices must be shown to consumers in Peru
 * (Ley 29571, art. 2.1: precio final, impuestos incluidos).
 *
 * Pure and framework-free so the checkout, the admin console, the invoices and
 * the unit tests all read the same arithmetic. Money is integer céntimos, as
 * everywhere else in this codebase - never a float.
 */

/**
 * 18% = 16% IGV + 2% IPM (Impuesto de Promoción Municipal).
 *
 * Stored in basis points (1/100 of a percent) so the rate is an integer and a
 * future change is a one-line edit that reaches the checkout, the comprobante
 * and the emails at once.
 */
export const IGV_RATE_BPS = 1800;

/** The same rate as a fraction, for display and for `Intl`-style formatting. */
export const IGV_RATE = IGV_RATE_BPS / 10000;

export interface IgvBreakdown {
  /** What the customer pays: the published price. */
  totalCents: number;
  /** Taxable base (valor de venta), IGV excluded. */
  subtotalCents: number;
  /** The tax inside the price. */
  igvCents: number;
  /** Rate used, in basis points (1800 = 18%). */
  rateBps: number;
}

/**
 * Splits a tax-inclusive amount into base + IGV.
 *
 * `subtotalCents` is rounded once and `igvCents` is the REMAINDER, so
 * `subtotalCents + igvCents === totalCents` always holds exactly. Rounding both
 * halves independently is the classic source of the one-céntimo mismatch that
 * SUNAT rejects (the sum of the lines no longer equals the total).
 */
export function igvBreakdown(totalCents: number, rateBps: number = IGV_RATE_BPS): IgvBreakdown {
  const total = Number.isFinite(totalCents) ? Math.round(totalCents) : 0;
  const rate = Number.isFinite(rateBps) && rateBps >= 0 ? Math.round(rateBps) : IGV_RATE_BPS;

  if (total <= 0) {
    return { totalCents: 0, subtotalCents: 0, igvCents: 0, rateBps: rate };
  }

  // total = subtotal * (1 + rate)  =>  subtotal = total / (1 + rate)
  const subtotal = Math.round((total * 10000) / (10000 + rate));
  return {
    totalCents: total,
    subtotalCents: subtotal,
    igvCents: total - subtotal,
    rateBps: rate,
  };
}

/** "18%" — for labels next to a price and on the comprobante. */
export function formatIgvRate(rateBps: number = IGV_RATE_BPS): string {
  const percent = rateBps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

/**
 * The sentence that must accompany a price list shown to consumers.
 * "IGV incluido" is not a marketing nicety: the published price has to be the
 * final one.
 */
export const PRICES_INCLUDE_IGV_NOTE = `Precios en soles (S/), IGV (${formatIgvRate()}) incluido.`;
