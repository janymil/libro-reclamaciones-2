import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The customer's receipt.
 *
 * It is sent from our own system rather than by the payment provider (Mercado
 * Pago cannot deliver anything to a test user's mailbox, and a bank transfer has
 * no provider email at all), so it has to fire exactly when a payment becomes
 * payable - and carry the money it actually credited, because that message is
 * what a customer keeps as proof.
 */

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(),
    getBusiness: vi.fn(),
    updatePayment: vi.fn(),
    updateBusiness: vi.fn(),
  },
}));

vi.mock("./emailService", () => ({
  emailService: { sendPaymentReceipt: vi.fn().mockResolvedValue(undefined) },
}));

import type { Payment } from "@shared/schema";
import { settlePayment } from "./paymentService";
import { storage } from "../storage";
import { emailService } from "./emailService";

const mockedStorage = storage as unknown as {
  getUser: ReturnType<typeof vi.fn>;
  getBusiness: ReturnType<typeof vi.fn>;
  updatePayment: ReturnType<typeof vi.fn>;
  updateBusiness: ReturnType<typeof vi.fn>;
};
const mockedEmail = emailService as unknown as { sendPaymentReceipt: ReturnType<typeof vi.fn> };

const payment = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: "p1",
    businessId: "b1",
    userId: "u1",
    provider: "mercadopago",
    method: null,
    providerRef: "mp-1",
    reference: "LD-8F3A2B",
    planId: "profesional",
    period: "monthly",
    amountCents: 2900,
    currency: "PEN",
    status: "pending",
    redirectUrl: null,
    failureReason: null,
    raw: null,
    paidAt: null,
    confirmedByUserId: null,
    subscriptionId: null,
    createdAt: new Date("2026-10-16T12:00:00.000Z"),
    updatedAt: new Date("2026-10-16T12:00:00.000Z"),
    ...overrides,
  }) as Payment;

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.getUser.mockResolvedValue({
    id: "u1",
    email: "ana@empresa.pe",
    firstName: "Ana",
  });
  mockedStorage.getBusiness.mockResolvedValue({
    id: "b1",
    businessName: "Empresa SAC",
    // Midday UTC so the Peru calendar date is unambiguous.
    currentPeriodEnd: new Date("2026-11-16T12:00:00.000Z"),
  });
  mockedStorage.updatePayment.mockImplementation(
    async (_id: string, changes: Record<string, unknown>) => ({ ...payment(), ...changes }),
  );
  mockedStorage.updateBusiness.mockResolvedValue(undefined);
});

describe("the customer's receipt", () => {
  it("is emailed when a payment is confirmed, with the amount it credited", async () => {
    await settlePayment(payment(), "paid", 2900);

    await vi.waitFor(() => expect(mockedEmail.sendPaymentReceipt).toHaveBeenCalledTimes(1));

    expect(mockedEmail.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@empresa.pe",
        firstName: "Ana",
        businessName: "Empresa SAC",
        reference: "LD-8F3A2B",
        amountLabel: "S/ 29.00",
        periodLabel: "mensual",
        methodName: "Mercado Pago",
        planName: expect.any(String),
        validUntilLabel: "2026-11-16",
      }),
    );
  });

  it("writes the plan under the column name Drizzle actually persists", async () => {
    await settlePayment(payment(), "paid", 2900);

    // A key that is not a real column is dropped silently by Drizzle, which is how
    // a paying customer kept the plan they already had while their period was
    // credited. Assert the column names, not the shape we wish we had.
    const [, updates] = mockedStorage.updateBusiness.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(Object.keys(updates).sort()).toEqual([
      "currentPeriodEnd",
      "planPeriod",
      "subscriptionPlan",
      "subscriptionStatus",
    ]);
    expect(updates.subscriptionPlan).toBe("profesional");
    expect(updates.subscriptionStatus).toBe("active");
  });

  it("is not emailed while the payment is still pending", async () => {
    await settlePayment(payment(), "pending");

    expect(mockedEmail.sendPaymentReceipt).not.toHaveBeenCalled();
  });

  it("never fails the settlement when the receipt cannot be delivered", async () => {
    mockedEmail.sendPaymentReceipt.mockRejectedValueOnce(new Error("smtp down"));

    await expect(settlePayment(payment(), "paid", 2900)).resolves.toBeTruthy();
    expect(mockedStorage.updateBusiness).toHaveBeenCalled();
  });
});
