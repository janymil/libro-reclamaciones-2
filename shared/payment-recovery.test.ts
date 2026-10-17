import { describe, it, expect } from "vitest";

import { buildPaymentRecoveryText, buildPaymentResumeUrl, paymentRecoverySubject } from "./payment-recovery";

/**
 * The "finish your payment" email is the only thing a customer sees after a
 * declined card, so its content is a contract: the SAME checkout link they used,
 * a way back into the app, and the transfer details for the same reference. If
 * any of those silently disappeared, a rejected card would become a lost sale.
 */

const base = {
  firstName: "Ana",
  businessName: "Bodega Ana",
  planName: "Plan Básico",
  periodLabel: "mensual",
  amountLabel: "S/ 5.00",
  reference: "LD-5L7LC5",
  checkoutUrl: "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=abc",
  resumeUrl: "https://librodigital.pe/suscribir?plan=esencial&periodo=monthly",
  transferInstructions: [
    "Referencia: LD-5L7LC5",
    "Monto: S/ 5.00 · Plan Básico (mensual)",
    "Yape al 999888777 (a nombre de LibroDigital S.A.C.).",
  ].join("\n"),
  reason: "El proveedor de pagos marcó la operación como de riesgo alto.",
  footerLines: ["LibroDigital.pe", "RUC 20123456789"],
};

describe("buildPaymentResumeUrl", () => {
  it("builds the in-app page for the same plan and period", () => {
    expect(buildPaymentResumeUrl("https://librodigital.pe/", "esencial", "monthly")).toBe(
      "https://librodigital.pe/suscribir?plan=esencial&periodo=monthly",
    );
  });

  it("encodes the plan so a crafted value cannot add parameters", () => {
    expect(buildPaymentResumeUrl("https://librodigital.pe", "x&y=1", "annual")).toBe(
      "https://librodigital.pe/suscribir?plan=x%26y%3D1&periodo=annual",
    );
  });
});

describe("paymentRecoverySubject", () => {
  it("names the reference and the plan, so it is searchable in an inbox", () => {
    expect(paymentRecoverySubject({ reference: "LD-5L7LC5", planName: "Plan Básico" })).toBe(
      "Pago pendiente LD-5L7LC5 - Plan Básico",
    );
  });
});

describe("buildPaymentRecoveryText", () => {
  it("carries the original checkout link, the fallback and the reason", () => {
    const text = buildPaymentRecoveryText(base);

    expect(text).toContain("Hola Ana,");
    expect(text).toContain("S/ 5.00");
    expect(text).toContain("Referencia: LD-5L7LC5");
    expect(text).toContain(`Motivo: ${base.reason}`);
    expect(text).toContain(base.checkoutUrl);
    expect(text).toContain(base.resumeUrl);
  });

  it("includes the transfer/Yape block, which is what makes paying another way possible", () => {
    const text = buildPaymentRecoveryText(base);

    expect(text).toContain("También puede pagar por transferencia, Yape o Plin");
    expect(text).toContain("Yape al 999888777");
    expect(text).toContain("Referencia: LD-5L7LC5");
  });

  it("still works with no name, no reason and no configured transfer details", () => {
    const text = buildPaymentRecoveryText({
      ...base,
      firstName: "   ",
      reason: null,
      transferInstructions: null,
      checkoutUrl: null,
    });

    expect(text).toContain("Hola,");
    expect(text).not.toContain("Motivo:");
    expect(text).not.toContain("También puede pagar por transferencia");
    // With no provider link, the in-app page is the single way back - and still present.
    expect(text).toContain(base.resumeUrl);
    expect(text).toContain("Puede empezar de nuevo aquí:");
    // With nothing configured, the reference is still stated: it is the only way
    // a later transfer can be matched to the order.
    expect(text).toContain("Indique la referencia LD-5L7LC5");
  });

  it("ends with the platform's legal footer", () => {
    const text = buildPaymentRecoveryText(base);
    expect(text.trimEnd().endsWith("RUC 20123456789")).toBe(true);
  });
});
