import { describe, expect, it } from "vitest";

import { detectLanguage, languageName } from "./language";

describe("detectLanguage", () => {
  it("keeps Spanish as the default", () => {
    expect(
      detectLanguage("Compré un producto en la tienda y pido la devolución del dinero."),
    ).toBe("es");
    expect(detectLanguage("El delivery llegó tarde.")).toBe("es");
  });

  it("detects an English complaint", () => {
    expect(
      detectLanguage(
        "I bought a product in the store and I want a refund because it was damaged after two days.",
      ),
    ).toBe("en");
  });

  it("detects a Quechua complaint", () => {
    expect(
      detectLanguage("Ñuqa huk producto rantiy wasi pi, mana allin, kunan willakuy."),
    ).toBe("qu");
  });

  it("does not flip on one borrowed word", () => {
    expect(detectLanguage("El stock del producto estaba mal y pido el cambio.")).toBe("es");
  });

  it("maps languages to prompt names", () => {
    expect(languageName("es")).toBe("español");
    expect(languageName("en")).toBe("inglés");
    expect(languageName("qu")).toBe("quechua");
  });
});
