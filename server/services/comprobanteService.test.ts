import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The manual-emission flow, tested where it actually breaks: the snapshot taken
 * when the payment lands, the idempotency that stops a retried webhook from
 * creating a second invoice, and the guards around the correlativo.
 */

vi.mock("../storage", () => ({
  storage: {
    getComprobanteByPaymentId: vi.fn(),
    getComprobante: vi.fn(),
    getComprobanteByNumber: vi.fn(),
    createComprobante: vi.fn(),
    updateComprobante: vi.fn(),
    maxComprobanteNumber: vi.fn(),
    getBusinessById: vi.fn(),
    getBusiness: vi.fn(),
    getUser: vi.fn(),
    getUsersByBusinessIds: vi.fn(),
  },
}));

vi.mock("./emailService", () => ({
  emailService: { sendComprobanteIssued: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("./platformSettingsService", () => ({
  getIdentity: vi.fn().mockResolvedValue(undefined),
}));

import type { Business, Comprobante, Payment } from "@shared/schema";

import { storage } from "../storage";
import {
  ensureComprobanteForPayment,
  markComprobanteEmitted,
  resolveBillingForPayment,
  voidComprobante,
} from "./comprobanteService";

const mocked = storage as unknown as Record<string, ReturnType<typeof vi.fn>>;

const business = (overrides: Partial<Business> = {}) =>
  ({
    id: "b1",
    ruc: "20131312955",
    businessName: "Empresa SAC",
    address: "Av. Lima 123",
    distrito: "Miraflores",
    provincia: "Lima",
    departamento: "Lima",
    billingDocType: "factura",
    billingEmail: null,
    billingDni: null,
    ...overrides,
  }) as unknown as Business;

const payment = (overrides: Partial<Payment> = {}) =>
  ({
    id: "p1",
    businessId: "b1",
    userId: "u1",
    provider: "mercadopago",
    method: "tarjeta",
    reference: "LD-ABC123",
    planId: "profesional",
    period: "annual",
    amountCents: 18900,
    currency: "PEN",
    status: "paid",
    billingDocType: "factura",
    billingDocNumber: "20131312955",
    billingName: "Empresa SAC",
    billingAddress: "Av. Lima 123, Miraflores, Lima, Lima",
    billingEmail: "facturas@empresa.pe",
    ...overrides,
  }) as unknown as Payment;

const comprobante = (overrides: Partial<Comprobante> = {}) =>
  ({
    id: "c1",
    paymentId: "p1",
    businessId: "b1",
    docType: "factura",
    status: "pendiente",
    serie: null,
    number: null,
    issueDate: null,
    customerDocType: "6",
    customerDocNumber: "20131312955",
    customerName: "Empresa SAC",
    customerAddress: "Av. Lima 123, Miraflores, Lima, Lima",
    customerEmail: "facturas@empresa.pe",
    description: "Servicio de Libro de Reclamaciones virtual - Plan Pro (anual)",
    subtotalCents: 16017,
    igvCents: 2883,
    totalCents: 18900,
    igvRateBps: 1800,
    currency: "PEN",
    paymentMethod: "Tarjeta de crédito o débito",
    pdfPath: null,
    xmlPath: null,
    pdfOriginalName: null,
    xmlOriginalName: null,
    emittedAt: null,
    emittedByUserId: null,
    emailSentAt: null,
    notes: null,
    createdAt: new Date("2026-10-18T12:00:00.000Z"),
    updatedAt: new Date("2026-10-18T12:00:00.000Z"),
    ...overrides,
  }) as unknown as Comprobante;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getComprobanteByPaymentId.mockResolvedValue(undefined);
  mocked.getBusinessById.mockResolvedValue(business());
  mocked.getUser.mockResolvedValue({ id: "u1", email: "ana@empresa.pe", role: "admin" });
  mocked.getUsersByBusinessIds.mockResolvedValue([]);
  mocked.createComprobante.mockImplementation(async (data: Record<string, unknown>) =>
    comprobante(data as Partial<Comprobante>),
  );
});

describe("ensureComprobanteForPayment", () => {
  it("creates one pending factura with the IGV broken out of the amount charged", async () => {
    const created = await ensureComprobanteForPayment(payment());

    expect(created?.status).toBe("pendiente");
    expect(mocked.createComprobante).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "p1",
        businessId: "b1",
        docType: "factura",
        status: "pendiente",
        customerDocType: "6",
        customerDocNumber: "20131312955",
        customerName: "Empresa SAC",
        subtotalCents: 16017,
        igvCents: 2883,
        totalCents: 18900,
        igvRateBps: 1800,
        currency: "PEN",
      }),
    );
  });

  it("is idempotent: a retried webhook reuses the row instead of invoicing twice", async () => {
    mocked.getComprobanteByPaymentId.mockResolvedValue(comprobante({ status: "emitido" }));

    const result = await ensureComprobanteForPayment(payment());

    expect(result?.status).toBe("emitido");
    expect(mocked.createComprobante).not.toHaveBeenCalled();
  });

  it("does nothing while the payment is not paid", async () => {
    await expect(ensureComprobanteForPayment(payment({ status: "pending" }))).resolves.toBeNull();
    expect(mocked.createComprobante).not.toHaveBeenCalled();
  });

  it("emits a boleta to consumidor final without borrowing the company name", async () => {
    mocked.getBusinessById.mockResolvedValue(business({ billingDocType: "boleta" }));

    await ensureComprobanteForPayment(
      payment({
        billingDocType: "boleta",
        billingDocNumber: null,
        billingName: null,
        billingAddress: null,
        billingEmail: null,
      }),
    );

    expect(mocked.createComprobante).toHaveBeenCalledWith(
      expect.objectContaining({
        docType: "boleta",
        customerDocType: "0",
        customerDocNumber: "",
        customerName: "Consumidor final",
        customerAddress: null,
        customerEmail: "ana@empresa.pe",
      }),
    );
  });
});

describe("resolveBillingForPayment", () => {
  it("falls back to the company profile for a factura", () => {
    expect(
      resolveBillingForPayment(
        payment({
          billingDocType: null,
          billingDocNumber: null,
          billingName: null,
          billingAddress: null,
          billingEmail: null,
        }),
        business(),
        "ana@empresa.pe",
      ),
    ).toEqual({
      docType: "factura",
      docNumber: "20131312955",
      name: "Empresa SAC",
      address: "Av. Lima 123, Miraflores, Lima, Lima",
      email: "ana@empresa.pe",
    });
  });

  it("does not put the company's razón social on a boleta", () => {
    const billing = resolveBillingForPayment(
      payment({
        billingDocType: "boleta",
        billingDocNumber: null,
        billingName: null,
        billingAddress: null,
        billingEmail: null,
      }),
      business(),
      "ana@empresa.pe",
    );

    expect(billing.name).toBe("");
    expect(billing.address).toBe("");
  });
});

describe("markComprobanteEmitted", () => {
  const input = { number: "123", serie: "F001", actorUserId: "admin1" };

  beforeEach(() => {
    mocked.getComprobanteByNumber.mockResolvedValue(undefined);
    mocked.updateComprobante.mockImplementation(
      async (_id: string, changes: Record<string, unknown>) => comprobante(changes as Partial<Comprobante>),
    );
  });

  it("stores the eight-digit correlativo and marks the row emitido", async () => {
    mocked.getComprobante.mockResolvedValue(comprobante());

    const result = await markComprobanteEmitted("c1", input);

    expect(result.number).toBe("00000123");
    expect(mocked.updateComprobante).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ status: "emitido", serie: "F001", number: "00000123" }),
    );
  });

  it("refuses a correlativo already used in the same serie", async () => {
    mocked.getComprobante.mockResolvedValue(comprobante());
    mocked.getComprobanteByNumber.mockResolvedValue(comprobante({ id: "c2" }));

    await expect(markComprobanteEmitted("c1", input)).rejects.toThrow(/ya está registrado/);
  });

  it("refuses to change the number of an already emitted comprobante", async () => {
    mocked.getComprobante.mockResolvedValue(
      comprobante({ status: "emitido", serie: "F001", number: "00000123" }),
    );

    await expect(
      markComprobanteEmitted("c1", { number: "124", serie: "F001", actorUserId: "admin1" }),
    ).rejects.toThrow(/no se puede cambiar/);
  });
});

describe("voidComprobante", () => {
  it("marks the row anulado and keeps the reason", async () => {
    mocked.getComprobante.mockResolvedValue(
      comprobante({ status: "emitido", serie: "F001", number: "00000123" }),
    );
    mocked.updateComprobante.mockImplementation(
      async (_id: string, changes: Record<string, unknown>) => comprobante(changes as Partial<Comprobante>),
    );

    const result = await voidComprobante("c1", "devolución", "admin1");

    expect(result.status).toBe("anulado");
    expect(result.notes).toBe("devolución");
  });
});
