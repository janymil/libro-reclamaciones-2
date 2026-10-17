import { describe, it, expect } from "vitest";

import type { Business, LibroConfiguration } from "./schema";
import {
  buildBusinessEmailIdentity,
  businessContactLines,
  emailDomain,
  isEmailAddress,
  parseVerifiedDomains,
  sanitizeDisplayName,
  toAbsoluteUrl,
} from "./email-identity";

/**
 * The identity a consumer-facing email carries.
 *
 * The regression pinned here: a Cencosud consumer received a confirmation that
 * looked like it came from the platform, showed no Cencosud data anywhere and
 * could only be answered by replying to the platform. The message must identify
 * the BUSINESS and route replies back to it.
 */

const business = (over: Partial<Business> = {}): Business =>
  ({
    id: "b1",
    ruc: "20109072177",
    businessName: "CENCOSUD RETAIL PERU S.A.",
    commercialName: "Cencosud",
    phone: "+51 1 611 0000",
    address: "Av. Paseo de la República 4675",
    distrito: "Surquillo",
    provincia: "Lima",
    departamento: "Lima",
    website: "https://www.cencosud.com.pe",
    ...over,
  } as Business);

const config = (over: Partial<LibroConfiguration> = {}): LibroConfiguration =>
  ({ notificationEmail: "reclamos@cencosud.com.pe", ...over } as LibroConfiguration);

const sender = {
  platformFromAddress: "no-reply@librodigital.pe",
  platformFromName: "LibroDigital.pe",
  verifiedDomains: ["librodigital.pe"],
};

describe("email identity helpers", () => {
  it("accepts only conservative addresses and domains", () => {
    expect(isEmailAddress("reclamos@cencosud.com.pe")).toBe(true);
    expect(isEmailAddress("a@b.pe")).toBe(true);
    expect(isEmailAddress("Cencosud <x@y.pe>")).toBe(false);
    expect(isEmailAddress("x@y.pe\nBcc: evil@z.pe")).toBe(false);
    expect(isEmailAddress("no-at-sign")).toBe(false);
    expect(isEmailAddress(null)).toBe(false);

    expect(emailDomain("Reclamos@Cencosud.COM.pe")).toBe("cencosud.com.pe");
    expect(emailDomain("nope")).toBe("");

    expect(parseVerifiedDomains("librodigital.pe, @cencosud.com.pe ,")).toEqual([
      "librodigital.pe",
      "cencosud.com.pe",
    ]);
  });

  it("strips CR/LF from a display name (mail-header injection)", () => {
    expect(sanitizeDisplayName("Cencosud\r\nBcc: evil@x.pe")).toBe("Cencosud Bcc: evil@x.pe");
    expect(sanitizeDisplayName("  Cencosud   Retail ")).toBe("Cencosud Retail");
    expect(sanitizeDisplayName("   ")).toBeNull();
  });

  it("builds absolute logo URLs, and never invents one", () => {
    expect(toAbsoluteUrl("/api/public/logos/a.png", "https://librodigital.pe/")).toBe(
      "https://librodigital.pe/api/public/logos/a.png",
    );
    expect(toAbsoluteUrl("https://cdn.x/a.png", "https://librodigital.pe")).toBe("https://cdn.x/a.png");
    expect(toAbsoluteUrl("/api/public/logos/a.png", null)).toBeNull();
    expect(toAbsoluteUrl(null, "https://librodigital.pe")).toBeNull();
  });
});

describe("businessContactLines", () => {
  it("prints the business's own data and never its internal inbox", () => {
    expect(businessContactLines(business(), config())).toEqual([
      "Cencosud · CENCOSUD RETAIL PERU S.A. - RUC 20109072177",
      "Av. Paseo de la República 4675, Surquillo, Lima, Lima",
      "+51 1 611 0000 · https://www.cencosud.com.pe",
    ]);
  });

  it("publishes the reply address only when the business configured one", () => {
    const lines = businessContactLines(business(), config({ emailReplyTo: "atencion@cencosud.com.pe" }));
    expect(lines[2]).toBe("+51 1 611 0000 · atencion@cencosud.com.pe · https://www.cencosud.com.pe");
  });

  it("never emits an empty line", () => {
    expect(businessContactLines({ businessName: "Solo S.A." } as Business, null)).toEqual(["Solo S.A."]);
  });
});

describe("buildBusinessEmailIdentity", () => {
  it("identifies the business even when nothing was configured", () => {
    const identity = buildBusinessEmailIdentity({ business: business(), config: config(), sender });

    expect(identity.fromName).toBe("Cencosud");
    expect(identity.businessName).toBe("Cencosud");
    // The platform address sends it; the display name is the business's.
    expect(identity.fromAddress).toBe("no-reply@librodigital.pe");
    expect(identity.senderStatus).toBe("platform");
    // Replies go to the business, not to the platform.
    expect(identity.replyTo).toBe("reclamos@cencosud.com.pe");
    expect(identity.contactLines[0]).toContain("Cencosud");
  });

  it("falls back to the platform name when the tenant has none", () => {
    const identity = buildBusinessEmailIdentity({
      business: business({ businessName: "   ", commercialName: null }),
      config: config(),
      sender,
    });

    expect(identity.fromName).toBe("LibroDigital.pe");
  });

  it("uses the business's own address only on a verified domain", () => {
    const verified = buildBusinessEmailIdentity({
      business: business(),
      config: config({ emailFromAddress: "reclamos@cencosud.com.pe" }),
      sender: { ...sender, verifiedDomains: ["librodigital.pe", "cencosud.com.pe"] },
    });
    expect(verified.senderStatus).toBe("custom");
    expect(verified.fromAddress).toBe("reclamos@cencosud.com.pe");

    const pending = buildBusinessEmailIdentity({
      business: business(),
      config: config({ emailFromAddress: "reclamos@cencosud.com.pe" }),
      sender,
    });
    expect(pending.senderStatus).toBe("pending_verification");
    expect(pending.fromAddress).toBe("no-reply@librodigital.pe");

    const invalid = buildBusinessEmailIdentity({
      business: business(),
      config: config({ emailFromAddress: "not-an-email" }),
      sender,
    });
    expect(invalid.senderStatus).toBe("invalid");
    expect(invalid.fromAddress).toBe("no-reply@librodigital.pe");
  });

  it("exposes the logo and a validated brand colour", () => {
    const identity = buildBusinessEmailIdentity({
      business: business(),
      config: config({ logoUrl: "/api/public/logos/logo.png", brandColor: "#c02b0a" }),
      sender,
      baseUrl: "https://librodigital.pe",
    });

    expect(identity.logoUrl).toBe("https://librodigital.pe/api/public/logos/logo.png");
    expect(identity.brandColor).toBe("#c02b0a");
  });

  it("drops a brand colour that is not a hex colour", () => {
    const identity = buildBusinessEmailIdentity({
      business: business(),
      config: config({ brandColor: "red; background:url(javascript:alert(1))" }),
      sender,
    });

    expect(identity.brandColor).toBeNull();
    expect(identity.logoUrl).toBeNull();
  });
});
