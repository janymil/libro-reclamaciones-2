import { describe, it, expect } from "vitest";

import {
  matchDepartment,
  matchDistrict,
  matchProvince,
  normalizeLocationName,
  resolvePeruLocation,
} from "./location-matcher";

/**
 * The RUC lookup providers republish SUNAT's strings, which are close to but not
 * identical to the local ubigeo dataset (`PROV. CONST. DEL CALLAO`, accents,
 * `PROV.`/`DIST.` prefixes, spacing). A strict `includes()` fails silently, the
 * select stays empty and the user is asked to retype data the lookup already
 * returned - these tests pin down the tolerant matching, and that it never
 * invents a location that is not in the dataset.
 */

describe("normalizeLocationName", () => {
  it("folds case, accents, punctuation and spacing", () => {
    expect(normalizeLocationName("  Miraflores ")).toBe("MIRAFLORES");
    expect(normalizeLocationName("SAN MARTÍN")).toBe("SAN MARTIN");
    expect(normalizeLocationName("SAN   JUAN  DE LURIN")).toBe("SAN JUAN DE LURIN");
    expect(normalizeLocationName("AUGUSTO ANGULO 130, URB.")).toBe("AUGUSTO ANGULO 130 URB");
    expect(normalizeLocationName(null)).toBe("");
    expect(normalizeLocationName(undefined)).toBe("");
  });

  it("drops SUNAT's administrative noise", () => {
    expect(normalizeLocationName("PROV. CONST. DEL CALLAO")).toBe("CALLAO");
    expect(normalizeLocationName("Provincia Constitucional del Callao")).toBe("CALLAO");
    expect(normalizeLocationName("DISTRITO DE MIRAFLORES")).toBe("MIRAFLORES");
    expect(normalizeLocationName("PROV. CAÑETE")).toBe("CANETE");
    expect(normalizeLocationName("DEPARTAMENTO DE LIMA")).toBe("LIMA");
  });

  it("keeps leading articles, which are part of real names", () => {
    expect(normalizeLocationName("EL COLLAO")).toBe("EL COLLAO");
    expect(normalizeLocationName("LA CONVENCION")).toBe("LA CONVENCION");
  });
});

describe("matchDepartment / matchProvince / matchDistrict", () => {
  it("resolves the payload of a real lookup (Cencosud, 20109072177)", () => {
    expect(
      resolvePeruLocation({ departamento: "LIMA", provincia: "LIMA", distrito: "MIRAFLORES" }),
    ).toEqual({ departamento: "LIMA", provincia: "LIMA", distrito: "MIRAFLORES" });
  });

  it("resolves SUNAT's Callao spelling", () => {
    expect(matchDepartment("CALLAO")).toBe("CALLAO");
    expect(matchProvince("CALLAO", "PROV. CONST. DEL CALLAO")).toBe("PROV. CONST. DEL CALLAO");
    expect(matchDistrict("CALLAO", "PROV. CONST. DEL CALLAO", "BELLAVISTA")).toBe("BELLAVISTA");
  });

  it("tolerates case and accents coming from the provider", () => {
    expect(matchDepartment("Lima")).toBe("LIMA");
    expect(matchProvince("LIMA", "Cañete")).toBe("CAÑETE");
    expect(matchDistrict("LIMA", "CAÑETE", "San Vicente de Cañete")).toBe("SAN VICENTE DE CAÑETE");
  });

  it("never invents a location that is not in the dataset", () => {
    expect(matchDepartment("ATLANTIDA")).toBeNull();
    // Miraflores is a district, not a province of Lima.
    expect(matchProvince("LIMA", "MIRAFLORES")).toBeNull();
    expect(matchDistrict("LIMA", "LIMA", "ATLANTIDA")).toBeNull();
  });

  it("keeps the cascade consistent", () => {
    // A recognised department plus an unrecognised province leaves the lower
    // levels empty instead of mixing values from different departments.
    expect(
      resolvePeruLocation({ departamento: "LIMA", provincia: "NOPE", distrito: "MIRAFLORES" }),
    ).toEqual({ departamento: "LIMA", provincia: null, distrito: null });

    expect(resolvePeruLocation({ departamento: "LIMA" })).toEqual({
      departamento: "LIMA",
      provincia: null,
      distrito: null,
    });

    expect(resolvePeruLocation({ departamento: "", provincia: "LIMA", distrito: "LIMA" })).toEqual({
      departamento: null,
      provincia: null,
      distrito: null,
    });
  });
});
