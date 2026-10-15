import { describe, it, expect } from "vitest";

import { apiErrorMessage } from "./queryClient";

/**
 * `apiRequest` rejects with `${status}: ${body}`. That string is perfect for a
 * log and terrible in a toast - the signup form used to show the raw
 * `400: {"message":"El email ya está registrado"}`. These tests pin the
 * unwrapping, including the cases where there is no JSON envelope to unwrap.
 */
describe("apiErrorMessage", () => {
  it("unwraps the server message and drops the status prefix", () => {
    expect(
      apiErrorMessage(new Error('400: {"message":"El email ya está registrado"}')),
    ).toBe("El email ya está registrado");
  });

  it("keeps only the message when the body also carries field errors", () => {
    expect(
      apiErrorMessage(
        new Error('400: {"message":"Datos inválidos","errors":[{"path":["ruc"]}]}'),
      ),
    ).toBe("Datos inválidos");
  });

  it("falls back to the body text when it is not our JSON envelope", () => {
    // A proxy/gateway error page, for instance.
    expect(apiErrorMessage(new Error("502: <html>Bad Gateway</html>"))).toBe(
      "<html>Bad Gateway</html>",
    );
  });

  it("returns the body unchanged when there is no status prefix", () => {
    expect(apiErrorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("never leaks an empty or unparseable message", () => {
    expect(apiErrorMessage(new Error(""))).toBe(
      "No se pudo completar la operación. Intenta nuevamente.",
    );
    expect(apiErrorMessage(new Error('500: {"message":""}'))).toBe(
      "No se pudo completar la operación. Intenta nuevamente.",
    );
    expect(apiErrorMessage("boom")).toBe("No se pudo completar la operación. Intenta nuevamente.");
    expect(apiErrorMessage(undefined)).toBe(
      "No se pudo completar la operación. Intenta nuevamente.",
    );
  });
});
