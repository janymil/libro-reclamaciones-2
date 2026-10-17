import { describe, expect, it } from "vitest";

import {
  LOCALES_SCENARIOS,
  expectedLocales,
  isLocalesScenario,
  scenarioFor,
  suggestedEstablishmentName,
} from "./locales-plan";

/**
 * The onboarding scenario ("¿Cómo opera tu negocio?").
 *
 * Pinned here because it decides two things that end up in the database: the
 * sales channel of the tenant (which fixes the identification code of its first
 * establishment) and the NAME of that establishment - the label consumers read
 * in "¿dónde ocurrió?" and the one the old form let a chain fill with its book's
 * title.
 */

const wong = { businessName: "CENCOSUD RETAIL PERU S.A.", commercialName: "Tienda Wong" };

describe("suggestedEstablishmentName", () => {
  it("names a single local after the business, as before", () => {
    expect(suggestedEstablishmentName("un_local", wong)).toBe("Tienda Wong");
    expect(suggestedEstablishmentName("un_local", { businessName: "Empresa SAC" })).toBe("Empresa SAC");
  });

  it("says out loud that the first local is the casa matriz", () => {
    // This is the label that tells a chain "the rest go in Sucursales".
    expect(suggestedEstablishmentName("casa_matriz_sucursales", wong)).toBe("Casa Matriz - Tienda Wong");
    expect(suggestedEstablishmentName("casa_matriz_sucursales", { businessName: "  " })).toBe("Casa Matriz");
  });

  it("identifies an online store by its brand", () => {
    expect(suggestedEstablishmentName("solo_online", wong)).toBe("Tienda Online - Tienda Wong");
    expect(suggestedEstablishmentName("solo_online", {})).toBe("Tienda Online");
  });
});

describe("expectedLocales", () => {
  it("leaves a single local and an online store at one", () => {
    expect(expectedLocales("un_local")).toBe(1);
    expect(expectedLocales("solo_online")).toBe(1);
  });

  it("counts the casa matriz inside the total a chain declares", () => {
    // "5 locales" means the 4 sucursales PLUS the casa matriz already created.
    expect(expectedLocales("casa_matriz_sucursales", 5)).toBe(5);
  });

  it("reports 'unknown' instead of inventing a target", () => {
    // The chain scenario with no number, or nonsense typed by the user.
    for (const value of [undefined, null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(expectedLocales("casa_matriz_sucursales", value as number | null | undefined)).toBeNull();
    }
  });

  it("rounds and caps a hand-typed total", () => {
    expect(expectedLocales("casa_matriz_sucursales", 4.6)).toBe(5);
    expect(expectedLocales("casa_matriz_sucursales", 10_000)).toBe(500);
  });
});

describe("scenario lookup", () => {
  it("recognises its own ids and rejects anything else", () => {
    for (const option of LOCALES_SCENARIOS) {
      expect(isLocalesScenario(option.id)).toBe(true);
      expect(scenarioFor(option.id).id).toBe(option.id);
    }

    // Persisted JSON from an older/edited build must not crash the wizard.
    expect(isLocalesScenario("empresa_grande")).toBe(false);
    expect(isLocalesScenario(undefined)).toBe(false);
    expect(scenarioFor("empresa_grande" as never).id).toBe("un_local");
  });

  it("offers a concrete example for every option", () => {
    for (const option of LOCALES_SCENARIOS) {
      expect(option.example.length).toBeGreaterThan(0);
      expect(option.nameLabel.length).toBeGreaterThan(0);
      expect(option.nameHint.length).toBeGreaterThan(0);
    }
  });
});
