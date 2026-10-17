import { describe, it, expect } from "vitest";

import { libroSlugFrom } from "./slug";

/**
 * The public URL of a Libro: `librodigital.pe/<slug>`.
 *
 * One implementation for the wizard (preview), the "Nueva Empresa" form
 * (suggestion) and the server (derivation when the form sends none), so the URL
 * the user sees is the URL that gets stored.
 */
describe("libroSlugFrom", () => {
  it("lowercases and dashes a business name", () => {
    expect(libroSlugFrom("Wong")).toBe("wong");
    expect(libroSlugFrom("Tienda Wong")).toBe("tienda-wong");
    expect(libroSlugFrom("Empresa Demo S.A.C.")).toBe("empresa-demo-s-a-c");
  });

  it("strips accents instead of turning them into dashes", () => {
    // SUNAT's razón social is full of them: "Comercial Ríos" used to come out as
    // "comercial-r-os".
    expect(libroSlugFrom("Comercial Ríos")).toBe("comercial-rios");
    expect(libroSlugFrom("Panadería Ñuñoa")).toBe("panaderia-nunoa");
  });

  it("collapses runs of separators and trims the edges", () => {
    expect(libroSlugFrom("  Wong   &  Cía.  ")).toBe("wong-cia");
    expect(libroSlugFrom("---Wong---")).toBe("wong");
  });

  it("returns an empty string when nothing usable is left", () => {
    // Callers decide the fallback (the route uses "libro").
    expect(libroSlugFrom("···")).toBe("");
  });

  it("never exceeds the 100 characters of the url_slug column", () => {
    expect(libroSlugFrom("a".repeat(250))).toHaveLength(100);
  });
});
