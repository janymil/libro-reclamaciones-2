import { describe, it, expect } from "vitest";
import { BUSINESS_TYPE_OPTIONS, resolveChannelFit } from "./channel-fit";

/**
 * The Integraciones page shows different guidance per business type, so these
 * two rules must hold: the right guide for each type, and guidance never
 * disappears because of an unknown/missing value.
 */
describe("channel fit by business type", () => {
  it("sends a pure online store to the website guide, not the social one", () => {
    const fit = resolveChannelFit("tienda_virtual");

    expect(fit.showWebLink).toBe(true);
    expect(fit.showSocialChannels).toBe(false);
  });

  it("sends a physical store and a service business to the social guide", () => {
    for (const type of ["local_fisico", "servicios"]) {
      const fit = resolveChannelFit(type);

      expect(fit.showWebLink).toBe(false);
      expect(fit.showSocialChannels).toBe(true);
    }
  });

  it("shows both guides for a mixed business", () => {
    const fit = resolveChannelFit("mixto");

    expect(fit.showWebLink).toBe(true);
    expect(fit.showSocialChannels).toBe(true);
  });

  it("never hides guidance when the type is unknown or missing", () => {
    for (const value of [null, undefined, "", "otro", "TIENDA_VIRTUAL"]) {
      const fit = resolveChannelFit(value);

      expect(fit.showWebLink).toBe(true);
      expect(fit.showSocialChannels).toBe(true);
    }
  });

  it("always carries a headline and a hint for the customer", () => {
    for (const option of BUSINESS_TYPE_OPTIONS) {
      const fit = resolveChannelFit(option.value);

      expect(fit.headline.length).toBeGreaterThan(10);
      expect(fit.hint.length).toBeGreaterThan(30);
    }
  });

  it("covers exactly the types offered at onboarding", () => {
    expect(BUSINESS_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "tienda_virtual",
      "local_fisico",
      "servicios",
      "mixto",
    ]);
    for (const option of BUSINESS_TYPE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(3);
    }
  });
});
