import { describe, expect, it } from "vitest";

import {
  companyNamesMatch,
  isRucActive,
  normalizeCompanyName,
  stripLegalSuffix,
} from "./ruc";

/**
 * The name comparison that lets a factura through.
 *
 * Too strict and a customer with "ACME S.A.C." cannot invoice because SUNAT
 * says "ACME SOCIEDAD ANONIMA CERRADA"; too loose and a typo/another company's
 * name passes. These cases pin both ends.
 */
describe("normalizeCompanyName / stripLegalSuffix", () => {
  it("removes accents, punctuation and extra spaces", () => {
    expect(normalizeCompanyName("  Distribuidora Ñandú, S.A.C.  ")).toBe(
      "DISTRIBUIDORA NANDU S A C",
    );
  });

  it("drops the legal form at the end", () => {
    expect(stripLegalSuffix("ACME S.A.C.")).toBe("ACME");
    expect(stripLegalSuffix("ACME SOCIEDAD ANONIMA CERRADA")).toBe("ACME");
    expect(stripLegalSuffix("ACME S.R.L.")).toBe("ACME");
    expect(stripLegalSuffix("ACME E.I.R.L.")).toBe("ACME");
  });

  it("keeps a legal word that is part of the actual name", () => {
    expect(stripLegalSuffix("SOCIEDAD DE BENEFICIO")).toBe("SOCIEDAD DE BENEFICIO");
  });
});

describe("companyNamesMatch", () => {
  it("accepts the same name with and without the legal form", () => {
    expect(companyNamesMatch("ACME S.A.C.", "ACME SOCIEDAD ANONIMA CERRADA")).toBe(true);
    expect(companyNamesMatch("SUPERMERCADOS PERUANOS", "SUPERMERCADOS PERUANOS SOCIEDAD ANONIMA")).toBe(true);
  });

  it("accepts a recognized short form of the SUNAT name", () => {
    expect(companyNamesMatch("BANCO DE CREDITO", "BANCO DE CREDITO DEL PERU")).toBe(true);
    expect(companyNamesMatch("RIMAC SEGUROS", "RIMAC SEGUROS Y REASEGUROS")).toBe(true);
  });

  it("rejects a different company", () => {
    expect(companyNamesMatch("EMPRESA X", "EMPRESA Y")).toBe(false);
    expect(companyNamesMatch("ACME", "GLOBEX")).toBe(false);
  });

  it("rejects a one-word fragment that is too short to identify anyone", () => {
    expect(companyNamesMatch("PERU", "BANCO DE CREDITO DEL PERU")).toBe(false);
    expect(companyNamesMatch("SAN", "SAN FERNANDO S.A.")).toBe(false);
  });

  it("is symmetric", () => {
    const a = "ACME SOCIEDAD ANONIMA CERRADA";
    const b = "ACME S.A.C.";
    expect(companyNamesMatch(a, b)).toBe(companyNamesMatch(b, a));
  });
});

describe("isRucActive", () => {
  it("accepts an active, habido RUC", () => {
    expect(isRucActive("ACTIVO", "HABIDO")).toBe(true);
    expect(isRucActive("activo", "habido")).toBe(true);
  });

  it("rejects an explicit baja or no habido", () => {
    expect(isRucActive("BAJA", "HABIDO")).toBe(false);
    expect(isRucActive("ACTIVO", "NO HABIDO")).toBe(false);
  });

  it("does not block when the provider omitted the status", () => {
    expect(isRucActive(null, null)).toBe(true);
    expect(isRucActive(undefined, undefined)).toBe(true);
  });
});
