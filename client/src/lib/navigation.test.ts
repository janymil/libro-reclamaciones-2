import { describe, it, expect } from "vitest";
import {
  PRIMARY_MOBILE_NAV,
  SECONDARY_MOBILE_NAV,
  isPrimaryLocation,
} from "./navigation";

/**
 * The phone navigation is data, so its two structural rules are testable:
 * a five-target bottom bar (four destinations + "Más") and no destination
 * hiding behind nothing.
 */
describe("mobile navigation map", () => {
  it("keeps exactly four primary destinations so the bar has five 320px-safe targets", () => {
    expect(PRIMARY_MOBILE_NAV).toHaveLength(4);
  });

  it("gives every destination a non-empty href and a Material Icons ligature", () => {
    for (const item of [...PRIMARY_MOBILE_NAV, ...SECONDARY_MOBILE_NAV]) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.icon.length).toBeGreaterThan(1);
      expect(item.name.length).toBeGreaterThan(1);
    }
  });

  it("never lists the same destination twice (primary vs sheet)", () => {
    const primaryHrefs = PRIMARY_MOBILE_NAV.map((item) => item.href);
    const secondaryHrefs = SECONDARY_MOBILE_NAV.map((item) => item.href);

    expect(new Set([...primaryHrefs, ...secondaryHrefs]).size)
      .toBe(primaryHrefs.length + secondaryHrefs.length);
  });

  it("covers every app section the sidebar exposes on desktop", () => {
    const required = [
      "/panel", "/reclamos", "/reportes", "/asistente", "/libros",
      "/codigo-qr", "/personalizacion", "/integraciones", "/empresas",
      "/sucursales", "/usuarios", "/perfil", "/plan", "/pagos", "/historial",
    ];
    const known = [...PRIMARY_MOBILE_NAV, ...SECONDARY_MOBILE_NAV].map((item) => item.href);

    for (const href of required) {
      expect(known).toContain(href);
    }
  });

  it("marks a secondary page as not primary, so the Más tab highlights", () => {
    expect(isPrimaryLocation("/panel")).toBe(true);
    expect(isPrimaryLocation("/libros")).toBe(false);
    expect(isPrimaryLocation("/libro/acme")).toBe(false);
  });
});
