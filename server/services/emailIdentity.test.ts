import { describe, it, expect } from "vitest";

import { identityFooterLines } from "./emailService";

/**
 * The platform identity footer on receipts and alerts (Configuración → Identidad).
 *
 * A receipt is a document: the two things that must never happen are inventing fiscal
 * data (a RUC or an address nobody typed) and silently changing what the messages said
 * before the identity became editable.
 */
describe("identityFooterLines", () => {
  it("falls back to the commercial name alone when nothing is configured", () => {
    expect(identityFooterLines()).toEqual(["LibroDigital.pe"]);
    expect(identityFooterLines({})).toEqual(["LibroDigital.pe"]);
    expect(identityFooterLines({ commercialName: "   " })).toEqual(["LibroDigital.pe"]);
  });

  it("prints the legal name and RUC on one line, then the address and the contact block", () => {
    const lines = identityFooterLines({
      commercialName: "LibroDigital.pe",
      legalName: "LibroDigital S.A.C.",
      ruc: "20601234567",
      fiscalAddress: "Av. Ejemplo 123, Miraflores, Lima",
      contactEmail: "hola@librodigital.pe",
      contactPhone: "+51 999 888 777",
      website: "https://librodigital.pe/",
    });

    expect(lines).toEqual([
      "LibroDigital.pe",
      "LibroDigital S.A.C. · RUC 20601234567",
      "Av. Ejemplo 123, Miraflores, Lima",
      "hola@librodigital.pe · +51 999 888 777 · https://librodigital.pe",
    ]);
  });

  it("never repeats the commercial name and never prints an empty line", () => {
    // `getIdentity` defaults legalName to the commercial name: printing both would be
    // noise, and an empty address must not leave a blank line in a document.
    expect(
      identityFooterLines({
        commercialName: "LibroDigital.pe",
        legalName: "LibroDigital.pe",
        fiscalAddress: "  ",
      }),
    ).toEqual(["LibroDigital.pe"]);

    expect(identityFooterLines({ legalName: "Otra S.A.C.", ruc: "20123456789" })).toEqual([
      "LibroDigital.pe",
      "Otra S.A.C. · RUC 20123456789",
    ]);
  });
});
