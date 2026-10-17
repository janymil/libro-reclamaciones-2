import { describe, it, expect } from "vitest";

import type { Business } from "@shared/schema";

import { defaultEstablishmentFor } from "./establishmentProvisioning";

/**
 * The first establishment of a tenant: the "lugar" its first Libro belongs to.
 *
 * Pinned here because the name is what the customer reads everywhere (Libros,
 * Sucursales, the public portal) and it used to be a hard-coded "Casa Matriz":
 * a tenant that named its book "Wong" saw "Casa Matriz" instead - the reported
 * bug.
 */

const business = (overrides: Partial<Business> = {}) =>
  ({
    id: "b1",
    ruc: "20109072177",
    businessName: "CENCOSUD RETAIL PERU S.A.",
    commercialName: "Tienda Wong",
    phone: "999888777",
    address: "Av. Aviación 2405",
    distrito: "San Borja",
    provincia: "Lima",
    departamento: "Lima",
    website: null,
    isActive: true,
    subscriptionPlan: "gratis",
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    planPeriod: "monthly",
    currentPeriodEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Business;

describe("defaultEstablishmentFor", () => {
  it("uses the name the user gave the book", () => {
    const establishment = defaultEstablishmentFor(business(), "local_fisico", "Wong");

    expect(establishment.name).toBe("Wong");
    expect(establishment.address).toBe("Av. Aviación 2405");
    expect(establishment.phone).toBe("999888777");
    expect(establishment.identificationCode).toBe("SUC-001");
  });

  it("falls back to the trading name, then to the razón social", () => {
    expect(defaultEstablishmentFor(business(), "local_fisico").name).toBe("Tienda Wong");
    expect(defaultEstablishmentFor(business({ commercialName: null }), "local_fisico").name)
      .toBe("CENCOSUD RETAIL PERU S.A.");
    // A commercial name of blanks must not win over a real razón social.
    expect(defaultEstablishmentFor(business({ commercialName: "   " }), "local_fisico").name)
      .toBe("CENCOSUD RETAIL PERU S.A.");
  });

  it("keeps the sales channel in the identification code, not in the name", () => {
    const online = defaultEstablishmentFor(business(), "tienda_virtual", "Wong");

    // Selling over the Internet only requires the book to be reachable from that
    // medium, which is what the registry reads the channel for.
    expect(online.identificationCode).toBe("ONLINE-01");
    expect(online.name).toBe("Wong");
  });

  it("never emits an empty name (phone is optional)", () => {
    const establishment = defaultEstablishmentFor(
      business({ businessName: "", commercialName: null, phone: null }),
      "tienda_virtual",
    );

    expect(establishment.name).toBe("Tienda Online");
    expect(establishment.phone).toBeNull();
  });
});

