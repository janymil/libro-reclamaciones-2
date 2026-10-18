import { describe, expect, it } from "vitest";

import {
  COMPROBANTE_DOC_TYPES,
  buildComprobanteDescription,
  formatComprobanteNumber,
  formatDataSheet,
  getComprobanteDocType,
  isValidDni,
  isValidRuc,
  normalizeBilling,
  normalizeComprobanteNumber,
  normalizeSerie,
  validateBilling,
  type BillingData,
} from "./comprobantes";

/**
 * The rules that keep a manually issued comprobante acceptable to SUNAT:
 * a valid RUC on a factura, the right document code, and a number in the
 * F001-00000001 shape. Getting any of them wrong means the customer paid and
 * the invoice is rejected.
 */
describe("RUC and DNI", () => {
  it("accepts real RUCs", () => {
    // The operator's own RUC and SUNAT's.
    expect(isValidRuc("10411592982")).toBe(true);
    expect(isValidRuc("20131312955")).toBe(true);
  });

  it("rejects a RUC with a wrong check digit or length", () => {
    expect(isValidRuc("10411592983")).toBe(false);
    expect(isValidRuc("1041159298")).toBe(false);
    expect(isValidRuc("")).toBe(false);
    expect(isValidRuc("abcdefghijk")).toBe(false);
  });

  it("validates DNIs as eight digits", () => {
    expect(isValidDni("12345678")).toBe(true);
    expect(isValidDni("1234567")).toBe(false);
    expect(isValidDni("123456789")).toBe(false);
  });
});

describe("billing validation", () => {
  const factura: BillingData = {
    docType: "factura",
    docNumber: "10411592982",
    name: "Servicios SAAS",
    address: "Av. Siempre Viva 123, Lima",
    email: "facturas@librodigital.pe",
  };

  it("accepts a complete factura", () => {
    expect(validateBilling(factura)).toEqual([]);
  });

  it("requires RUC, razón social, address and email on a factura", () => {
    const errors = validateBilling({ ...factura, docNumber: "", name: "", address: "" });
    expect(errors).toHaveLength(3);
    expect(errors.join(" ")).toContain("RUC");
    expect(errors.join(" ")).toContain("razón social");
    expect(errors.join(" ")).toContain("domicilio");
  });

  it("allows a boleta to consumidor final, without DNI", () => {
    expect(
      validateBilling({
        docType: "boleta",
        docNumber: "",
        name: "",
        address: "",
        email: "cliente@example.com",
      }),
    ).toEqual([]);
  });

  it("rejects a malformed DNI but not an empty one", () => {
    const base: BillingData = { ...factura, docType: "boleta", docNumber: "123" };
    expect(validateBilling(base).join(" ")).toContain("DNI");
  });

  it("always requires a valid email", () => {
    expect(validateBilling({ ...factura, email: "" }).join(" ")).toContain("correo");
    expect(validateBilling({ ...factura, email: "no-es-correo" }).join(" ")).toContain(
      "correo del comprobante",
    );
  });
});

describe("normalizeBilling", () => {
  it("trims, lowercases the email and keeps only digits in the document", () => {
    const billing = normalizeBilling({
      docType: "factura",
      docNumber: " 10-411 592 982 ",
      name: "  Servicios SAAS  ",
      address: "  Av. Lima 123  ",
      email: "  FACTURAS@LibroDigital.pe ",
    });

    expect(billing.docNumber).toBe("10411592982");
    expect(billing.name).toBe("Servicios SAAS");
    expect(billing.email).toBe("facturas@librodigital.pe");
  });

  it("falls back to a factura when the type is unknown", () => {
    expect(normalizeBilling({ docNumber: "10411592982" }).docType).toBe("factura");
    expect(normalizeBilling({ docType: "ticket" }, { docType: "boleta" }).docType).toBe("boleta");
  });

  it("turns anything that is not an object into empty fields", () => {
    expect(normalizeBilling(null)).toEqual({
      docType: "factura",
      docNumber: "",
      name: "",
      address: "",
      email: "",
    });
  });
});

describe("numbering", () => {
  it("prints the correlative with eight digits", () => {
    expect(formatComprobanteNumber("F001", "123")).toBe("F001-00000123");
    expect(formatComprobanteNumber("B001", "1")).toBe("B001-00000001");
  });

  it("normalizes the serie and the number", () => {
    expect(normalizeSerie(" f001 ", "F001")).toBe("F001");
    expect(normalizeSerie("", "B001")).toBe("B001");
    expect(normalizeComprobanteNumber(" 0000123 ")).toBe("0000123");
  });

  it("uses the SUNAT codes for each document type", () => {
    expect(COMPROBANTE_DOC_TYPES.factura.code).toBe("01");
    expect(COMPROBANTE_DOC_TYPES.boleta.code).toBe("03");
    expect(COMPROBANTE_DOC_TYPES.factura.customerDocTypeCode).toBe("6");
    expect(getComprobanteDocType("boleta").defaultSerie).toBe("B001");
    expect(getComprobanteDocType(undefined).id).toBe("factura");
  });
});

describe("text the operator copies into SUNAT", () => {
  it("describes the service and the plan", () => {
    expect(buildComprobanteDescription({ planName: "Pro", period: "annual" })).toBe(
      "Servicio de Libro de Reclamaciones virtual - Plan Pro (anual)",
    );
  });

  it("includes the buyer, the base, the IGV and the total", () => {
    const sheet = formatDataSheet({
      docType: "factura",
      docNumber: "10411592982",
      name: "Servicios SAAS",
      address: "Av. Lima 123",
      email: "facturas@librodigital.pe",
      description: "Servicio de Libro de Reclamaciones virtual - Plan Pro (anual)",
      issueDate: "2026-10-18",
      subtotalCents: 16017,
      igvCents: 2883,
      totalCents: 18900,
      rateBps: 1800,
      paymentReference: "LD-ABC123",
      paymentMethodLabel: "Tarjeta de crédito",
    });

    expect(sheet).toContain("Factura electrónica (código 01)");
    expect(sheet).toContain("RUC 10411592982");
    expect(sheet).toContain("Valor de venta (sin IGV): S/ 160.17");
    expect(sheet).toContain("IGV (18%): S/ 28.83");
    expect(sheet).toContain("Total: S/ 189.00");
    expect(sheet).toContain("LD-ABC123");
  });
});
