import { PAYMENT_CURRENCY_SYMBOL } from "./payments";

/**
 * Where the company collects a bank transfer / Yape (Phase 2.7, step 3).
 *
 * Until now these details - the Yape number, the account numbers and their CCI -
 * lived only in the `PAYMENTS_MANUAL_INSTRUCTIONS` environment variable, which
 * means changing a phone number required a deploy. They are the single thing a
 * paying customer is told to do, so they belong in the console: an operator edits
 * them in **Configuración** and the next checkout says the right thing.
 *
 * This module is the one place that knows
 *   * the shape of those details (`PaymentCollectionDetails`),
 *   * how to read them from whatever the database or an HTTP body contains
 *     (`normalizePaymentDetails`: jsonb is untrusted input too),
 *   * how they become the message the customer reads
 *     (`buildTransferInstructions`).
 *
 * Pure by design (no I/O, no framework), so it is unit-tested
 * (payment-details.test.ts) and imported by both the server and the browser -
 * the console renders the same function's output as a live preview, which is how
 * an operator sees the message before a customer does.
 */

/** Currencies a Peruvian merchant account can hold. */
export const BANK_ACCOUNT_CURRENCIES = ["PEN", "USD"] as const;
export type BankAccountCurrency = (typeof BANK_ACCOUNT_CURRENCIES)[number];

export const BANK_ACCOUNT_CURRENCY_LABELS: Record<BankAccountCurrency, string> = {
  PEN: "soles",
  USD: "dólares",
};

/** One account we accept deposits in. */
export interface BankAccountDetails {
  /** Bank name as the customer sees it: BCP, BBVA, Interbank, Scotiabank... */
  bank: string;
  /** "corriente" / "ahorros" / "..." - free text, it is printed as-is. */
  accountType: string | null;
  accountNumber: string;
  /** CCI (Código de Cuenta Interbancario): needed for a transfer from another bank. */
  cci: string | null;
  currency: BankAccountCurrency;
  /** Only when it differs from the group holder (a second RUC, a partner...). */
  holder: string | null;
}

/**
 * Everything the customer needs to pay us offline.
 *
 * Every field is optional: an operator may well publish only a Yape number one
 * day and add the bank accounts later, and `hasPaymentDetails` is what decides
 * whether we can say anything useful at all.
 */
export interface PaymentCollectionDetails {
  /** Account holder, e.g. "LibroDigital S.A.C." */
  holderName: string | null;
  holderRuc: string | null;
  yapeNumber: string | null;
  plinNumber: string | null;
  /** Where a receipt / voucher is sent (usually a shared team mailbox). */
  voucherEmail: string | null;
  /** Or a WhatsApp number, which is how most Peruvian customers send it. */
  voucherWhatsapp: string | null;
  bankAccounts: BankAccountDetails[];
  /** Free text appended at the end (opening hours, a reminder...). */
  notes: string | null;
}

/** Nothing configured: the shape the console starts from. */
export const EMPTY_PAYMENT_DETAILS: PaymentCollectionDetails = {
  holderName: null,
  holderRuc: null,
  yapeNumber: null,
  plinNumber: null,
  voucherEmail: null,
  voucherWhatsapp: null,
  bankAccounts: [],
  notes: null,
};

/** A merchant rarely has more than a handful of accounts; the API enforces this. */
export const MAX_BANK_ACCOUNTS = 8;

/** Trims, and collapses "" into `null`, so "  " and "empty field" mean the same. */
function optionalText(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeBankAccount(raw: unknown): BankAccountDetails | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const account = raw as Record<string, unknown>;
  const bank = optionalText(account.bank, 120);
  const accountNumber = optionalText(account.accountNumber ?? account.number, 60);

  // Both are what a transfer cannot happen without; a half-filled row is dropped
  // instead of printed as "· Cuenta soles".
  if (!bank || !accountNumber) {
    return null;
  }

  const currency = BANK_ACCOUNT_CURRENCIES.includes(account.currency as BankAccountCurrency)
    ? (account.currency as BankAccountCurrency)
    : "PEN";

  return {
    bank,
    accountType: optionalText(account.accountType, 40),
    accountNumber,
    cci: optionalText(account.cci, 40),
    currency,
    holder: optionalText(account.holder, 160),
  };
}

/**
 * Reads details out of anything: a jsonb column, an HTTP body, a cached object.
 *
 * Never throws: an unknown shape yields the empty details, which the caller turns
 * into the "ask us for the payment data" fallback rather than into a 500.
 */
export function normalizePaymentDetails(raw: unknown): PaymentCollectionDetails {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_PAYMENT_DETAILS };
  }
  const source = raw as Record<string, unknown>;
  const rawAccounts = Array.isArray(source.bankAccounts) ? source.bankAccounts : [];

  return {
    holderName: optionalText(source.holderName, 160),
    holderRuc: optionalText(source.holderRuc, 20),
    yapeNumber: optionalText(source.yapeNumber, 40),
    plinNumber: optionalText(source.plinNumber, 40),
    voucherEmail: optionalText(source.voucherEmail, 255),
    voucherWhatsapp: optionalText(source.voucherWhatsapp, 40),
    bankAccounts: rawAccounts
      .map(normalizeBankAccount)
      .filter((account): account is BankAccountDetails => account !== null)
      .slice(0, MAX_BANK_ACCOUNTS),
    notes: optionalText(source.notes, 2000),
  };
}

/**
 * Whether we can tell a customer *how* to pay.
 *
 * Only the rails that actually move money count: a holder name with no number and
 * no account is not a way to pay, and "transfer to LibroDigital S.A.C." without an
 * account number is worse than the honest fallback.
 */
export function hasPaymentDetails(details: PaymentCollectionDetails | null | undefined): boolean {
  if (!details) {
    return false;
  }
  return Boolean(details.yapeNumber || details.plinNumber || details.bankAccounts.length > 0);
}

/** "a nombre de X (, RUC 20...)" - or nothing when the holder is unknown. */
function holderSuffix(holderName: string | null, holderRuc: string | null): string {
  if (!holderName) {
    return holderRuc ? ` (RUC ${holderRuc})` : "";
  }
  return ` (a nombre de ${holderName}${holderRuc ? `, RUC ${holderRuc}` : ""})`;
}

/** One printable line per account, e.g. "BCP · Cuenta soles 193-… · CCI 002-…". */
export function describeBankAccount(account: BankAccountDetails): string {
  const currency = BANK_ACCOUNT_CURRENCY_LABELS[account.currency] ?? "soles";
  const kind = account.accountType ? `${account.accountType} ${currency}` : currency;
  const parts = [`${account.bank} · Cuenta ${kind} ${account.accountNumber}`];
  if (account.cci) {
    parts.push(`CCI ${account.cci}`);
  }
  if (account.holder) {
    parts.push(`Titular ${account.holder}`);
  }
  return parts.join(' · ');
}

/**
 * The customer-facing block for an offline payment.
 *
 * Returns `undefined` when nothing is configured, so the caller can fall back to
 * the environment text / the generic "ask us" message: half-empty instructions are
 * worse than asking.
 *
 * The reference is repeated three times because that is the whole reconciliation
 * mechanism: on the transfer, on the Yape operation number and in the receipt.
 */
export function buildTransferInstructions(
  payment: { reference: string; amountCents: number; description: string },
  details: PaymentCollectionDetails | null | undefined,
): string | undefined {
  if (!hasPaymentDetails(details)) {
    return undefined;
  }

  // Narrowed by hasPaymentDetails; the cast keeps the rest of the function flat.
  const safe = details as PaymentCollectionDetails;
  const holder = holderSuffix(safe.holderName, safe.holderRuc);
  const lines: string[] = [
    `Referencia: ${payment.reference}`,
    `Monto: ${PAYMENT_CURRENCY_SYMBOL} ${(payment.amountCents / 100).toFixed(2)} · ${payment.description}`,
  ];

  if (safe.yapeNumber) {
    lines.push(`Yape al ${safe.yapeNumber}${holder}.`);
  }
  if (safe.plinNumber) {
    lines.push(`Plin al ${safe.plinNumber}${holder}.`);
  }

  if (safe.bankAccounts.length > 0) {
    lines.push('');
    lines.push('Transferencia o depósito bancario:');
    for (const account of safe.bankAccounts) {
      lines.push(`· ${describeBankAccount(account)}`);
    }
  }

  lines.push('');
  lines.push(`Escriba la referencia ${payment.reference} en el motivo o glosa del pago.`);

  const channels: string[] = [];
  if (safe.voucherEmail) {
    channels.push(`a ${safe.voucherEmail}`);
  }
  if (safe.voucherWhatsapp) {
    channels.push(`por WhatsApp al ${safe.voucherWhatsapp}`);
  }
  if (channels.length > 0) {
    lines.push(`Envíe el comprobante ${channels.join(' o ')}.`);
  }

  if (safe.notes) {
    lines.push('');
    lines.push(safe.notes);
  }

  lines.push('El equipo de LibroDigital verificará el pago y su plan quedará activo.');

  return lines.join('\n');
}

/**
 * A sample payment for the console's live preview.
 *
 * Deliberately not a real reference: an operator must be able to see the message
 * without creating a `pending` row nobody will ever pay.
 */
export const PREVIEW_PAYMENT = {
  reference: 'LD-EJEMPLO',
  amountCents: 7900,
  description: 'Plan Profesional (mensual)',
};
