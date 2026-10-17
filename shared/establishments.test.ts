import { describe, expect, it } from "vitest";

import {
  firstIdentificationCode,
  isOnlineChannel,
  nextIdentificationCode,
  sucursalCode,
} from "./establishments";

/**
 * Establishment rules shared by the server (which provisions the first local)
 * and the client (which previews it and suggests the next code).
 */
describe("firstIdentificationCode", () => {
  it("gives an online store the virtual channel", () => {
    // Selling over the Internet only requires the Libro to be reachable from that
    // medium, so there is no physical sucursal to number.
    expect(firstIdentificationCode("tienda_virtual")).toBe("ONLINE-01");
    expect(isOnlineChannel("tienda_virtual")).toBe(true);
  });

  it("gives every other channel a physical sucursal", () => {
    for (const channel of ["local_fisico", "servicios", "mixto", undefined, null, ""]) {
      expect(firstIdentificationCode(channel)).toBe("SUC-001");
      expect(isOnlineChannel(channel)).toBe(false);
    }
  });
});

describe("nextIdentificationCode", () => {
  it("starts at SUC-001 when the tenant has no sucursales", () => {
    expect(nextIdentificationCode([])).toBe("SUC-001");
  });

  it("continues after the highest number in use", () => {
    expect(nextIdentificationCode(["SUC-001"])).toBe("SUC-002");
    expect(nextIdentificationCode(["SUC-001", "SUC-002", "SUC-005"])).toBe("SUC-006");
  });

  it("ignores the online channel and whatever a human typed", () => {
    // An online store's ONLINE-01 does not consume a physical number, and a
    // free-text code must not break the sequence (nor throw).
    expect(nextIdentificationCode(["ONLINE-01", "MATRIZ", "SUC-002"])).toBe("SUC-003");
  });

  it("pads to three digits and keeps counting past 999", () => {
    expect(sucursalCode(7)).toBe("SUC-007");
    expect(nextIdentificationCode(["SUC-999"])).toBe("SUC-1000");
  });
});
