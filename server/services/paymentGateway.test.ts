import { describe, it, expect, afterEach } from "vitest";

import { normalizePaymentDetails } from "@shared/payment-details";

import {
  DEFAULT_MANUAL_DETAILS,
  getGateway,
  manualPaymentInstructions,
  mapMercadoPagoStatus,
  mapMercadoPagoSubscriptionStatus,
  mercadopagoPreapprovalBody,
  mercadopagoPreferenceBody,
  parseMercadoPagoAuthorizedPayment,
  parseMercadoPagoNotification,
  parseMercadoPagoPayment,
  parseMercadoPagoPreapproval,
  parseMercadoPagoPreference,
  periodFromRecurrence,
  type CheckoutInput,
  type SubscriptionCheckoutInput,
} from "./paymentGateway";

/**
 * Provider contract tests (Phase 2.7) - fully offline.
 *
 * The payload we send and the fields we read back are the two places a payment
 * integration silently breaks, so they are asserted exactly. The responses used
 * here mirror the documented Mercado Pago Checkout Pro shapes.
 */

const input: CheckoutInput = {
  reference: "LD-8F3A2B",
  amountCents: 2900,
  description: "Plan Pro (mensual)",
  planId: "profesional",
  period: "monthly",
  payerEmail: "admin@empresa.pe",
  businessName: "Empresa SAC",
  successUrl: "https://librodigital.pe/pagos?estado=ok",
  failureUrl: "https://librodigital.pe/pagos?estado=error",
  pendingUrl: "https://librodigital.pe/pagos?estado=pendiente",
  notificationUrl: "https://librodigital.pe/api/payments/webhook/mercadopago",
};

describe("mercadopagoPreferenceBody", () => {
  it("converts integer céntimos into the soles format the API expects", () => {
    const body = mercadopagoPreferenceBody(input) as any;
    expect(body.items[0].unit_price).toBe(29);
    expect(body.items[0].currency_id).toBe("PEN");
    expect(body.items[0].quantity).toBe(1);
  });

  it("carries our reference so the webhook can be reconciled", () => {
    const body = mercadopagoPreferenceBody(input) as any;
    expect(body.external_reference).toBe("LD-8F3A2B");
    expect(body.items[0].description).toContain("LD-8F3A2B");
  });

  it("registers the notification URL and the three back URLs", () => {
    const body = mercadopagoPreferenceBody(input) as any;
    expect(body.notification_url).toBe(input.notificationUrl);
    expect(body.back_urls.success).toBe(input.successUrl);
    expect(body.back_urls.failure).toBe(input.failureUrl);
    expect(body.back_urls.pending).toBe(input.pendingUrl);
    expect(body.auto_return).toBe("approved");
  });

  it("never leaks the plan price as a float", () => {
    const body = mercadopagoPreferenceBody({ ...input, amountCents: 6900 }) as any;
    expect(body.items[0].unit_price).toBe(69);
    expect(Number.isInteger(body.items[0].unit_price)).toBe(true);
  });
});

describe("parseMercadoPagoPreference", () => {
  const response = {
    id: "123456789-abc",
    init_point: "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=1",
    sandbox_init_point: "https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=1",
  };

  it("returns the production checkout URL by default", () => {
    const parsed = parseMercadoPagoPreference(response, false);
    expect(parsed.providerRef).toBe("123456789-abc");
    expect(parsed.redirectUrl).toBe(response.init_point);
  });

  it("returns the sandbox URL when sandbox mode is on", () => {
    expect(parseMercadoPagoPreference(response, true).redirectUrl).toBe(response.sandbox_init_point);
  });

  it("falls back to whichever URL exists", () => {
    expect(parseMercadoPagoPreference({ id: "1", init_point: "https://a" }, true).redirectUrl)
      .toBe("https://a");
  });

  it("throws instead of creating a payment without a redirect target", () => {
    expect(() => parseMercadoPagoPreference({ id: "1" })).toThrow(/URL de pago/i);
    expect(() => parseMercadoPagoPreference({ init_point: "https://a" })).toThrow(/URL de pago/i);
  });
});

describe("mapMercadoPagoStatus", () => {
  it("maps approved to paid - the only status that unlocks a plan", () => {
    expect(mapMercadoPagoStatus("approved")).toBe("paid");
  });

  it("maps refunds and chargebacks to refunded", () => {
    expect(mapMercadoPagoStatus("refunded")).toBe("refunded");
    expect(mapMercadoPagoStatus("charged_back")).toBe("refunded");
  });

  it("maps rejections and cancellations to failed", () => {
    expect(mapMercadoPagoStatus("rejected")).toBe("failed");
    expect(mapMercadoPagoStatus("cancelled")).toBe("failed");
  });

  it("keeps in-flight statuses pending", () => {
    expect(mapMercadoPagoStatus("pending")).toBe("pending");
    expect(mapMercadoPagoStatus("in_process")).toBe("pending");
    expect(mapMercadoPagoStatus("authorized")).toBe("pending");
  });

  it("is case-insensitive and never throws on junk", () => {
    expect(mapMercadoPagoStatus("APPROVED")).toBe("paid");
    expect(mapMercadoPagoStatus(undefined)).toBe("pending");
    expect(mapMercadoPagoStatus({ weird: true })).toBe("pending");
  });
});

describe("parseMercadoPagoPayment", () => {
  const payment = {
    id: 99887766,
    status: "approved",
    status_detail: "accredited",
    external_reference: "LD-8F3A2B",
    transaction_amount: 29,
    currency_id: "PEN",
    payment_method_id: "yape",
    payment_type_id: "bank_transfer",
    date_approved: "2026-02-01T12:00:00.000Z",
    // Fields below must NOT survive into our audit trail:
    card: { last_four_digits: "1234", first_six_digits: "411111" },
    payer: { email: "cliente@empresa.pe", identification: { number: "12345678" } },
  };

  it("reads the id, status and confirmed amount", () => {
    const parsed = parseMercadoPagoPayment(payment);
    expect(parsed.providerRef).toBe("99887766");
    expect(parsed.status).toBe("paid");
    expect(parsed.amountCents).toBe(2900);
  });

  it("drops card and payer personal data from the stored payload", () => {
    const parsed = parseMercadoPagoPayment(payment);
    expect(parsed.raw).not.toHaveProperty("card");
    expect(parsed.raw).not.toHaveProperty("payer");
    expect(JSON.stringify(parsed.raw)).not.toContain("12345678");
    expect(JSON.stringify(parsed.raw)).not.toContain("411111");
    // The fields we do need are kept
    expect(parsed.raw.external_reference).toBe("LD-8F3A2B");
    expect(parsed.raw.payment_method_id).toBe("yape");
  });

  it("tolerates a missing transaction_amount", () => {
    const parsed = parseMercadoPagoPayment({ id: 1, status: "pending" });
    expect(parsed.amountCents).toBeUndefined();
    expect(parsed.status).toBe("pending");
  });

  it("throws when there is no payment id at all", () => {
    expect(() => parseMercadoPagoPayment({ status: "approved" })).toThrow(/id del pago/i);
  });
});

describe("parseMercadoPagoNotification", () => {
  it("reads the modern JSON webhook body", () => {
    const parsed = parseMercadoPagoNotification({ type: "payment", data: { id: "555" } });
    expect(parsed.providerRef).toBe("555");
    expect(parsed.topic).toBe("payment");
  });

  it("reads the legacy IPN query string", () => {
    const parsed = parseMercadoPagoNotification({}, { topic: "payment", id: "777" });
    expect(parsed.providerRef).toBe("777");
    expect(parsed.topic).toBe("payment");
  });

  it("recognises the two subscription topics", () => {
    expect(parseMercadoPagoNotification({ type: "subscription_preapproval", data: { id: "1" } }).topic)
      .toBe("subscription");
    expect(parseMercadoPagoNotification({ type: "subscription_authorized_payment", data: { id: "2" } }).topic)
      .toBe("subscription_payment");
  });

  it("keeps the provider action for diagnostics", () => {
    const parsed = parseMercadoPagoNotification({
      action: "preapproval.updated",
      type: "subscription_preapproval",
      data: { id: "1" },
    });
    expect(parsed.action).toBe("preapproval.updated");
  });

  it("buckets anything else as 'other' instead of guessing", () => {
    expect(parseMercadoPagoNotification({ type: "merchant_order", data: { id: "1" } }).topic).toBe("other");
    expect(parseMercadoPagoNotification({}).topic).toBe("other");
  });

  it("accepts a numeric id and returns undefined when absent", () => {
    expect(parseMercadoPagoNotification({ data: { id: 42 } }).providerRef).toBe("42");
    expect(parseMercadoPagoNotification({}).providerRef).toBeUndefined();
  });
});

describe("manual provider", () => {
  it("always includes the reference and the amount in the instructions", () => {
    const instructions = manualPaymentInstructions({
      reference: "LD-8F3A2B",
      amountCents: 2900,
      description: "Plan Pro (mensual)",
    });
    expect(instructions).toContain("LD-8F3A2B");
    expect(instructions).toContain("S/ 29.00");
    expect(instructions).toContain("Plan Pro (mensual)");
  });

  it("formats sub-sol decimals with two places", () => {
    const instructions = manualPaymentInstructions({
      reference: "LD-TEST01",
      amountCents: 49050,
      description: "Plan",
    });
    expect(instructions).toContain("S/ 490.50");
  });

  it("is configured out of the box and never redirects anywhere", async () => {
    const gateway = getGateway("manual");
    expect(gateway.isConfigured()).toBe(true);

    const result = await gateway.createCheckout(input);
    expect(result.redirectUrl).toBeNull();
    expect(result.providerRef).toBe("LD-8F3A2B");
    expect(result.instructions).toBeTruthy();
    expect(DEFAULT_MANUAL_DETAILS.length).toBeGreaterThan(0);
  });

  it("reports 'pending' because only a human can confirm a transfer", async () => {
    const status = await getGateway("manual").fetchStatus("LD-8F3A2B");
    expect(status.status).toBe("pending");
  });

  /**
   * Configuración → Datos de pago. These are the details a paying customer acts on,
   * and the checkout is what hands them over, so the gateway is where the
   * precedence between the console and the environment variable is pinned down.
   */
  it("prefers the details saved in the console over the environment text", () => {
    process.env.PAYMENTS_MANUAL_INSTRUCTIONS = "BCP soles 193-0000000-0-00";

    try {
      const instructions = manualPaymentInstructions(
        input,
        normalizePaymentDetails({
          holderName: "LibroDigital S.A.C.",
          yapeNumber: "999 888 777",
          bankAccounts: [
            { bank: "BCP", accountNumber: "193-1234567-0-12", cci: "002-193-001234567012-15" },
          ],
        }),
      );

      expect(instructions).toContain("Yape al 999 888 777 (a nombre de LibroDigital S.A.C.).");
      expect(instructions).toContain("CCI 002-193-001234567012-15");
      // The env var is the fallback, not a second opinion: it must not leak in.
      expect(instructions).not.toContain("193-0000000-0-00");
      // And never duplicated: the console block already carries reference + amount.
      expect(instructions.match(/LD-8F3A2B/g)?.length).toBe(2);
    } finally {
      delete process.env.PAYMENTS_MANUAL_INSTRUCTIONS;
    }
  });

  it("passes the console's details through when the gateway builds the checkout", async () => {
    const details = normalizePaymentDetails({ yapeNumber: "999 888 777" });
    const result = await getGateway("manual").createCheckout({ ...input, transferDetails: details });

    expect(result.instructions).toContain("Yape al 999 888 777");
    expect(result.redirectUrl).toBeNull();
  });
});

describe("gateway registry", () => {
  afterEach(() => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MERCADOPAGO_SANDBOX;
    delete process.env.PAYMENTS_MANUAL_INSTRUCTIONS;
  });

  it("reports mercadopago as unconfigured until its token exists", () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect(getGateway("mercadopago").isConfigured()).toBe(false);

    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-1234";
    expect(getGateway("mercadopago").isConfigured()).toBe(true);
  });

  it("keeps the not-yet-wired providers clearly disabled", () => {
    for (const id of ["culqi", "niubiz", "izipay"] as const) {
      expect(getGateway(id).isConfigured()).toBe(false);
    }
  });

  it("refuses to start a checkout with a provider that is not wired", async () => {
    await expect(getGateway("culqi").createCheckout(input)).rejects.toThrow(/no está habilitado/i);
  });

  it("lets PAYMENTS_MANUAL_INSTRUCTIONS override the default bank details", () => {
    process.env.PAYMENTS_MANUAL_INSTRUCTIONS = "BCP soles 123-4567890-0-11";
    const instructions = manualPaymentInstructions({
      reference: "LD-8F3A2B",
      amountCents: 2900,
      description: "Plan",
    });
    expect(instructions).toContain("BCP soles 123-4567890-0-11");
    expect(instructions).not.toContain(DEFAULT_MANUAL_DETAILS.split("\n")[0]);
  });
});

// ---------------------------------------------------------------------------
// Recurring subscriptions (preapproval) - the SaaS rail
// ---------------------------------------------------------------------------

const subscriptionInput: SubscriptionCheckoutInput = {
  reference: "LD-8F3A2B",
  amountCents: 2900,
  description: "Plan Pro (mensual)",
  planId: "profesional",
  period: "monthly",
  payerEmail: "admin@empresa.pe",
  businessName: "Empresa SAC",
  backUrl: "https://librodigital.pe/pagos?pago=ok&ref=LD-8F3A2B",
  notificationUrl: "https://librodigital.pe/api/payments/webhook/mercadopago",
};

describe("mercadopagoPreapprovalBody", () => {
  it("asks for a monthly automatic charge", () => {
    const body = mercadopagoPreapprovalBody(subscriptionInput) as any;
    expect(body.auto_recurring.frequency).toBe(1);
    expect(body.auto_recurring.frequency_type).toBe("months");
    expect(body.auto_recurring.currency_id).toBe("PEN");
  });

  it("converts céntimos back to the soles the API expects", () => {
    expect((mercadopagoPreapprovalBody(subscriptionInput) as any).auto_recurring.transaction_amount)
      .toBe(29);
  });

  it("expresses a yearly plan as 12 months", () => {
    const body = mercadopagoPreapprovalBody({ ...subscriptionInput, period: "annual" }) as any;
    expect(body.auto_recurring.frequency).toBe(12);
    expect(body.auto_recurring.frequency_type).toBe("months");
  });

  it("starts as pending so the customer still has to authorise it", () => {
    expect((mercadopagoPreapprovalBody(subscriptionInput) as any).status).toBe("pending");
  });

  it("carries our reference so every future charge can be traced back", () => {
    const body = mercadopagoPreapprovalBody(subscriptionInput) as any;
    expect(body.external_reference).toBe("LD-8F3A2B");
    expect(body.reason).toContain("Empresa SAC");
  });
});

describe("mapMercadoPagoSubscriptionStatus", () => {
  it("maps the four provider states", () => {
    expect(mapMercadoPagoSubscriptionStatus("authorized")).toBe("authorized");
    expect(mapMercadoPagoSubscriptionStatus("pending")).toBe("pending");
    expect(mapMercadoPagoSubscriptionStatus("paused")).toBe("paused");
    expect(mapMercadoPagoSubscriptionStatus("cancelled")).toBe("cancelled");
  });

  it("accepts the American spelling and junk without throwing", () => {
    expect(mapMercadoPagoSubscriptionStatus("canceled")).toBe("cancelled");
    expect(mapMercadoPagoSubscriptionStatus(undefined)).toBe("pending");
    expect(mapMercadoPagoSubscriptionStatus({ x: 1 })).toBe("pending");
  });
});

describe("parseMercadoPagoPreapproval", () => {
  const preapproval = {
    id: "2c938084726fca480172750000000000",
    status: "authorized",
    external_reference: "LD-8F3A2B",
    init_point: "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_id=1",
    next_payment_date: "2026-07-01T00:00:00.000Z",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 29,
      currency_id: "PEN",
    },
    // Must not survive into our records:
    payer_email: "cliente@empresa.pe",
    payer_id: 123456789,
  };

  it("reads the id, the authorisation URL and the confirmed amount", () => {
    const parsed = parseMercadoPagoPreapproval(preapproval);
    expect(parsed.providerRef).toBe("2c938084726fca480172750000000000");
    expect(parsed.status).toBe("authorized");
    expect(parsed.amountCents).toBe(2900);
    expect(parsed.initPoint).toContain("subscriptions/checkout");
  });

  it("records the next charge date the provider reports", () => {
    expect(parseMercadoPagoPreapproval(preapproval).nextPaymentAt?.toISOString())
      .toBe("2026-07-01T00:00:00.000Z");
  });

  it("leaves the next charge date undefined rather than inventing one", () => {
    const { next_payment_date: _omitted, ...withoutDate } = preapproval;
    expect(parseMercadoPagoPreapproval(withoutDate).nextPaymentAt).toBeUndefined();
  });

  it("drops the payer's personal data from the stored payload", () => {
    const parsed = parseMercadoPagoPreapproval(preapproval);
    expect(parsed.raw).not.toHaveProperty("payer_email");
    expect(parsed.raw).not.toHaveProperty("payer_id");
    expect(JSON.stringify(parsed.raw)).not.toContain("123456789");
    expect(parsed.raw.external_reference).toBe("LD-8F3A2B");
  });

  it("throws when there is no subscription id at all", () => {
    expect(() => parseMercadoPagoPreapproval({ status: "authorized" })).toThrow(/id de la suscripción/i);
  });

  it("keeps the panel plan code and the payer email available for matching", () => {
    const parsed = parseMercadoPagoPreapproval({
      ...preapproval,
      preapproval_plan_id: "plan-abc",
      payer_email: "dueno@empresa.pe",
    });

    // These two are what let an unknown subscription be recognised.
    expect(parsed.externalReference).toBe("LD-8F3A2B");
    expect(parsed.payerEmail).toBe("dueno@empresa.pe");
    expect(parsed.planRef).toBe("plan-abc");
  });

  it("still keeps the payer email out of the stored payload", () => {
    const parsed = parseMercadoPagoPreapproval({
      ...preapproval,
      payer_email: "dueno@empresa.pe",
      preapproval_plan_id: "plan-abc",
    });
    expect(parsed.raw).not.toHaveProperty("payer_email");
    expect(JSON.stringify(parsed.raw)).not.toContain("dueno@empresa.pe");
    // The plan id is not personal data, so it is kept for diagnostics.
    expect(parsed.raw.preapproval_plan_id).toBe("plan-abc");
  });

  it("reports the billing period the provider is actually using", () => {
    expect(parseMercadoPagoPreapproval(preapproval).period).toBe("monthly");
    expect(parseMercadoPagoPreapproval({
      ...preapproval,
      auto_recurring: { ...preapproval.auto_recurring, frequency: 12 },
    }).period).toBe("annual");
  });
});

describe("periodFromRecurrence", () => {
  it("treats a monthly frequency as monthly", () => {
    expect(periodFromRecurrence(1, "months")).toBe("monthly");
    expect(periodFromRecurrence(3, "months")).toBe("monthly");
  });

  it("treats twelve months (and a year) as annual", () => {
    expect(periodFromRecurrence(12, "months")).toBe("annual");
    expect(periodFromRecurrence(1, "years")).toBe("annual");
  });

  it("is case-insensitive and falls back to monthly on junk", () => {
    expect(periodFromRecurrence("12", "Months")).toBe("annual");
    expect(periodFromRecurrence(undefined, undefined)).toBe("monthly");
    expect(periodFromRecurrence("abc", "months")).toBe("monthly");
  });
});

describe("parseMercadoPagoAuthorizedPayment", () => {
  it("links the charge to its agreement and its payment", () => {
    const parsed = parseMercadoPagoAuthorizedPayment({
      id: "invoice-1",
      preapproval_id: "preapproval-1",
      status: "processed",
      payment: { id: 555, status: "approved" },
    });
    expect(parsed.subscriptionRef).toBe("preapproval-1");
    expect(parsed.paymentRef).toBe("555");
  });

  it("tolerates an invoice that has not produced a payment yet", () => {
    const parsed = parseMercadoPagoAuthorizedPayment({
      id: "invoice-2",
      preapproval_id: "preapproval-1",
      status: "scheduled",
    });
    expect(parsed.subscriptionRef).toBe("preapproval-1");
    expect(parsed.paymentRef).toBeUndefined();
  });

  it("reports no agreement when the field is missing", () => {
    expect(parseMercadoPagoAuthorizedPayment({ id: "x" }).subscriptionRef).toBeUndefined();
  });
});

describe("recurring capability of the gateway registry", () => {
  it("only claims recurring support for Mercado Pago", () => {
    expect(getGateway("mercadopago").supportsRecurring()).toBe(true);
    expect(getGateway("manual").supportsRecurring()).toBe(false);
    expect(getGateway("culqi").supportsRecurring()).toBe(false);
    expect(getGateway("niubiz").supportsRecurring()).toBe(false);
    expect(getGateway("izipay").supportsRecurring()).toBe(false);
  });

  it("refuses to create a subscription with a provider that cannot recur", async () => {
    await expect(getGateway("manual").createSubscription(subscriptionInput))
      .rejects.toThrow(/cobro automático/i);
  });
});
