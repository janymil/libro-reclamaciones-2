import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "Verificar ahora" in Pagos.
 *
 * A Checkout Pro reference is the id of the *preference* we created, not of a
 * payment - so asking the payments endpoint about it can only answer 404. That used
 * to reach the customer as "No se pudo verificar el pago con el proveedor" for a
 * payment that had simply not been made yet. These tests pin down which handle is
 * used for which kind of row, and that an unpaid preference stays pending instead
 * of failing.
 */

const gateway = {
  isConfigured: () => true,
  fetchStatus: vi.fn(),
  findPaymentByReference: vi.fn(),
};

vi.mock("./paymentGateway", () => ({
  getGateway: () => gateway,
}));

vi.mock("../storage", () => ({
  storage: {
    getPayment: vi.fn(),
    getUser: vi.fn(),
    getBusiness: vi.fn(),
    updatePayment: vi.fn(),
    updateBusiness: vi.fn(),
  },
}));

vi.mock("./emailService", () => ({
  emailService: { sendPaymentReceipt: vi.fn().mockResolvedValue(undefined) },
}));

import { refreshPayment } from "./paymentService";
import { storage } from "../storage";
import { emailService } from "./emailService";

const mockedStorage = storage as unknown as Record<string, ReturnType<typeof vi.fn>>;

const payment = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  businessId: "b1",
  userId: "u1",
  provider: "mercadopago",
  reference: "LD-AAA111",
  providerRef: "359456108-abc",
  planId: "profesional",
  period: "monthly",
  amountCents: 2900,
  status: "pending",
  subscriptionId: null,
  raw: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.updatePayment.mockImplementation(
    async (_id: string, changes: Record<string, unknown>) => ({ ...payment(), ...changes }),
  );
  mockedStorage.getUser.mockResolvedValue({ id: "u1", email: "ana@empresa.pe", firstName: "Ana" });
  mockedStorage.getBusiness.mockResolvedValue({ id: "b1", businessName: "Empresa SAC" });
  mockedStorage.updateBusiness.mockResolvedValue(undefined);
  vi.mocked(emailService.sendPaymentReceipt).mockResolvedValue(undefined);
});

describe("refreshPayment - which handle the provider is asked about", () => {
  it("asks by our own reference for a one-time payment, whose stored id is a preference", async () => {
    mockedStorage.getPayment.mockResolvedValue(payment());
    gateway.findPaymentByReference.mockResolvedValue({
      providerRef: "123456",
      status: "paid",
      amountCents: 2900,
      raw: {},
    });

    const result = await refreshPayment("p1");

    expect(gateway.findPaymentByReference).toHaveBeenCalledWith("LD-AAA111");
    expect(gateway.fetchStatus).not.toHaveBeenCalled();
    expect(result?.status).toBe("paid");
  });

  it("keeps an unpaid preference pending instead of reporting a provider error", async () => {
    mockedStorage.getPayment.mockResolvedValue(payment());
    gateway.findPaymentByReference.mockResolvedValue(undefined);

    const result = await refreshPayment("p1");

    expect(result?.status).toBe("pending");
    expect(mockedStorage.updateBusiness).not.toHaveBeenCalled();
  });

  it("asks by transaction id for a recurring charge", async () => {
    mockedStorage.getPayment.mockResolvedValue(payment({ subscriptionId: "s1", providerRef: "999" }));
    mockedStorage.updatePayment.mockImplementation(
      async (_id: string, changes: Record<string, unknown>) => ({
        ...payment({ subscriptionId: "s1", providerRef: "999" }),
        ...changes,
      }),
    );
    gateway.fetchStatus.mockResolvedValue({
      providerRef: "999",
      status: "paid",
      amountCents: 2900,
      raw: {},
    });

    await refreshPayment("p1");

    expect(gateway.fetchStatus).toHaveBeenCalledWith("999");
    expect(gateway.findPaymentByReference).not.toHaveBeenCalled();
  });

  it("does nothing at all for a payment that is already settled", async () => {
    mockedStorage.getPayment.mockResolvedValue(payment({ status: "paid" }));

    await refreshPayment("p1");

    expect(gateway.fetchStatus).not.toHaveBeenCalled();
    expect(gateway.findPaymentByReference).not.toHaveBeenCalled();
  });
});
