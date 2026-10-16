import { describe, it, expect } from "vitest";

import {
  EMPTY_PAYMENT_DETAILS,
  MAX_BANK_ACCOUNTS,
  buildTransferInstructions,
  describeBankAccount,
  hasPaymentDetails,
  normalizePaymentDetails,
  type PaymentCollectionDetails,
} from "./payment-details";

/**
 * The company's collection details and the transfer message they produce.
 *
 * The message is read by a paying customer who is about to send money, so a wrong
 * line here is a support ticket and a delayed plan - every case below is one an
 * operator can actually create from the console.
 */

const payment = {
  reference: "LD-8F3A2B",
  amountCents: 2900,
  description: "Plan Profesional (mensual)",
};

const fullDetails: PaymentCollectionDetails = {
  holderName: "LibroDigital S.A.C.",
  holderRuc: "20601234567",
  yapeNumber: "999 888 777",
  plinNumber: "999 888 777",
  voucherEmail: "pagos@librodigital.pe",
  voucherWhatsapp: "+51 999 888 777",
  bankAccounts: [
    {
      bank: "BCP",
      accountType: "corriente",
      accountNumber: "193-1234567-0-12",
      cci: "002-193-001234567012-15",
      currency: "PEN",
      holder: null,
    },
  ],
  notes: null,
};

describe("normalizePaymentDetails", () => {
  it("returns the empty details for anything that is not an object", () => {
    for (const input of [undefined, null, "texto", 42, [], true]) {
      expect(normalizePaymentDetails(input)).toEqual(EMPTY_PAYMENT_DETAILS);
    }
  });

  it("trims every field and turns blank strings into null", () => {
    const details = normalizePaymentDetails({
      holderName: "  LibroDigital S.A.C. ",
      yapeNumber: "   ",
      plinNumber: "",
      notes: "\n",
    });

    expect(details.holderName).toBe("LibroDigital S.A.C.");
    expect(details.yapeNumber).toBeNull();
    expect(details.plinNumber).toBeNull();
    expect(details.notes).toBeNull();
  });

  it("drops a bank account that cannot be transferred to", () => {
    const details = normalizePaymentDetails({
      bankAccounts: [
        { bank: "BCP" }, // no account number
        { accountNumber: "193-1234567-0-12" }, // no bank
        { bank: "BBVA", accountNumber: "0011-0234-5678-9012", cci: "011-234-000123456789-01" },
      ],
    });

    expect(details.bankAccounts).toHaveLength(1);
    expect(details.bankAccounts[0].bank).toBe("BBVA");
  });

  it("defaults the currency to soles and keeps a known one", () => {
    const details = normalizePaymentDetails({
      bankAccounts: [
        { bank: "BCP", accountNumber: "1", currency: "usd" },
        { bank: "Interbank", accountNumber: "2", currency: "USD" },
      ],
    });

    expect(details.bankAccounts[0].currency).toBe("PEN");
    expect(details.bankAccounts[1].currency).toBe("USD");
  });

  it("caps the number of accounts a single row can publish", () => {
    const details = normalizePaymentDetails({
      bankAccounts: Array.from({ length: MAX_BANK_ACCOUNTS + 5 }, (_value, index) => ({
        bank: `Banco ${index}`,
        accountNumber: `000-${index}`,
      })),
    });

    expect(details.bankAccounts).toHaveLength(MAX_BANK_ACCOUNTS);
  });

  it("accepts `number` as an alias for `accountNumber`", () => {
    const details = normalizePaymentDetails({
      bankAccounts: [{ bank: "BCP", number: "193-1234567-0-12" }],
    });

    expect(details.bankAccounts[0].accountNumber).toBe("193-1234567-0-12");
  });
});

describe("hasPaymentDetails", () => {
  it("is false with nothing configured", () => {
    expect(hasPaymentDetails(EMPTY_PAYMENT_DETAILS)).toBe(false);
    expect(hasPaymentDetails(null)).toBe(false);
    expect(hasPaymentDetails(undefined)).toBe(false);
  });

  it("is false for a holder with no way to pay (a name is not a rail)", () => {
    const details = normalizePaymentDetails({
      holderName: "LibroDigital S.A.C.",
      holderRuc: "20601234567",
    });
    expect(hasPaymentDetails(details)).toBe(false);
  });

  it("is true as soon as a Yape, Plin or bank account exists", () => {
    expect(hasPaymentDetails(normalizePaymentDetails({ yapeNumber: "999 888 777" }))).toBe(true);
    expect(hasPaymentDetails(normalizePaymentDetails({ plinNumber: "999 888 777" }))).toBe(true);
    expect(
      hasPaymentDetails(
        normalizePaymentDetails({ bankAccounts: [{ bank: "BCP", accountNumber: "193-1" }] }),
      ),
    ).toBe(true);
  });
});

describe("describeBankAccount", () => {
  it("prints bank, currency, account and CCI", () => {
    expect(describeBankAccount(fullDetails.bankAccounts[0])).toBe(
      "BCP · Cuenta corriente soles 193-1234567-0-12 · CCI 002-193-001234567012-15",
    );
  });

  it("keeps a per-account holder when it differs from the group's", () => {
    const line = describeBankAccount({
      bank: "BBVA",
      accountType: null,
      accountNumber: "0011-0234-5678-9012",
      cci: null,
      currency: "USD",
      holder: "LibroDigital USA LLC",
    });

    expect(line).toBe("BBVA · Cuenta dólares 0011-0234-5678-9012 · Titular LibroDigital USA LLC");
  });
});

describe("buildTransferInstructions", () => {
  it("says nothing at all when there is nowhere to pay", () => {
    expect(buildTransferInstructions(payment, EMPTY_PAYMENT_DETAILS)).toBeUndefined();
    expect(buildTransferInstructions(payment, null)).toBeUndefined();
  });

  it("always shows the reference and the amount first", () => {
    const text = buildTransferInstructions(payment, fullDetails) as string;

    expect(text.startsWith("Referencia: LD-8F3A2B")).toBe(true);
    expect(text).toContain("Monto: S/ 29.00 · Plan Profesional (mensual)");
  });

  it("puts the holder and RUC on the wallets", () => {
    const text = buildTransferInstructions(payment, fullDetails) as string;

    expect(text).toContain(
      "Yape al 999 888 777 (a nombre de LibroDigital S.A.C., RUC 20601234567).",
    );
    expect(text).toContain("Plin al 999 888 777");
  });

  it("lists every bank account with its CCI", () => {
    const text = buildTransferInstructions(payment, fullDetails) as string;

    expect(text).toContain("Transferencia o depósito bancario:");
    expect(text).toContain("· BCP · Cuenta corriente soles 193-1234567-0-12");
    expect(text).toContain("CCI 002-193-001234567012-15");
  });

  it("offers both voucher channels and repeats the reference in the glosa", () => {
    const text = buildTransferInstructions(payment, fullDetails) as string;

    expect(text).toContain("Escriba la referencia LD-8F3A2B en el motivo o glosa del pago.");
    expect(text).toContain(
      "Envíe el comprobante a pagos@librodigital.pe o por WhatsApp al +51 999 888 777.",
    );
    expect(text).toContain(
      "El equipo de LibroDigital verificará el pago y su plan quedará activo.",
    );
  });

  it("omits the sections that are not configured", () => {
    const text = buildTransferInstructions(
      payment,
      normalizePaymentDetails({ yapeNumber: "999 888 777" }),
    ) as string;

    expect(text).toContain("Yape al 999 888 777.");
    expect(text).not.toContain("Plin");
    expect(text).not.toContain("Transferencia o depósito");
    expect(text).not.toContain("Envíe el comprobante");
    expect(text).toContain("Escriba la referencia LD-8F3A2B");
  });

  it("appends the operator's own notes when they wrote some", () => {
    const text = buildTransferInstructions(
      payment,
      normalizePaymentDetails({ ...fullDetails, notes: "Atendemos de lunes a viernes, 9am a 6pm." }),
    ) as string;

    expect(text).toContain("Atendemos de lunes a viernes, 9am a 6pm.");
  });

  it("formats céntimos as soles with two decimals", () => {
    const text = buildTransferInstructions(
      { reference: "LD-TEST01", amountCents: 42900, description: "Plan Corporativo (anual)" },
      fullDetails,
    ) as string;

    expect(text).toContain("Monto: S/ 429.00 · Plan Corporativo (anual)");
  });
});

