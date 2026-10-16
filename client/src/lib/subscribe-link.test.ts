import { describe, it, expect } from "vitest";

import {
  SUBSCRIBE_PATH,
  buildSubscribePath,
  buildSubscribeUrl,
  parseSubscribeQuery,
  safeInternalPath,
} from "./subscribe-link";

/**
 * The shared subscription link is the replacement for the raw Mercado Pago plan
 * links, so it has to be unambiguous: a wrong plan here means a customer is
 * charged for something they did not choose.
 */

describe("buildSubscribePath", () => {
  it("builds the path we hand out to customers", () => {
    expect(buildSubscribePath("profesional", "annual")).toBe(
      `${SUBSCRIBE_PATH}?plan=profesional&periodo=annual`,
    );
  });

  it("covers every plan and both periods without throwing", () => {
    for (const plan of ["gratis", "esencial", "profesional", "corporativo"]) {
      for (const period of ["monthly", "annual"] as const) {
        expect(parseSubscribeQuery(buildSubscribePath(plan, period))).toEqual({ plan, period });
      }
    }
  });

  it("builds an absolute link from an origin, ignoring a trailing slash", () => {
    expect(buildSubscribeUrl("https://librodigital.pe/", "esencial", "monthly")).toBe(
      `https://librodigital.pe${SUBSCRIBE_PATH}?plan=esencial&periodo=monthly`,
    );
  });
});

describe("parseSubscribeQuery", () => {
  it("reads the plan and the period", () => {
    expect(parseSubscribeQuery("?plan=corporativo&periodo=annual")).toEqual({
      plan: "corporativo",
      period: "annual",
    });
  });

  it("defaults to monthly so a short link is not rejected", () => {
    expect(parseSubscribeQuery("?plan=esencial")).toEqual({ plan: "esencial", period: "monthly" });
  });

  it("also accepts the English 'period' spelling", () => {
    expect(parseSubscribeQuery("?plan=profesional&period=annual")).toEqual({
      plan: "profesional",
      period: "annual",
    });
  });

  it("accepts a full link as well as a bare query", () => {
    // The page gets `window.location.search`, but a caller may hand over the whole
    // path or URL; neither should ever produce "this link is not valid".
    expect(parseSubscribeQuery("/suscribir?plan=profesional&periodo=annual")).toEqual({
      plan: "profesional",
      period: "annual",
    });
    expect(parseSubscribeQuery("https://librodigital.pe/suscribir?plan=esencial&periodo=annual")).toEqual({
      plan: "esencial",
      period: "annual",
    });
    expect(parseSubscribeQuery(new URLSearchParams("plan=esencial&periodo=monthly"))).toEqual({
      plan: "esencial",
      period: "monthly",
    });
  });

  it("refuses a plan or a period the catalogue does not have", () => {
    expect(parseSubscribeQuery("?plan=inventado&periodo=annual")).toBeNull();
    expect(parseSubscribeQuery("?plan=esencial&periodo=cada-mes")).toBeNull();
    expect(parseSubscribeQuery("")).toBeNull();
  });

  it("refuses to guess when the plan is missing entirely", () => {
    expect(parseSubscribeQuery("?periodo=annual")).toBeNull();
  });
});

describe("safeInternalPath - open-redirect guard", () => {
  it("allows a same-site path", () => {
    expect(safeInternalPath("/suscribir?plan=esencial&periodo=annual")).toBe(
      "/suscribir?plan=esencial&periodo=annual",
    );
    expect(safeInternalPath("/panel")).toBe("/panel");
  });

  it("rejects anything that would leave the site", () => {
    expect(safeInternalPath("https://sitio-malicioso.example")).toBeNull();
    expect(safeInternalPath("//sitio-malicioso.example")).toBeNull();
    expect(safeInternalPath("/\\sitio-malicioso.example")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects nonsense instead of navigating somewhere unexpected", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
    expect(safeInternalPath("panel")).toBeNull();
  });
});
