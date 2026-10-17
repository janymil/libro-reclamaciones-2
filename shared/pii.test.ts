import { describe, expect, it } from "vitest";

import { redactPII, redactPIIList } from "./pii";

describe("redactPII", () => {
  it("masks e-mail, phone and document numbers", () => {
    const text = "Escriba a ana.perez@example.com o al +51 987 654 321. DNI 12345678.";
    const masked = redactPII(text);

    expect(masked).not.toContain("ana.perez@example.com");
    expect(masked).not.toContain("987 654 321");
    expect(masked).not.toContain("12345678");
    expect(masked).toContain("[correo]");
    expect(masked).toContain("[teléfono]");
    expect(masked).toContain("[documento]");
  });

  it("masks long receipt/card numbers", () => {
    expect(redactPII("Comprobante 4565548786654")).toContain("[número]");
  });

  it("leaves normal complaint facts intact", () => {
    const text = "El 5 de octubre compré una licuadora y dejó de encender a los dos días.";
    expect(redactPII(text)).toBe(text);
  });

  it("maps a list", () => {
    expect(redactPIIList(["correo a@b.com", "sin datos"])).toEqual([
      "correo [correo]",
      "sin datos",
    ]);
  });
});
